/**
 * SupabaseService - Servicio centralizado para acceso a Supabase
 * Wrapper sobre app-loader y supabase-client para acceso unificado
 */
class SupabaseService {
  constructor() {
    this.client = null;
    this.ready = false;
    this.initPromise = null;
  }

  /**
   * Inicializar el servicio
   */
  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.ready && this.client) {
      return this.client;
    }

    this.initPromise = this.initializeClient();
    return this.initPromise;
  }

  /**
   * Inicializar cliente de Supabase
   */
  async initializeClient() {
    try {
      // Prioridad 1: Usar app-loader (recomendado)
      if (typeof window.appLoader !== 'undefined' && window.appLoader.waitFor) {
        this.client = await window.appLoader.waitFor();
        if (this.client) {
          this.ready = true;
          window.supabase = this.client; // Mantener compatibilidad global
          return this.client;
        }
      }

      // Prioridad 2: Usar supabase-client existente
      if (typeof window.waitForSupabase === 'function') {
        this.client = await window.waitForSupabase();
        if (this.client) {
          this.ready = true;
          window.supabase = this.client;
          return this.client;
        }
      }

      // Prioridad 3: Usar supabase global si ya existe
      if (window.supabase && typeof window.supabase.from === 'function') {
        this.client = window.supabase;
        this.ready = true;
        return this.client;
      }

      // Prioridad 4: Crear cliente desde configuración
      if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
        this.client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        this.ready = true;
        window.supabase = this.client;
        return this.client;
      }

      console.error('❌ No se pudo inicializar Supabase');
      return null;
    } catch (error) {
      console.error('❌ Error inicializando Supabase:', error);
      return null;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Obtener cliente de Supabase
   */
  async getClient() {
    if (this.ready && this.client) {
      return this.client;
    }

    return await this.init();
  }

  /**
   * Esperar a que Supabase esté listo
   */
  async waitForReady(timeout = 10000) {
    if (this.ready && this.client) {
      return this.client;
    }

    return await Promise.race([
      this.init(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout esperando Supabase')), timeout)
      )
    ]);
  }

  /**
   * Verificar si Supabase está listo
   */
  isReady() {
    return this.ready && this.client !== null;
  }

  /**
   * Realizar query a una tabla
   */
  async query(table, options = {}) {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Supabase no está disponible');
    }

    let query = client.from(table);

    if (options.select) {
      query = query.select(options.select);
    }

    if (options.eq) {
      Object.entries(options.eq).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
    }

    if (options.single) {
      return await query.single();
    }

    return await query;
  }

  /**
   * Insertar datos
   */
  async insert(table, data) {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Supabase no está disponible');
    }

    return await client.from(table).insert(data);
  }

  /**
   * Actualizar datos
   */
  async update(table, data, filter) {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Supabase no está disponible');
    }

    let query = client.from(table).update(data);

    if (filter) {
      Object.entries(filter).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
    }

    return await query;
  }

  /**
   * Eliminar datos
   */
  async delete(table, filter) {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Supabase no está disponible');
    }

    let query = client.from(table).delete();

    if (filter) {
      Object.entries(filter).forEach(([column, value]) => {
        query = query.eq(column, value);
      });
    }

    return await query;
  }

  /**
   * Llamar función RPC
   */
  async rpc(functionName, params = {}) {
    const client = await this.getClient();
    if (!client) {
      throw new Error('Supabase no está disponible');
    }

    return await client.rpc(functionName, params);
  }
}

// Crear instancia global
window.supabaseService = new SupabaseService();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.supabaseService.init();
});

// También inicializar si el DOM ya está listo
if (document.readyState !== 'loading') {
  window.supabaseService.init();
}

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupabaseService;
}

