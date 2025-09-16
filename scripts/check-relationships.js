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

// Función para verificar relaciones de la base de datos
const checkRelationships = async () => {
  let client;
  
  try {
    console.log('🔗 Verificando relaciones de la base de datos...\n');
    
    client = await pool.connect();
    
    // 1. Verificar claves foráneas
    console.log('1️⃣ Verificando claves foráneas...');
    const foreignKeys = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.column_name
    `);
    
    console.log('🔑 Claves foráneas encontradas:');
    if (foreignKeys.rows.length === 0) {
      console.log('   ⚠️  No se encontraron claves foráneas');
    } else {
      foreignKeys.rows.forEach(fk => {
        console.log(`   - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      });
    }
    console.log('');
    
    // 2. Verificar integridad referencial
    console.log('2️⃣ Verificando integridad referencial...');
    
    const tables = ['users', 'brands', 'products', 'avatars', 'visual_resources', 'generation_configs', 'generation_results'];
    
    for (const table of tables) {
      try {
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [table]);
        
        if (tableExists.rows[0].exists) {
          const count = await client.query(`SELECT COUNT(*) FROM ${table}`);
          console.log(`   ✅ ${table}: ${count.rows[0].count} registros`);
        } else {
          console.log(`   ❌ ${table}: Tabla no existe`);
        }
      } catch (error) {
        console.log(`   ❌ ${table}: Error al verificar - ${error.message}`);
      }
    }
    console.log('');
    
    // 3. Verificar relaciones específicas
    console.log('3️⃣ Verificando relaciones específicas...');
    
    // Verificar brands → users
    try {
      const orphanBrands = await client.query(`
        SELECT b.id, b.nombre_marca, b.user_id
        FROM brands b
        LEFT JOIN users u ON b.user_id = u.id
        WHERE u.id IS NULL
      `);
      
      if (orphanBrands.rows.length > 0) {
        console.log(`   ⚠️  Marcas huérfanas (sin usuario): ${orphanBrands.rows.length}`);
        orphanBrands.rows.forEach(brand => {
          console.log(`      - ${brand.nombre_marca} (user_id: ${brand.user_id})`);
        });
      } else {
        console.log('   ✅ Marcas: Todas tienen usuario válido');
      }
    } catch (error) {
      console.log(`   ❌ Error verificando brands → users: ${error.message}`);
    }
    
    // Verificar products → brands
    try {
      const orphanProducts = await client.query(`
        SELECT p.id, p.nombre, p.brand_id
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.brand_id IS NOT NULL AND b.id IS NULL
      `);
      
      if (orphanProducts.rows.length > 0) {
        console.log(`   ⚠️  Productos huérfanos (sin marca): ${orphanProducts.rows.length}`);
        orphanProducts.rows.forEach(product => {
          console.log(`      - ${product.nombre} (brand_id: ${product.brand_id})`);
        });
      } else {
        console.log('   ✅ Productos: Todas las referencias a marcas son válidas');
      }
    } catch (error) {
      console.log(`   ❌ Error verificando products → brands: ${error.message}`);
    }
    
    // Verificar avatars → brands
    try {
      const orphanAvatars = await client.query(`
        SELECT a.id, a.nombre, a.brand_id
        FROM avatars a
        LEFT JOIN brands b ON a.brand_id = b.id
        WHERE a.brand_id IS NOT NULL AND b.id IS NULL
      `);
      
      if (orphanAvatars.rows.length > 0) {
        console.log(`   ⚠️  Avatares huérfanos (sin marca): ${orphanAvatars.rows.length}`);
        orphanAvatars.rows.forEach(avatar => {
          console.log(`      - ${avatar.nombre} (brand_id: ${avatar.brand_id})`);
        });
      } else {
        console.log('   ✅ Avatares: Todas las referencias a marcas son válidas');
      }
    } catch (error) {
      console.log(`   ❌ Error verificando avatars → brands: ${error.message}`);
    }
    
    console.log('');
    
    // 4. Verificar índices en claves foráneas
    console.log('4️⃣ Verificando índices en claves foráneas...');
    
    const foreignKeyColumns = [
      { table: 'brands', column: 'user_id' },
      { table: 'products', column: 'user_id' },
      { table: 'products', column: 'brand_id' },
      { table: 'avatars', column: 'user_id' },
      { table: 'avatars', column: 'brand_id' },
      { table: 'visual_resources', column: 'user_id' },
      { table: 'visual_resources', column: 'brand_id' },
      { table: 'generation_configs', column: 'user_id' },
      { table: 'generation_configs', column: 'brand_id' },
      { table: 'generation_results', column: 'user_id' },
      { table: 'generation_results', column: 'brand_id' },
      { table: 'generation_results', column: 'product_id' },
      { table: 'generation_results', column: 'avatar_id' },
      { table: 'generation_results', column: 'generation_config_id' }
    ];
    
    for (const fk of foreignKeyColumns) {
      try {
        const hasIndex = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE tablename = $1 
            AND indexdef LIKE '%' || $2 || '%'
          )
        `, [fk.table, fk.column]);
        
        if (hasIndex.rows[0].exists) {
          console.log(`   ✅ ${fk.table}.${fk.column}: Tiene índice`);
        } else {
          console.log(`   ⚠️  ${fk.table}.${fk.column}: Sin índice (recomendado para rendimiento)`);
        }
      } catch (error) {
        console.log(`   ❌ Error verificando índice en ${fk.table}.${fk.column}: ${error.message}`);
      }
    }
    console.log('');
    
    // 5. Verificar restricciones de integridad
    console.log('5️⃣ Verificando restricciones de integridad...');
    
    const checkConstraints = await client.query(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.check_constraints cc
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type IN ('CHECK', 'UNIQUE', 'PRIMARY KEY')
      ORDER BY tc.table_name, tc.constraint_type
    `);
    
    console.log('🔒 Restricciones de integridad:');
    if (checkConstraints.rows.length === 0) {
      console.log('   ⚠️  No se encontraron restricciones de integridad');
    } else {
      checkConstraints.rows.forEach(constraint => {
        console.log(`   - ${constraint.table_name}.${constraint.constraint_name} (${constraint.constraint_type})`);
        if (constraint.check_clause) {
          console.log(`     Condición: ${constraint.check_clause}`);
        }
      });
    }
    console.log('');
    
    // 6. Resumen de salud de la base de datos
    console.log('6️⃣ Resumen de salud de la base de datos...');
    
    const healthChecks = {
      tables: 0,
      foreignKeys: 0,
      indexes: 0,
      constraints: 0
    };
    
    // Contar tablas
    const tableCount = await client.query(`
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    healthChecks.tables = parseInt(tableCount.rows[0].count);
    
    // Contar claves foráneas
    healthChecks.foreignKeys = foreignKeys.rows.length;
    
    // Contar índices
    const indexCount = await client.query(`
      SELECT COUNT(*) FROM pg_indexes 
      WHERE schemaname = 'public'
    `);
    healthChecks.indexes = parseInt(indexCount.rows[0].count);
    
    // Contar restricciones
    healthChecks.constraints = checkConstraints.rows.length;
    
    console.log('📊 Resumen:');
    console.log(`   - Tablas: ${healthChecks.tables}`);
    console.log(`   - Claves foráneas: ${healthChecks.foreignKeys}`);
    console.log(`   - Índices: ${healthChecks.indexes}`);
    console.log(`   - Restricciones: ${healthChecks.constraints}`);
    
    // Evaluación general
    const score = (healthChecks.tables > 0 ? 25 : 0) +
                  (healthChecks.foreignKeys > 0 ? 25 : 0) +
                  (healthChecks.indexes > 0 ? 25 : 0) +
                  (healthChecks.constraints > 0 ? 25 : 0);
    
    console.log(`\n🏆 Puntuación de salud: ${score}/100`);
    
    if (score >= 90) {
      console.log('   🟢 Excelente: La base de datos está bien estructurada');
    } else if (score >= 70) {
      console.log('   🟡 Buena: La base de datos está bien, pero puede mejorarse');
    } else if (score >= 50) {
      console.log('   🟠 Regular: La base de datos necesita mejoras');
    } else {
      console.log('   🔴 Crítica: La base de datos necesita atención urgente');
    }
    
    console.log('\n✅ Verificación de relaciones completada');
    
  } catch (error) {
    console.error('❌ Error durante la verificación:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
};

// Ejecutar verificación si se llama directamente
if (require.main === module) {
  checkRelationships()
    .then(() => {
      console.log('🏁 Verificación finalizada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = { checkRelationships };
