const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ugc_studio',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

async function populateFictitiousData() {
  try {
    console.log('🔄 Poblando base de datos con datos ficticios...');

    // Crear usuario ficticio
    const userResult = await pool.query(`
      INSERT INTO users (user_id, nombre, apellido, telefono, correo, contrasena, rol, preferencias_generales, sector, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (correo) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        apellido = EXCLUDED.apellido,
        telefono = EXCLUDED.telefono
      RETURNING id
    `, [
      'user_001',
      'Olivia',
      'Rhye',
      '+1-555-0123',
      'olivia@example.com',
      '$2b$10$example.hash', // Hash ficticio
      'usuario_normal',
      JSON.stringify({ idioma: 'es', tema: 'oscuro' }),
      'Tecnología',
      true
    ]);

    const userId = userResult.rows[0].id;
    console.log(`✅ Usuario creado con ID: ${userId}`);

    // Crear marca ficticia
    const brandResult = await pool.query(`
      INSERT INTO brands (user_id, nombre_marca, nicho_principal, subnicho, categorias_asociadas, 
                         publico_objetivo, mercado_sector, logo_url, eslogan, paleta_colores, 
                         tipografias, identidad_proposito, personalidad_atributos, 
                         tono_comunicacion, storytelling_filosofia, archivos_adicionales, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
    `, [
      userId,
      'TechFlow Solutions',
      'Tecnología',
      'Software Empresarial',
      ['B2B', 'SaaS', 'Enterprise'],
      'Profesionales de 25-45 años interesados en tecnología y productividad',
      'Empresarial',
      null,
      'Innovación que transforma tu negocio',
      JSON.stringify(['#FD624F', '#000000', '#FFFFFF', '#808080']),
      JSON.stringify(['Inter', 'Helvetica']),
      'Marca innovadora enfocada en tecnología y creatividad. Nuestro objetivo es simplificar procesos complejos y hacer la tecnología accesible para todos.',
      ['Profesional', 'Innovador', 'Accesible', 'Confiable'],
      'Profesional',
      'Transformamos ideas en soluciones tecnológicas innovadoras que impulsan el crecimiento empresarial.',
      JSON.stringify([]),
      true
    ]);

    const brandId = brandResult.rows[0].id;
    console.log(`✅ Marca creada con ID: ${brandId}`);

    // Crear productos ficticios
    const products = [
      {
        user_id: userId,
        brand_id: brandId,
        nombre: 'iPhone 15 Pro',
        descripcion_corta: 'Smartphone premium con cámara profesional',
        descripcion_larga: 'El iPhone 15 Pro redefine la experiencia móvil con su sistema de cámara Pro avanzado, chip A17 Pro y diseño de titanio ultraligero.',
        tipo: 'producto',
        categoria: 'Tecnología',
        imagen_principal_url: null,
        galeria_imagenes: [],
        archivos_asociados: [],
        atributos_clave: {
          procesador: 'A17 Pro',
          almacenamiento: '128GB, 256GB, 512GB, 1TB',
          camara: 'Sistema de triple cámara Pro',
          pantalla: '6.1 pulgadas Super Retina XDR'
        },
        activo: true
      },
      {
        user_id: userId,
        brand_id: brandId,
        nombre: 'Curso de Marketing Digital',
        descripcion_corta: 'Aprende estrategias de marketing online',
        descripcion_larga: 'Curso completo de marketing digital que cubre SEO, SEM, redes sociales, email marketing y analytics para impulsar tu negocio online.',
        tipo: 'servicio',
        categoria: 'Educación',
        imagen_principal_url: null,
        galeria_imagenes: [],
        archivos_asociados: [],
        atributos_clave: {
          duracion: '40 horas',
          modalidad: 'Online',
          certificado: 'Sí',
          nivel: 'Intermedio'
        },
        activo: true
      }
    ];

    for (const product of products) {
      await pool.query(`
        INSERT INTO products (user_id, brand_id, nombre, descripcion_corta, descripcion_larga, 
                             tipo, categoria, imagen_principal_url, galeria_imagenes, archivos_asociados, 
                             atributos_clave, activo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        product.user_id,
        product.brand_id,
        product.nombre,
        product.descripcion_corta,
        product.descripcion_larga,
        product.tipo,
        product.categoria,
        product.imagen_principal_url,
        JSON.stringify(product.galeria_imagenes),
        JSON.stringify(product.archivos_asociados),
        JSON.stringify(product.atributos_clave),
        product.activo
      ]);
    }
    console.log(`✅ Productos creados`);

    // Crear avatares ficticios
    const avatars = [
      {
        user_id: userId,
        brand_id: brandId,
        nombre: 'Sarah Chen',
        descripcion_personalidad: 'Ejecutiva profesional y confiable',
        imagen_referencia_url: 'https://i.pravatar.cc/120?u=avatar1',
        estilo_visual: 'realista',
        roles: ['Ejecutiva', 'Consultora'],
        activo: true
      },
      {
        user_id: userId,
        brand_id: brandId,
        nombre: 'Marcus Johnson',
        descripcion_personalidad: 'Chef creativo y apasionado',
        imagen_referencia_url: 'https://i.pravatar.cc/120?u=avatar2',
        estilo_visual: 'realista',
        roles: ['Chef', 'Influencer'],
        activo: true
      }
    ];

    for (const avatar of avatars) {
      await pool.query(`
        INSERT INTO avatars (user_id, brand_id, nombre, descripcion_personalidad, 
                            imagen_referencia_url, estilo_visual, roles, activo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        avatar.user_id,
        avatar.brand_id,
        avatar.nombre,
        avatar.descripcion_personalidad,
        avatar.imagen_referencia_url,
        avatar.estilo_visual,
        avatar.roles,
        avatar.activo
      ]);
    }
    console.log(`✅ Avatares creados`);

    console.log('🎉 Base de datos poblada exitosamente con datos ficticios');
    
  } catch (error) {
    console.error('❌ Error poblando la base de datos:', error);
  } finally {
    await pool.end();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  populateFictitiousData();
}

module.exports = { populateFictitiousData };
