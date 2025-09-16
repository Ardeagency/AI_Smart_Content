const fs = require('fs');
const path = require('path');
const { query, testConnection } = require('../config/database');

// Función para ejecutar migraciones
const runMigrations = async () => {
  try {
    console.log('🚀 Iniciando migraciones de base de datos...');
    
    // Probar conexión
    const connected = await testConnection();
    if (!connected) {
      throw new Error('No se pudo conectar a la base de datos');
    }

    // Leer archivos de migración en orden
    const migrationsDir = path.join(__dirname);
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`📁 Encontradas ${migrationFiles.length} migraciones`);

    for (const file of migrationFiles) {
      console.log(`\n📄 Ejecutando migración: ${file}`);
      
      const migrationPath = path.join(migrationsDir, file);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await query(migrationSQL);
        console.log(`✅ Migración ${file} ejecutada correctamente`);
      } catch (error) {
        console.error(`❌ Error en migración ${file}:`, error.message);
        throw error;
      }
    }

    console.log('\n🎉 Todas las migraciones se ejecutaron correctamente');
    
  } catch (error) {
    console.error('💥 Error durante las migraciones:', error.message);
    process.exit(1);
  }
};

// Ejecutar migraciones si se llama directamente
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✅ Proceso de migración completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en el proceso de migración:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
