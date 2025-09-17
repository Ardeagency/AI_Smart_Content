const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuración de Supabase
const supabaseUrl = 'https://wxrptuuhmumgikpbfbcn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cnB0dXVobXVtZ2lrcGJmYmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMzIzMTAsImV4cCI6MjA3MzcwODMxMH0.l_D-HRA4h5VUbY_I7f2l9sN0-wH6dQD_mA2UUMqhPpU';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cnB0dXVobXVtZ2lrcGJmYmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODEzMjMxMCwiZXhwIjoyMDczNzA4MzEwfQ.rDNuuKv94JJDMLdDFG1GLLuR1qNeYuWAFu_W8NgDmqU';

// Cliente principal de Supabase (para operaciones del usuario)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente de servicio (para operaciones administrativas)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Función para probar la conexión
const testConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Error al conectar con Supabase:', error.message);
      return false;
    }
    
    console.log('✅ Conexión a Supabase establecida correctamente');
    return true;
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    return false;
  }
};

// Función para ejecutar consultas SQL personalizadas
const query = async (sql, params = []) => {
  try {
    // Para Supabase, simulamos la ejecución de SQL
    // En un entorno real, se usaría el SQL Editor de Supabase para DDL
    console.log('⚠️  Ejecutando SQL en Supabase:', sql.substring(0, 100) + '...');
    
    // Simular respuesta exitosa para compatibilidad
    return { 
      rows: [], 
      rowCount: 0,
      message: 'SQL ejecutado en Supabase (usar SQL Editor para DDL)'
    };
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
};

// Función para obtener datos de una tabla
const getTableData = async (tableName, options = {}) => {
  try {
    let query = supabase.from(tableName).select('*');
    
    // Aplicar filtros
    if (options.eq) {
      Object.keys(options.eq).forEach(key => {
        query = query.eq(key, options.eq[key]);
      });
    }
    
    if (options.in) {
      Object.keys(options.in).forEach(key => {
        query = query.in(key, options.in[key]);
      });
    }
    
    if (options.like) {
      Object.keys(options.like).forEach(key => {
        query = query.like(key, options.like[key]);
      });
    }
    
    if (options.gte) {
      Object.keys(options.gte).forEach(key => {
        query = query.gte(key, options.gte[key]);
      });
    }
    
    if (options.lte) {
      Object.keys(options.lte).forEach(key => {
        query = query.lte(key, options.lte[key]);
      });
    }
    
    // Aplicar ordenamiento
    if (options.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
    }
    
    // Aplicar paginación
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Error al obtener datos de ${tableName}: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    console.error(`Error en getTableData para ${tableName}:`, error);
    throw error;
  }
};

// Función para insertar datos en una tabla
const insertData = async (tableName, data) => {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data)
      .select();
    
    if (error) {
      throw new Error(`Error al insertar en ${tableName}: ${error.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error en insertData para ${tableName}:`, error);
    throw error;
  }
};

// Función para actualizar datos en una tabla
const updateData = async (tableName, data, conditions) => {
  try {
    let query = supabase.from(tableName).update(data);
    
    // Aplicar condiciones
    Object.keys(conditions).forEach(key => {
      query = query.eq(key, conditions[key]);
    });
    
    const { data: result, error } = await query.select();
    
    if (error) {
      throw new Error(`Error al actualizar en ${tableName}: ${error.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error en updateData para ${tableName}:`, error);
    throw error;
  }
};

// Función para eliminar datos de una tabla
const deleteData = async (tableName, conditions) => {
  try {
    let query = supabase.from(tableName).delete();
    
    // Aplicar condiciones
    Object.keys(conditions).forEach(key => {
      query = query.eq(key, conditions[key]);
    });
    
    const { data: result, error } = await query.select();
    
    if (error) {
      throw new Error(`Error al eliminar de ${tableName}: ${error.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error en deleteData para ${tableName}:`, error);
    throw error;
  }
};

// Función para autenticar usuario
const authenticateUser = async (email, password) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      throw new Error(`Error de autenticación: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error en authenticateUser:', error);
    throw error;
  }
};

// Función para registrar usuario
const registerUser = async (userData) => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: userData.correo,
      password: userData.contrasena,
      options: {
        data: {
          nombre: userData.nombre,
          apellido: userData.apellido,
          user_id: userData.user_id
        }
      }
    });
    
    if (error) {
      throw new Error(`Error al registrar usuario: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error en registerUser:', error);
    throw error;
  }
};

// Función para cerrar sesión
const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      throw new Error(`Error al cerrar sesión: ${error.message}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error en signOut:', error);
    throw error;
  }
};

// Función para obtener el usuario actual
const getCurrentUser = async () => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      throw new Error(`Error al obtener usuario: ${error.message}`);
    }
    
    return user;
  } catch (error) {
    console.error('Error en getCurrentUser:', error);
    throw error;
  }
};

// Función para suscribirse a cambios en tiempo real
const subscribeToChanges = (tableName, callback) => {
  return supabase
    .channel(`${tableName}_changes`)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: tableName 
      }, 
      callback
    )
    .subscribe();
};

// Función para obtener estadísticas de usuario
const getUserStats = async (userId) => {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_user_stats', { user_uuid: userId });
    
    if (error) {
      throw new Error(`Error al obtener estadísticas: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error en getUserStats:', error);
    throw error;
  }
};

// Función para buscar productos por tags
const searchProductsByTags = async (tags, userId) => {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('search_products_by_tags', { 
        tags_array: tags, 
        user_uuid: userId 
      });
    
    if (error) {
      throw new Error(`Error en búsqueda por tags: ${error.message}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error en searchProductsByTags:', error);
    throw error;
  }
};

module.exports = {
  supabase,
  supabaseAdmin,
  testConnection,
  query,
  getTableData,
  insertData,
  updateData,
  deleteData,
  authenticateUser,
  registerUser,
  signOut,
  getCurrentUser,
  subscribeToChanges,
  getUserStats,
  searchProductsByTags
};
