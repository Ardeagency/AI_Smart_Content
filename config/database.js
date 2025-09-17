require('dotenv').config();

// Configuración de la base de datos - Solo Supabase
const { supabase, testConnection: testSupabaseConnection } = require('./supabase');
const supabaseClient = supabase;

// Pool dummy para compatibilidad con código existente
const pool = {
  connect: async () => ({ release: () => {} }),
  query: async () => ({ rows: [], rowCount: 0 }),
  end: async () => {}
};

// Función para probar la conexión
const testConnection = async () => {
  try {
    // Probar conexión a Supabase
    return await testSupabaseConnection();
  } catch (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    return false;
  }
};

// Función para ejecutar consultas
const query = async (text, params) => {
  const start = Date.now();
  try {
    // Usar Supabase para consultas
    const { query: supabaseQuery } = require('./supabase');
    const res = await supabaseQuery(text, params);
    const duration = Date.now() - start;
    console.log('Query ejecutada (Supabase)', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
};

module.exports = {
  pool,
  query,
  testConnection,
  supabaseClient
};
