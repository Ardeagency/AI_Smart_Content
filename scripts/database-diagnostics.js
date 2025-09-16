const { Pool } = require('pg');
require('dotenv').config();

// Configuración de la base de datos
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ugc_users',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Función para ejecutar consultas de diagnóstico
const runDiagnostics = async () => {
  let client;
  
  try {
    console.log('🔍 Iniciando diagnóstico de base de datos...\n');
    
    // 1. Probar conexión básica
    console.log('1️⃣ Probando conexión básica...');
    client = await pool.connect();
    console.log('✅ Conexión establecida correctamente\n');
    
    // 2. Verificar información de la base de datos
    console.log('2️⃣ Información de la base de datos...');
    const dbInfo = await client.query(`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as postgresql_version,
        inet_server_addr() as server_address,
        inet_server_port() as server_port
    `);
    
    console.log('📊 Información de la base de datos:');
    console.log(`   - Base de datos: ${dbInfo.rows[0].database_name}`);
    console.log(`   - Usuario actual: ${dbInfo.rows[0].current_user}`);
    console.log(`   - Versión PostgreSQL: ${dbInfo.rows[0].postgresql_version}`);
    console.log(`   - Servidor: ${dbInfo.rows[0].server_address || 'localhost'}:${dbInfo.rows[0].server_port || '5432'}\n`);
    
    // 3. Verificar tablas existentes
    console.log('3️⃣ Verificando tablas existentes...');
    const tables = await client.query(`
      SELECT 
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📋 Tablas encontradas:');
    if (tables.rows.length === 0) {
      console.log('   ⚠️  No se encontraron tablas en la base de datos');
    } else {
      tables.rows.forEach(table => {
        console.log(`   - ${table.table_name} (${table.table_type})`);
      });
    }
    console.log('');
    
    // 4. Verificar estructura de la tabla users
    if (tables.rows.some(t => t.table_name === 'users')) {
      console.log('4️⃣ Verificando estructura de la tabla users...');
      const userColumns = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        ORDER BY ordinal_position
      `);
      
      console.log('🏗️  Estructura de la tabla users:');
      userColumns.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
      console.log('');
    }
    
    // 5. Verificar índices
    console.log('5️⃣ Verificando índices...');
    const indexes = await client.query(`
      SELECT 
        indexname,
        tablename,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    
    console.log('🔍 Índices encontrados:');
    if (indexes.rows.length === 0) {
      console.log('   ⚠️  No se encontraron índices');
    } else {
      indexes.rows.forEach(index => {
        console.log(`   - ${index.indexname} en ${index.tablename}`);
      });
    }
    console.log('');
    
    // 6. Verificar restricciones (constraints)
    console.log('6️⃣ Verificando restricciones...');
    const constraints = await client.query(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_type
    `);
    
    console.log('🔒 Restricciones encontradas:');
    if (constraints.rows.length === 0) {
      console.log('   ⚠️  No se encontraron restricciones');
    } else {
      const groupedConstraints = constraints.rows.reduce((acc, constraint) => {
        const key = `${constraint.table_name}.${constraint.constraint_name}`;
        if (!acc[key]) {
          acc[key] = {
            table: constraint.table_name,
            name: constraint.constraint_name,
            type: constraint.constraint_type,
            columns: []
          };
        }
        acc[key].columns.push(constraint.column_name);
        return acc;
      }, {});
      
      Object.values(groupedConstraints).forEach(constraint => {
        console.log(`   - ${constraint.table}.${constraint.name} (${constraint.type}): ${constraint.columns.join(', ')}`);
      });
    }
    console.log('');
    
    // 7. Verificar triggers
    console.log('7️⃣ Verificando triggers...');
    const triggers = await client.query(`
      SELECT 
        trigger_name,
        event_object_table,
        action_timing,
        event_manipulation
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name
    `);
    
    console.log('⚡ Triggers encontrados:');
    if (triggers.rows.length === 0) {
      console.log('   ⚠️  No se encontraron triggers');
    } else {
      triggers.rows.forEach(trigger => {
        console.log(`   - ${trigger.trigger_name} en ${trigger.event_object_table} (${trigger.action_timing} ${trigger.event_manipulation})`);
      });
    }
    console.log('');
    
    // 8. Verificar funciones
    console.log('8️⃣ Verificando funciones...');
    const functions = await client.query(`
      SELECT 
        routine_name,
        routine_type,
        data_type
      FROM information_schema.routines 
      WHERE routine_schema = 'public'
      ORDER BY routine_name
    `);
    
    console.log('🔧 Funciones encontradas:');
    if (functions.rows.length === 0) {
      console.log('   ⚠️  No se encontraron funciones');
    } else {
      functions.rows.forEach(func => {
        console.log(`   - ${func.routine_name} (${func.routine_type}): ${func.data_type}`);
      });
    }
    console.log('');
    
    // 9. Verificar estadísticas de conexión
    console.log('9️⃣ Estadísticas de conexión...');
    const connectionStats = await client.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    
    console.log('📊 Estadísticas de conexión:');
    console.log(`   - Conexiones totales: ${connectionStats.rows[0].total_connections}`);
    console.log(`   - Conexiones activas: ${connectionStats.rows[0].active_connections}`);
    console.log(`   - Conexiones inactivas: ${connectionStats.rows[0].idle_connections}\n`);
    
    // 10. Verificar configuración del pool
    console.log('🔟 Configuración del pool de conexiones...');
    console.log('⚙️  Configuración actual:');
    console.log(`   - Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   - Puerto: ${process.env.DB_PORT || 5432}`);
    console.log(`   - Base de datos: ${process.env.DB_NAME || 'ugc_users'}`);
    console.log(`   - Usuario: ${process.env.DB_USER || 'postgres'}`);
    console.log(`   - Máximo de conexiones: 20`);
    console.log(`   - Timeout de conexión: 2000ms`);
    console.log(`   - Timeout de inactividad: 30000ms\n`);
    
    // 11. Prueba de rendimiento básica
    console.log('1️⃣1️⃣ Prueba de rendimiento básica...');
    const startTime = Date.now();
    
    // Ejecutar una consulta simple varias veces
    for (let i = 0; i < 5; i++) {
      await client.query('SELECT 1 as test');
    }
    
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / 5;
    
    console.log(`⚡ Tiempo promedio de consulta: ${avgTime.toFixed(2)}ms`);
    console.log(`📈 Rendimiento: ${avgTime < 10 ? 'Excelente' : avgTime < 50 ? 'Bueno' : 'Necesita optimización'}\n`);
    
    console.log('✅ Diagnóstico completado exitosamente');
    
  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
};

// Ejecutar diagnóstico si se llama directamente
if (require.main === module) {
  runDiagnostics()
    .then(() => {
      console.log('🏁 Diagnóstico finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { runDiagnostics };
