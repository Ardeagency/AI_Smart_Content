const User = require('../models/User');
const { testConnection } = require('../config/database');

// Datos de ejemplo para poblar la base de datos
const sampleUsers = [
  {
    user_id: 'admin_001',
    nombre: 'Administrador',
    apellido: 'Sistema',
    correo: 'admin@ugc.com',
    contrasena: 'admin123',
    telefono: '+1234567890',
    fecha_nacimiento: '1990-01-01',
    genero: 'prefiero_no_decir',
    acceso: 'admin',
    activo: true,
    email_verificado: true,
    marca: 'UGC',
    biografia: 'Administrador principal del sistema UGC',
    pais: 'México',
    ciudad: 'Ciudad de México',
    idioma: 'es',
    tema: 'oscuro'
  },
  {
    user_id: 'user_001',
    nombre: 'Juan',
    apellido: 'Pérez',
    correo: 'juan.perez@ejemplo.com',
    contrasena: 'password123',
    telefono: '+1234567891',
    fecha_nacimiento: '1995-05-15',
    genero: 'masculino',
    acceso: 'usuario',
    activo: true,
    email_verificado: true,
    marca: 'TechCorp',
    biografia: 'Desarrollador web apasionado por la tecnología',
    sitio_web: 'https://juanperez.dev',
    pais: 'México',
    ciudad: 'Guadalajara',
    idioma: 'es',
    tema: 'claro'
  },
  {
    user_id: 'user_002',
    nombre: 'María',
    apellido: 'González',
    correo: 'maria.gonzalez@ejemplo.com',
    contrasena: 'password123',
    telefono: '+1234567892',
    fecha_nacimiento: '1992-08-22',
    genero: 'femenino',
    acceso: 'moderador',
    activo: true,
    email_verificado: true,
    marca: 'DesignStudio',
    biografia: 'Diseñadora UX/UI con experiencia en branding',
    sitio_web: 'https://mariagonzalez.design',
    pais: 'España',
    ciudad: 'Madrid',
    idioma: 'es',
    tema: 'auto'
  },
  {
    user_id: 'user_003',
    nombre: 'Carlos',
    apellido: 'Rodríguez',
    correo: 'carlos.rodriguez@ejemplo.com',
    contrasena: 'password123',
    telefono: '+1234567893',
    fecha_nacimiento: '1988-12-10',
    genero: 'masculino',
    acceso: 'usuario',
    activo: true,
    email_verificado: false,
    marca: 'StartupXYZ',
    biografia: 'Emprendedor y consultor de negocios',
    pais: 'Colombia',
    ciudad: 'Bogotá',
    idioma: 'es',
    tema: 'claro'
  },
  {
    user_id: 'user_004',
    nombre: 'Ana',
    apellido: 'Martínez',
    correo: 'ana.martinez@ejemplo.com',
    contrasena: 'password123',
    telefono: '+1234567894',
    fecha_nacimiento: '1993-03-18',
    genero: 'femenino',
    acceso: 'usuario',
    activo: false,
    email_verificado: true,
    marca: 'CreativeAgency',
    biografia: 'Especialista en marketing digital y redes sociales',
    pais: 'Argentina',
    ciudad: 'Buenos Aires',
    idioma: 'es',
    tema: 'oscuro'
  }
];

// Función para poblar la base de datos
const seedDatabase = async () => {
  try {
    console.log('🌱 Iniciando proceso de seed...');
    
    // Verificar conexión
    const connected = await testConnection();
    if (!connected) {
      throw new Error('No se pudo conectar a la base de datos');
    }

    console.log(`📊 Creando ${sampleUsers.length} usuarios de ejemplo...`);

    for (let i = 0; i < sampleUsers.length; i++) {
      const userData = sampleUsers[i];
      
      try {
        // Verificar si el usuario ya existe
        const existingUser = await User.findByEmail(userData.correo);
        if (existingUser) {
          console.log(`⚠️  Usuario ${userData.correo} ya existe, saltando...`);
          continue;
        }

        const user = await User.create(userData);
        console.log(`✅ Usuario creado: ${user.nombre} ${user.apellido} (${user.correo})`);
      } catch (error) {
        console.error(`❌ Error al crear usuario ${userData.correo}:`, error.message);
      }
    }

    console.log('\n🎉 Proceso de seed completado');
    console.log('\n📋 Usuarios creados:');
    console.log('   - admin@ugc.com (Administrador)');
    console.log('   - juan.perez@ejemplo.com (Usuario)');
    console.log('   - maria.gonzalez@ejemplo.com (Moderador)');
    console.log('   - carlos.rodriguez@ejemplo.com (Usuario)');
    console.log('   - ana.martinez@ejemplo.com (Usuario inactivo)');
    
  } catch (error) {
    console.error('💥 Error durante el seed:', error.message);
    process.exit(1);
  }
};

// Ejecutar seed si se llama directamente
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Proceso de seed finalizado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en el proceso de seed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase, sampleUsers };
