const { testConnection } = require('../config/database');

// Script simple para probar la conexión
const testDBConnection = async () => {
  console.log('🔌 Probando conexión a la base de datos...\n');
  
  try {
    const connected = await testConnection();
    
    if (connected) {
      console.log('✅ Conexión exitosa');
      console.log('📊 La base de datos está disponible y funcionando correctamente');
      process.exit(0);
    } else {
      console.log('❌ Error de conexión');
      console.log('🔧 Verifica la configuración en el archivo .env');
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Error inesperado:', error.message);
    console.error('🔧 Verifica que PostgreSQL esté ejecutándose y la configuración sea correcta');
    process.exit(1);
  }
};

testDBConnection();
