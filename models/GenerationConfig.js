const { query } = require('../config/database');

class GenerationConfig {
  constructor(configData) {
    this.id = configData.id;
    this.user_id = configData.user_id;
    this.brand_id = configData.brand_id;
    this.nombre = configData.nombre;
    this.descripcion = configData.descripcion;
    this.tipos_ugc = configData.tipos_ugc || [];
    this.estilos_preferidos = configData.estilos_preferidos || [];
    this.estilos_personalizados = configData.estilos_personalizados || {};
    this.formatos_salida = configData.formatos_salida || {};
    this.idiomas = configData.idiomas || ['es'];
    this.region = configData.region || 'MX';
    this.plataformas_objetivo = configData.plataformas_objetivo || [];
    this.config_videos = configData.config_videos || {};
    this.config_imagenes = configData.config_imagenes || {};
    this.config_copies = configData.config_copies || {};
    this.config_guiones = configData.config_guiones || {};
    this.modelo_ia = configData.modelo_ia || 'gpt-4';
    this.prompts_base = configData.prompts_base || [];
    this.configuracion_ia = configData.configuracion_ia || {};
    this.filtros_contenido = configData.filtros_contenido || {};
    this.restricciones_etica = configData.restricciones_etica || {};
    this.palabras_clave_evitar = configData.palabras_clave_evitar || [];
    this.aplicar_identidad_marca = configData.aplicar_identidad_marca !== undefined ? configData.aplicar_identidad_marca : true;
    this.incluir_logo = configData.incluir_logo !== undefined ? configData.incluir_logo : true;
    this.usar_paleta_colores = configData.usar_paleta_colores !== undefined ? configData.usar_paleta_colores : true;
    this.usar_tipografias = configData.usar_tipografias !== undefined ? configData.usar_tipografias : true;
    this.estado = configData.estado || 'activo';
    this.es_plantilla = configData.es_plantilla || false;
    this.favorito = configData.favorito || false;
    this.uso_frecuente = configData.uso_frecuente || 0;
    this.creado_en = configData.creado_en;
    this.actualizado_en = configData.actualizado_en;
    this.activo = configData.activo !== undefined ? configData.activo : true;
  }

  // Método para crear una nueva configuración
  static async create(configData) {
    try {
      const sql = `
        INSERT INTO generation_configs (
          user_id, brand_id, nombre, descripcion, tipos_ugc, estilos_preferidos,
          estilos_personalizados, formatos_salida, idiomas, region, plataformas_objetivo,
          config_videos, config_imagenes, config_copies, config_guiones, modelo_ia,
          prompts_base, configuracion_ia, filtros_contenido, restricciones_etica,
          palabras_clave_evitar, aplicar_identidad_marca, incluir_logo, usar_paleta_colores,
          usar_tipografias, estado, es_plantilla, favorito
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        ) RETURNING *
      `;

      const values = [
        configData.user_id, configData.brand_id, configData.nombre,
        configData.descripcion, configData.tipos_ugc, configData.estilos_preferidos,
        JSON.stringify(configData.estilos_personalizados),
        JSON.stringify(configData.formatos_salida), configData.idiomas,
        configData.region, configData.plataformas_objetivo,
        JSON.stringify(configData.config_videos),
        JSON.stringify(configData.config_imagenes),
        JSON.stringify(configData.config_copies),
        JSON.stringify(configData.config_guiones), configData.modelo_ia,
        configData.prompts_base, JSON.stringify(configData.configuracion_ia),
        JSON.stringify(configData.filtros_contenido),
        JSON.stringify(configData.restricciones_etica),
        configData.palabras_clave_evitar, configData.aplicar_identidad_marca,
        configData.incluir_logo, configData.usar_paleta_colores,
        configData.usar_tipografias, configData.estado, configData.es_plantilla,
        configData.favorito
      ];

      const result = await query(sql, values);
      return new GenerationConfig(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear configuración: ${error.message}`);
    }
  }

  // Método para buscar configuración por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM generation_configs WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new GenerationConfig(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar configuración por ID: ${error.message}`);
    }
  }

  // Método para buscar configuraciones por usuario
  static async findByUserId(userId, options = {}) {
    try {
      const { 
        activo = true, 
        es_plantilla = null,
        favorito = null
      } = options;
      
      let sql = 'SELECT * FROM generation_configs WHERE user_id = $1';
      const values = [userId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (es_plantilla !== null) {
        sql += ` AND es_plantilla = $${paramCount}`;
        values.push(es_plantilla);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new GenerationConfig(row));
    } catch (error) {
      throw new Error(`Error al buscar configuraciones por usuario: ${error.message}`);
    }
  }

  // Método para buscar configuraciones por marca
  static async findByBrandId(brandId, options = {}) {
    try {
      const { 
        activo = true, 
        es_plantilla = null,
        favorito = null
      } = options;
      
      let sql = 'SELECT * FROM generation_configs WHERE brand_id = $1';
      const values = [brandId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (es_plantilla !== null) {
        sql += ` AND es_plantilla = $${paramCount}`;
        values.push(es_plantilla);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new GenerationConfig(row));
    } catch (error) {
      throw new Error(`Error al buscar configuraciones por marca: ${error.message}`);
    }
  }

  // Método para actualizar configuración
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          if (['estilos_personalizados', 'formatos_salida', 'config_videos', 'config_imagenes', 'config_copies', 'config_guiones', 'configuracion_ia', 'filtros_contenido', 'restricciones_etica'].includes(key)) {
            fields.push(`${key} = $${paramCount}`);
            values.push(JSON.stringify(updateData[key]));
          } else {
            fields.push(`${key} = $${paramCount}`);
            values.push(updateData[key]);
          }
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No hay campos para actualizar');
      }

      values.push(this.id);
      const sql = `UPDATE generation_configs SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new GenerationConfig(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar configuración: ${error.message}`);
    }
  }

  // Método para eliminar configuración (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE generation_configs SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new GenerationConfig(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar configuración: ${error.message}`);
    }
  }

  // Método para incrementar contador de uso
  async incrementUsage() {
    try {
      const sql = 'UPDATE generation_configs SET uso_frecuente = uso_frecuente + 1 WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      this.uso_frecuente = result.rows[0].uso_frecuente;
      return this;
    } catch (error) {
      throw new Error(`Error al incrementar uso de la configuración: ${error.message}`);
    }
  }

  // Método para buscar configuraciones por tipos de UGC
  static async findByUgcTypes(types, options = {}) {
    try {
      const { activo = true, es_plantilla = null } = options;
      
      let sql = 'SELECT * FROM generation_configs WHERE tipos_ugc && $1';
      const values = [types];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (es_plantilla !== null) {
        sql += ` AND es_plantilla = $${paramCount}`;
        values.push(es_plantilla);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new GenerationConfig(row));
    } catch (error) {
      throw new Error(`Error al buscar configuraciones por tipos UGC: ${error.message}`);
    }
  }

  // Método para obtener todas las configuraciones (con filtros y paginación)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        es_plantilla = null,
        activo = true,
        favorito = null,
        user_id = null,
        brand_id = null
      } = options;

      let sql = 'SELECT * FROM generation_configs WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (es_plantilla !== null) {
        sql += ` AND es_plantilla = $${paramCount}`;
        values.push(es_plantilla);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      if (user_id) {
        sql += ` AND user_id = $${paramCount}`;
        values.push(user_id);
        paramCount++;
      }

      if (brand_id) {
        sql += ` AND brand_id = $${paramCount}`;
        values.push(brand_id);
        paramCount++;
      }

      sql += ` ORDER BY uso_frecuente DESC, creado_en DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, (page - 1) * limit);

      const result = await query(sql, values);
      return result.rows.map(row => new GenerationConfig(row));
    } catch (error) {
      throw new Error(`Error al obtener configuraciones: ${error.message}`);
    }
  }

  // Método para contar configuraciones
  static async count(options = {}) {
    try {
      const { 
        es_plantilla = null, 
        activo = true,
        favorito = null,
        user_id = null,
        brand_id = null
      } = options;

      let sql = 'SELECT COUNT(*) FROM generation_configs WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (es_plantilla !== null) {
        sql += ` AND es_plantilla = $${paramCount}`;
        values.push(es_plantilla);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      if (user_id) {
        sql += ` AND user_id = $${paramCount}`;
        values.push(user_id);
        paramCount++;
      }

      if (brand_id) {
        sql += ` AND brand_id = $${paramCount}`;
        values.push(brand_id);
        paramCount++;
      }

      const result = await query(sql, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Error al contar configuraciones: ${error.message}`);
    }
  }

  // Método para obtener datos públicos de la configuración
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      brand_id: this.brand_id,
      nombre: this.nombre,
      descripcion: this.descripcion,
      tipos_ugc: this.tipos_ugc,
      estilos_preferidos: this.estilos_preferidos,
      estilos_personalizados: this.estilos_personalizados,
      formatos_salida: this.formatos_salida,
      idiomas: this.idiomas,
      region: this.region,
      plataformas_objetivo: this.plataformas_objetivo,
      config_videos: this.config_videos,
      config_imagenes: this.config_imagenes,
      config_copies: this.config_copies,
      config_guiones: this.config_guiones,
      modelo_ia: this.modelo_ia,
      prompts_base: this.prompts_base,
      configuracion_ia: this.configuracion_ia,
      filtros_contenido: this.filtros_contenido,
      restricciones_etica: this.restricciones_etica,
      palabras_clave_evitar: this.palabras_clave_evitar,
      aplicar_identidad_marca: this.aplicar_identidad_marca,
      incluir_logo: this.incluir_logo,
      usar_paleta_colores: this.usar_paleta_colores,
      usar_tipografias: this.usar_tipografias,
      estado: this.estado,
      es_plantilla: this.es_plantilla,
      favorito: this.favorito,
      uso_frecuente: this.uso_frecuente,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en,
      activo: this.activo
    };
  }
}

module.exports = GenerationConfig;
