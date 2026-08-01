/**
 * keepAlive.js – v0.6.3
 *
 * Keep-Alive System für TGShopBot auf Render.com Free Tier.
 *
 * ─── PROBLEM: RENDER SIGTERM NACH NEUSTART ────────────────────────────────
 * Render.com sendet SIGTERM in zwei Fällen:
 *   1. Bei Deploys (erwartet, unkritisch)
 *   2. Wenn der Dienst nach einem Neustart nicht schnell genug als "aktiv"
 *      erkannt wird → Render skaliert ihn sofort wieder herunter.
 *
 * Das passiert weil nach einem Neustart der erste UptimeRobot-Ping bis zu
 * 5 Minuten auf sich warten lässt. In dieser Zeit sieht Render keinen
 * eingehenden Traffic → Cold Start → SIGTERM.
 *
 * ─── LÖSUNG v0.6.3 ────────────────────────────────────────────────────────
 * 1. SOFORT-PING beim Start: Sobald der Bot läuft, pingt er sich selbst.
 *    Das signalisiert Render sofort Aktivität, ohne auf UptimeRobot zu warten.
 *
 * 2. SELF-PING alle 4 Minuten: Hält den Container aktiv (< 5min Grenze).
 *    UptimeRobot dient als externe Absicherung, ist aber nicht mehr alleinig.
 *
 * 3. TELEGRAM HEARTBEAT alle 4 Minuten: Echte Telegram-Ausfälle erkennen.
 *    3x hintereinander fehlgeschlagen → process.exit(1) für Container-Restart.
 *
 * Kein Update-Watchdog. Keine falschen Neustarts bei inaktiven Nächten.
 */

const http  = require('http');
const https = require('https');

// ─── KONFIGURATION ────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 4 * 60 * 1000;   // 4min – Telegram API Check
const SELF_PING_INTERVAL = 4 * 60 * 1000;   // 4min – Render Cold-Start Prevention
const MAX_FAILURES       = 3;                // 3x Heartbeat fehlt → Neustart

// ─── STATE ────────────────────────────────────────────────────────────────

let bot             = null;
let heartbeatTimer  = null;
let selfPingTimer   = null;
let failureCount    = 0;
let lastHeartbeat   = Date.now();
let totalHeartbeats = 0;
const startTime     = Date.now();

// ─── HEARTBEAT: Telegram API Connectivity Check ───────────────────────────

const heartbeat = async () => {
    try {
        await bot.telegram.getMe();
        failureCount  = 0;
        lastHeartbeat = Date.now();
        totalHeartbeats++;
    } catch (error) {
        failureCount++;
        console.error(
            `[KeepAlive] Heartbeat fehlgeschlagen (${failureCount}/${MAX_FAILURES}): ${error.message}`
        );
        if (failureCount >= MAX_FAILURES) {
            console.error(
                `[KeepAlive] ⛔ ${MAX_FAILURES}x Heartbeat fehlgeschlagen → ` +
                `Prozess wird beendet für Container-Restart`
            );
            setTimeout(() => process.exit(1), 1000);
        }
    }
};

// ─── SELF-PING: Render Cold-Start Prevention ──────────────────────────────

const selfPing = () => {
    const url = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
    if (!url) return;

    const pingUrl = url.replace(/\/$/, '') + '/health';
    const client  = pingUrl.startsWith('https') ? https : http;

    const req = client.get(pingUrl, (res) => {
        res.resume(); // Response konsumieren → kein Memory Leak
    });
    req.on('error', () => { /* Self-Ping Fehler sind nicht kritisch */ });
    req.setTimeout(10000, () => req.destroy());
};

// ─── HEALTH STATUS ────────────────────────────────────────────────────────

const formatUptime = (totalSeconds) => {
    const days    = Math.floor(totalSeconds / 86400);
    const hours   = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days  > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const getHealthStatus = () => {
    const now           = Date.now();
    const uptimeSeconds = Math.floor((now - startTime) / 1000);
    const heartbeatAge  = now - lastHeartbeat;

    return {
        healthy:       failureCount < MAX_FAILURES,
        uptime:        formatUptime(uptimeSeconds),
        lastHeartbeat: `${Math.floor(heartbeatAge / 1000)}s ago`,
        heartbeats:    totalHeartbeats,
        failures:      failureCount,
        status:        failureCount < MAX_FAILURES ? 'Bot is running' : 'Bot may be unresponsive'
    };
};

// ─── HTTP SERVER ──────────────────────────────────────────────────────────

const createServer = (port) => {
    const server = http.createServer((req, res) => {
        const status     = getHealthStatus();
        const statusCode = status.healthy ? 200 : 503;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`[KeepAlive] Health-Server auf Port ${port}`);
    });

    return server;
};

// ─── START / STOP ─────────────────────────────────────────────────────────

const start = (botInstance) => {
    bot = botInstance;

    // Heartbeat starten
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    heartbeat(); // Sofort einmal prüfen

    // Self-Ping starten – sofort + alle 4 Minuten
    if (process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL) {
        selfPing(); // Sofortiger Ping nach Neustart → signalisiert Render Aktivität
        selfPingTimer = setInterval(selfPing, SELF_PING_INTERVAL);
        console.log(`[KeepAlive] Self-Ping aktiv – sofortiger Start-Ping gesendet, danach alle ${SELF_PING_INTERVAL / 60000}min`);
    } else {
        console.log(`[KeepAlive] Self-Ping deaktiviert (RENDER_EXTERNAL_URL nicht gesetzt)`);
    }

    console.log(
        `[KeepAlive] Watchdog v0.6.3 gestartet ` +
        `(Heartbeat: ${HEARTBEAT_INTERVAL / 60000}min, MaxFailures: ${MAX_FAILURES})`
    );
};

const stop = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (selfPingTimer)  clearInterval(selfPingTimer);
    console.log('[KeepAlive] Watchdog gestoppt.');
};

// notifyUpdate als leere Stub-Funktion (rückwärtskompatibel mit index.js)
const notifyUpdate = () => {};

module.exports = {
    createServer,
    start,
    stop,
    notifyUpdate,
    getHealthStatus
};
