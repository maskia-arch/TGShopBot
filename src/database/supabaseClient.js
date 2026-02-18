const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabaseUrl = config.SUPABASE_URL;
const supabaseKey = config.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
