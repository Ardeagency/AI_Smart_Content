const { query } = require('../config/database');

class VisualResource {
  constructor(resourceData) {
    this.id = resourceData.id;
    this.user_id = resourceData.user_id;
    this.brand_id = resourceData.brand_id;
    this.nombre = resourceData.nombre;
    this.descripcion = resourceData.descripcion;
    this.tipo = resourceData.tipo;
    this.archivos = resourceData.archivos || [];
    this.urls_externas = resourceData.urls_externas || [];
    this.tags = resourceData.tags || [];
    this.metadata = resourceData.metadata || {};
    this.estilo_grafico = resourceData.estilo_grafico;
    this.colores_principales = resourceData.colores_principales || [];
    this.emociones = resourceData.emociones || [];
    this.marcas_referencia = resourceData.marcas_referencia || [];
    this.estilos_aplicados = resourceData.estilos_aplicados || [];
    this.duracion_segundos = resourceData.duracion_segundos;
    this.resolucion = resourceData.resolucion;
    this.formato_archivo = resourceData.formato_archivo;
    this.carpeta = resourceData.carpeta;
    this.proyecto = resourceData.proyecto;
    this.version = resourceData.version;
    this.estado = resourceData.estado || 'activo';
    this.favorito = resourceData.favorito || false;
    this.uso_frecuente = resourceData.uso_frecuente || 0;
    this.creado_en = resourceData.creado_en;
    this.actualizado_en = resourceData.actualizado_en;
    this.activo = resourceData.activo !== undefined ? resourceData.activo : true;
  }

  // Método para crear un nuevo recurso visual
  static async create(resourceData) {
    try {
      const sql = `
        INSERT INTO visual_resources (
          user_id, brand_id, nombre, descripcion, tipo, archivos, urls_externas,
          tags, metadata, estilo_grafico, colores_principales, emociones,
          marcas_referencia, estilos_aplicados, duracion_segundos, resolucion,
          formato_archivo, carpeta, proyecto, version, estado, favorito
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        ) RETURNING *
      `;

      const values = [
        resourceData.user_id, resourceData.brand_id, resourceData.nombre,
        resourceData.descripcion, resourceData.tipo,
        JSON.stringify(resourceData.archivos), resourceData.urls_externas,
        resourceData.tags, JSON.stringify(resourceData.metadata),
        resourceData.estilo_grafico, resourceData.colores_principales,
        resourceData.emociones, resourceData.marcas_referencia,
        resourceData.estilos_aplicados, resourceData.duracion_segundos,
        resourceData.resolucion, resourceData.formato_archivo,
        resourceData.carpeta, resourceData.proyecto, resourceData.version,
        resourceData.estado, resourceData.favorito
      ];

      const result = await query(sql, values);
      return new VisualResource(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear recurso visual: ${error.message}`);
    }
  }

  // Método para buscar recurso por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM visual_resources WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new VisualResource(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar recurso por ID: ${error.message}`);
    }
  }

  // Método para buscar recursos por usuario
  static async findByUserId(userId, options = {}) {
    try {
      const { 
        activo = true, 
        tipo = null, 
        estilo_grafico = null,
        favorito = null,
        carpeta = null,
        proyecto = null
      } = options;
      
      let sql = 'SELECT * FROM visual_resources WHERE user_id = $1';
      const values = [userId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (estilo_grafico) {
        sql += ` AND estilo_grafico = $${paramCount}`;
        values.push(estilo_grafico);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      if (carpeta) {
        sql += ` AND carpeta = $${paramCount}`;
        values.push(carpeta);
        paramCount++;
      }

      if (proyecto) {
        sql += ` AND proyecto = $${paramCount}`;
        values.push(proyecto);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new VisualResource(row));
    } catch (error) {
      throw new Error(`Error al buscar recursos por usuario: ${error.message}`);
    }
  }

  // Método para buscar recursos por marca
  static async findByBrandId(brandId, options = {}) {
    try {
      const { 
        activo = true, 
        tipo = null, 
        estilo_grafico = null,
        favorito = null
      } = options;
      
      let sql = 'SELECT * FROM visual_resources WHERE brand_id = $1';
      const values = [brandId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (estilo_grafico) {
        sql += ` AND estilo_grafico = $${paramCount}`;
        values.push(estilo_grafico);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new VisualResource(row));
    } catch (error) {
      throw new Error(`Error al buscar recursos por marca: ${error.message}`);
    }
  }

  // Método para actualizar recurso
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          if (key === 'archivos' || key === 'metadata') {
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
      const sql = `UPDATE visual_resources SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new VisualResource(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar recurso: ${error.message}`);
    }
  }

  // Método para eliminar recurso (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE visual_resources SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new VisualResource(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar recurso: ${error.message}`);
    }
  }

  // Método para incrementar contador de uso
  async incrementUsage() {
    try {
      const sql = 'UPDATE visual_resources SET uso_frecuente = uso_frecuente + 1 WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      this.uso_frecuente = result.rows[0].uso_frecuente;
      return this;
    } catch (error) {
      throw new Error(`Error al incrementar uso del recurso: ${error.message}`);
    }
  }

  // Método para buscar recursos por tags
  static async findByTags(tags, options = {}) {
    try {
      const { activo = true, tipo = null, estilo_grafico = null } = options;
      
      let sql = 'SELECT * FROM visual_resources WHERE tags && $1';
      const values = [tags];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (estilo_grafico) {
        sql += ` AND estilo_grafico = $${paramCount}`;
        values.push(estilo_grafico);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new VisualResource(row));
    } catch (error) {
      throw new Error(`Error al buscar recursos por tags: ${error.message}`);
    }
  }

  // Método para buscar recursos por colores
  static async findByColors(colors, options = {}) {
    try {
      const { activo = true, tipo = null } = options;
      
      let sql = 'SELECT * FROM visual_resources WHERE colores_principales && $1';
      const values = [colors];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new VisualResource(row));
    } catch (error) {
      throw new Error(`Error al buscar recursos por colores: ${error.message}`);
    }
  }

  // Método para obtener todos los recursos (con filtros y paginación)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        tipo = null,
        estilo_grafico = null,
        activo = true,
        favorito = null,
        user_id = null,
        brand_id = null,
        carpeta = null,
        proyecto = null
      } = options;

      let sql = 'SELECT * FROM visual_resources WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (estilo_grafico) {
        sql += ` AND estilo_grafico = $${paramCount}`;
        values.push(estilo_grafico);
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

      if (carpeta) {
        sql += ` AND carpeta = $${paramCount}`;
        values.push(carpeta);
        paramCount++;
      }

      if (proyecto) {
        sql += ` AND proyecto = $${paramCount}`;
        values.push(proyecto);
        paramCount++;
      }

      sql += ` ORDER BY uso_frecuente DESC, creado_en DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, (page - 1) * limit);

      const result = await query(sql, values);
      return result.rows.map(row => new VisualResource(row));
    } catch (error) {
      throw new Error(`Error al obtener recursos: ${error.message}`);
    }
  }

  // Método para contar recursos
  static async count(options = {}) {
    try {
      const { 
        tipo = null, 
        estilo_grafico = null, 
        activo = true,
        favorito = null,
        user_id = null,
        brand_id = null,
        carpeta = null,
        proyecto = null
      } = options;

      let sql = 'SELECT COUNT(*) FROM visual_resources WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (estilo_grafico) {
        sql += ` AND estilo_grafico = $${paramCount}`;
        values.push(estilo_grafico);
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

      if (carpeta) {
        sql += ` AND carpeta = $${paramCount}`;
        values.push(carpeta);
        paramCount++;
      }

      if (proyecto) {
        sql += ` AND proyecto = $${paramCount}`;
        values.push(proyecto);
        paramCount++;
      }

      const result = await query(sql, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Error al contar recursos: ${error.message}`);
    }
  }

  // Método para obtener datos públicos del recurso
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      brand_id: this.brand_id,
      nombre: this.nombre,
      descripcion: this.descripcion,
      tipo: this.tipo,
      archivos: this.archivos,
      urls_externas: this.urls_externas,
      tags: this.tags,
      metadata: this.metadata,
      estilo_grafico: this.estilo_grafico,
      colores_principales: this.colores_principales,
      emociones: this.emociones,
      marcas_referencia: this.marcas_referencia,
      estilos_aplicados: this.estilos_aplicados,
      duracion_segundos: this.duracion_segundos,
      resolucion: this.resolucion,
      formato_archivo: this.formato_archivo,
      carpeta: this.carpeta,
      proyecto: this.proyecto,
      version: this.version,
      estado: this.estado,
      favorito: this.favorito,
      uso_frecuente: this.uso_frecuente,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en,
      activo: this.activo
    };
  }
}

module.exports = VisualResource;
