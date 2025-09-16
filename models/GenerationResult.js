const { query } = require('../config/database');

class GenerationResult {
  constructor(resultData) {
    this.id = resultData.id;
    this.user_id = resultData.user_id;
    this.brand_id = resultData.brand_id;
    this.product_id = resultData.product_id;
    this.avatar_id = resultData.avatar_id;
    this.generation_config_id = resultData.generation_config_id;
    this.request_id = resultData.request_id;
    this.tipo_resultado = resultData.tipo_resultado;
    this.subtipo = resultData.subtipo;
    this.titulo = resultData.titulo;
    this.descripcion = resultData.descripcion;
    this.contenido_texto = resultData.contenido_texto;
    this.contenido_metadata = resultData.contenido_metadata || {};
    this.archivos_generados = resultData.archivos_generados || [];
    this.archivos_originales = resultData.archivos_originales || [];
    this.archivos_procesados = resultData.archivos_procesados || [];
    this.resolucion = resultData.resolucion;
    this.duracion_segundos = resultData.duracion_segundos;
    this.tamaño_archivo = resultData.tamaño_archivo;
    this.formato = resultData.formato;
    this.calidad = resultData.calidad;
    this.estilo_aplicado = resultData.estilo_aplicado;
    this.configuracion_usada = resultData.configuracion_usada || {};
    this.prompts_usados = resultData.prompts_usados || [];
    this.plataformas_destino = resultData.plataformas_destino || [];
    this.idioma = resultData.idioma || 'es';
    this.region = resultData.region;
    this.estado = resultData.estado || 'generado';
    this.calificacion = resultData.calificacion;
    this.favorito = resultData.favorito || false;
    this.descartado = resultData.descartado || false;
    this.feedback = resultData.feedback;
    this.veces_usado = resultData.veces_usado || 0;
    this.veces_compartido = resultData.veces_compartido || 0;
    this.veces_descargado = resultData.veces_descargado || 0;
    this.modelo_ia_usado = resultData.modelo_ia_usado;
    this.tiempo_generacion_segundos = resultData.tiempo_generacion_segundos;
    this.costo_generacion = resultData.costo_generacion;
    this.tokens_usados = resultData.tokens_usados;
    this.creado_en = resultData.creado_en;
    this.actualizado_en = resultData.actualizado_en;
    this.fecha_uso = resultData.fecha_uso;
    this.activo = resultData.activo !== undefined ? resultData.activo : true;
  }

  // Método para crear un nuevo resultado
  static async create(resultData) {
    try {
      const sql = `
        INSERT INTO generation_results (
          user_id, brand_id, product_id, avatar_id, generation_config_id,
          request_id, tipo_resultado, subtipo, titulo, descripcion, contenido_texto,
          contenido_metadata, archivos_generados, archivos_originales, archivos_procesados,
          resolucion, duracion_segundos, tamaño_archivo, formato, calidad,
          estilo_aplicado, configuracion_usada, prompts_usados, plataformas_destino,
          idioma, region, estado, calificacion, favorito, descartado, feedback,
          veces_usado, veces_compartido, veces_descargado, modelo_ia_usado,
          tiempo_generacion_segundos, costo_generacion, tokens_usados
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
        ) RETURNING *
      `;

      const values = [
        resultData.user_id, resultData.brand_id, resultData.product_id,
        resultData.avatar_id, resultData.generation_config_id, resultData.request_id,
        resultData.tipo_resultado, resultData.subtipo, resultData.titulo,
        resultData.descripcion, resultData.contenido_texto,
        JSON.stringify(resultData.contenido_metadata),
        JSON.stringify(resultData.archivos_generados),
        JSON.stringify(resultData.archivos_originales),
        JSON.stringify(resultData.archivos_procesados),
        resultData.resolucion, resultData.duracion_segundos, resultData.tamaño_archivo,
        resultData.formato, resultData.calidad, resultData.estilo_aplicado,
        JSON.stringify(resultData.configuracion_usada), resultData.prompts_usados,
        resultData.plataformas_destino, resultData.idioma, resultData.region,
        resultData.estado, resultData.calificacion, resultData.favorito,
        resultData.descartado, resultData.feedback, resultData.veces_usado,
        resultData.veces_compartido, resultData.veces_descargado,
        resultData.modelo_ia_usado, resultData.tiempo_generacion_segundos,
        resultData.costo_generacion, resultData.tokens_usados
      ];

      const result = await query(sql, values);
      return new GenerationResult(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear resultado: ${error.message}`);
    }
  }

  // Método para buscar resultado por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM generation_results WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new GenerationResult(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar resultado por ID: ${error.message}`);
    }
  }

  // Método para buscar resultado por request_id
  static async findByRequestId(requestId) {
    try {
      const sql = 'SELECT * FROM generation_results WHERE request_id = $1';
      const result = await query(sql, [requestId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new GenerationResult(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar resultado por request_id: ${error.message}`);
    }
  }

  // Método para buscar resultados por usuario
  static async findByUserId(userId, options = {}) {
    try {
      const { 
        activo = true, 
        tipo_resultado = null,
        estado = null,
        favorito = null,
        descartado = null
      } = options;
      
      let sql = 'SELECT * FROM generation_results WHERE user_id = $1';
      const values = [userId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (tipo_resultado) {
        sql += ` AND tipo_resultado = $${paramCount}`;
        values.push(tipo_resultado);
        paramCount++;
      }

      if (estado) {
        sql += ` AND estado = $${paramCount}`;
        values.push(estado);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      if (descartado !== null) {
        sql += ` AND descartado = $${paramCount}`;
        values.push(descartado);
        paramCount++;
      }

      sql += ' ORDER BY creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new GenerationResult(row));
    } catch (error) {
      throw new Error(`Error al buscar resultados por usuario: ${error.message}`);
    }
  }

  // Método para actualizar resultado
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          if (['contenido_metadata', 'archivos_generados', 'archivos_originales', 'archivos_procesados', 'configuracion_usada'].includes(key)) {
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
      const sql = `UPDATE generation_results SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new GenerationResult(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar resultado: ${error.message}`);
    }
  }

  // Método para eliminar resultado (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE generation_results SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new GenerationResult(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar resultado: ${error.message}`);
    }
  }

  // Método para incrementar contador de uso
  async incrementUsage() {
    try {
      const sql = 'UPDATE generation_results SET veces_usado = veces_usado + 1, fecha_uso = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      this.veces_usado = result.rows[0].veces_usado;
      this.fecha_uso = result.rows[0].fecha_uso;
      return this;
    } catch (error) {
      throw new Error(`Error al incrementar uso del resultado: ${error.message}`);
    }
  }

  // Método para incrementar contador de compartido
  async incrementShared() {
    try {
      const sql = 'UPDATE generation_results SET veces_compartido = veces_compartido + 1 WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      this.veces_compartido = result.rows[0].veces_compartido;
      return this;
    } catch (error) {
      throw new Error(`Error al incrementar compartido del resultado: ${error.message}`);
    }
  }

  // Método para incrementar contador de descargado
  async incrementDownloaded() {
    try {
      const sql = 'UPDATE generation_results SET veces_descargado = veces_descargado + 1 WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      this.veces_descargado = result.rows[0].veces_descargado;
      return this;
    } catch (error) {
      throw new Error(`Error al incrementar descargado del resultado: ${error.message}`);
    }
  }

  // Método para obtener todos los resultados (con filtros y paginación)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        tipo_resultado = null,
        estado = null,
        activo = true,
        favorito = null,
        descartado = null,
        user_id = null,
        brand_id = null,
        product_id = null,
        avatar_id = null
      } = options;

      let sql = 'SELECT * FROM generation_results WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (tipo_resultado) {
        sql += ` AND tipo_resultado = $${paramCount}`;
        values.push(tipo_resultado);
        paramCount++;
      }

      if (estado) {
        sql += ` AND estado = $${paramCount}`;
        values.push(estado);
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

      if (descartado !== null) {
        sql += ` AND descartado = $${paramCount}`;
        values.push(descartado);
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

      if (product_id) {
        sql += ` AND product_id = $${paramCount}`;
        values.push(product_id);
        paramCount++;
      }

      if (avatar_id) {
        sql += ` AND avatar_id = $${paramCount}`;
        values.push(avatar_id);
        paramCount++;
      }

      sql += ` ORDER BY creado_en DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, (page - 1) * limit);

      const result = await query(sql, values);
      return result.rows.map(row => new GenerationResult(row));
    } catch (error) {
      throw new Error(`Error al obtener resultados: ${error.message}`);
    }
  }

  // Método para contar resultados
  static async count(options = {}) {
    try {
      const { 
        tipo_resultado = null, 
        estado = null, 
        activo = true,
        favorito = null,
        descartado = null,
        user_id = null,
        brand_id = null,
        product_id = null,
        avatar_id = null
      } = options;

      let sql = 'SELECT COUNT(*) FROM generation_results WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (tipo_resultado) {
        sql += ` AND tipo_resultado = $${paramCount}`;
        values.push(tipo_resultado);
        paramCount++;
      }

      if (estado) {
        sql += ` AND estado = $${paramCount}`;
        values.push(estado);
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

      if (descartado !== null) {
        sql += ` AND descartado = $${paramCount}`;
        values.push(descartado);
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

      if (product_id) {
        sql += ` AND product_id = $${paramCount}`;
        values.push(product_id);
        paramCount++;
      }

      if (avatar_id) {
        sql += ` AND avatar_id = $${paramCount}`;
        values.push(avatar_id);
        paramCount++;
      }

      const result = await query(sql, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Error al contar resultados: ${error.message}`);
    }
  }

  // Método para obtener estadísticas de resultados
  static async getStats(userId, options = {}) {
    try {
      const { 
        fecha_inicio = null,
        fecha_fin = null,
        tipo_resultado = null
      } = options;

      let sql = `
        SELECT 
          COUNT(*) as total_resultados,
          COUNT(CASE WHEN favorito = true THEN 1 END) as favoritos,
          COUNT(CASE WHEN descartado = true THEN 1 END) as descartados,
          AVG(calificacion) as calificacion_promedio,
          SUM(veces_usado) as total_usos,
          SUM(veces_compartido) as total_compartidos,
          SUM(veces_descargado) as total_descargas,
          SUM(costo_generacion) as costo_total,
          SUM(tokens_usados) as tokens_totales
        FROM generation_results 
        WHERE user_id = $1 AND activo = true
      `;
      
      const values = [userId];
      let paramCount = 2;

      if (fecha_inicio) {
        sql += ` AND creado_en >= $${paramCount}`;
        values.push(fecha_inicio);
        paramCount++;
      }

      if (fecha_fin) {
        sql += ` AND creado_en <= $${paramCount}`;
        values.push(fecha_fin);
        paramCount++;
      }

      if (tipo_resultado) {
        sql += ` AND tipo_resultado = $${paramCount}`;
        values.push(tipo_resultado);
        paramCount++;
      }

      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error al obtener estadísticas: ${error.message}`);
    }
  }

  // Método para obtener datos públicos del resultado
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      brand_id: this.brand_id,
      product_id: this.product_id,
      avatar_id: this.avatar_id,
      generation_config_id: this.generation_config_id,
      request_id: this.request_id,
      tipo_resultado: this.tipo_resultado,
      subtipo: this.subtipo,
      titulo: this.titulo,
      descripcion: this.descripcion,
      contenido_texto: this.contenido_texto,
      contenido_metadata: this.contenido_metadata,
      archivos_generados: this.archivos_generados,
      archivos_originales: this.archivos_originales,
      archivos_procesados: this.archivos_procesados,
      resolucion: this.resolucion,
      duracion_segundos: this.duracion_segundos,
      tamaño_archivo: this.tamaño_archivo,
      formato: this.formato,
      calidad: this.calidad,
      estilo_aplicado: this.estilo_aplicado,
      configuracion_usada: this.configuracion_usada,
      prompts_usados: this.prompts_usados,
      plataformas_destino: this.plataformas_destino,
      idioma: this.idioma,
      region: this.region,
      estado: this.estado,
      calificacion: this.calificacion,
      favorito: this.favorito,
      descartado: this.descartado,
      feedback: this.feedback,
      veces_usado: this.veces_usado,
      veces_compartido: this.veces_compartido,
      veces_descargado: this.veces_descargado,
      modelo_ia_usado: this.modelo_ia_usado,
      tiempo_generacion_segundos: this.tiempo_generacion_segundos,
      costo_generacion: this.costo_generacion,
      tokens_usados: this.tokens_usados,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en,
      fecha_uso: this.fecha_uso,
      activo: this.activo
    };
  }
}

module.exports = GenerationResult;
