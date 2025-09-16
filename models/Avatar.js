const { query } = require('../config/database');

class Avatar {
  constructor(avatarData) {
    this.id = avatarData.id;
    this.user_id = avatarData.user_id;
    this.brand_id = avatarData.brand_id;
    this.nombre = avatarData.nombre;
    this.descripcion_personalidad = avatarData.descripcion_personalidad;
    this.descripcion_estilo = avatarData.descripcion_estilo;
    this.imagen_referencia_url = avatarData.imagen_referencia_url;
    this.imagen_referencia_alt = avatarData.imagen_referencia_alt;
    this.estilo_visual = avatarData.estilo_visual;
    this.genero = avatarData.genero;
    this.edad_aparente = avatarData.edad_aparente;
    this.etnia = avatarData.etnia;
    this.roles = avatarData.roles || [];
    this.especializaciones = avatarData.especializaciones || [];
    this.personalidad_atributos = avatarData.personalidad_atributos || [];
    this.configuracion_generacion = avatarData.configuracion_generacion || {};
    this.prompts_sugeridos = avatarData.prompts_sugeridos || [];
    this.tags = avatarData.tags || [];
    this.estado = avatarData.estado || 'activo';
    this.favorito = avatarData.favorito || false;
    this.uso_frecuente = avatarData.uso_frecuente || 0;
    this.creado_en = avatarData.creado_en;
    this.actualizado_en = avatarData.actualizado_en;
    this.activo = avatarData.activo !== undefined ? avatarData.activo : true;
  }

  // Método para crear un nuevo avatar
  static async create(avatarData) {
    try {
      const sql = `
        INSERT INTO avatars (
          user_id, brand_id, nombre, descripcion_personalidad, descripcion_estilo,
          imagen_referencia_url, imagen_referencia_alt, estilo_visual, genero,
          edad_aparente, etnia, roles, especializaciones, personalidad_atributos,
          configuracion_generacion, prompts_sugeridos, tags, estado, favorito
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) RETURNING *
      `;

      const values = [
        avatarData.user_id, avatarData.brand_id, avatarData.nombre,
        avatarData.descripcion_personalidad, avatarData.descripcion_estilo,
        avatarData.imagen_referencia_url, avatarData.imagen_referencia_alt,
        avatarData.estilo_visual, avatarData.genero, avatarData.edad_aparente,
        avatarData.etnia, avatarData.roles, avatarData.especializaciones,
        avatarData.personalidad_atributos, JSON.stringify(avatarData.configuracion_generacion),
        avatarData.prompts_sugeridos, avatarData.tags, avatarData.estado,
        avatarData.favorito
      ];

      const result = await query(sql, values);
      return new Avatar(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear avatar: ${error.message}`);
    }
  }

  // Método para buscar avatar por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM avatars WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Avatar(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar avatar por ID: ${error.message}`);
    }
  }

  // Método para buscar avatares por usuario
  static async findByUserId(userId, options = {}) {
    try {
      const { 
        activo = true, 
        estilo_visual = null, 
        genero = null,
        favorito = null
      } = options;
      
      let sql = 'SELECT * FROM avatars WHERE user_id = $1';
      const values = [userId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (estilo_visual) {
        sql += ` AND estilo_visual = $${paramCount}`;
        values.push(estilo_visual);
        paramCount++;
      }

      if (genero) {
        sql += ` AND genero = $${paramCount}`;
        values.push(genero);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Avatar(row));
    } catch (error) {
      throw new Error(`Error al buscar avatares por usuario: ${error.message}`);
    }
  }

  // Método para buscar avatares por marca
  static async findByBrandId(brandId, options = {}) {
    try {
      const { 
        activo = true, 
        estilo_visual = null, 
        genero = null,
        favorito = null
      } = options;
      
      let sql = 'SELECT * FROM avatars WHERE brand_id = $1';
      const values = [brandId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (estilo_visual) {
        sql += ` AND estilo_visual = $${paramCount}`;
        values.push(estilo_visual);
        paramCount++;
      }

      if (genero) {
        sql += ` AND genero = $${paramCount}`;
        values.push(genero);
        paramCount++;
      }

      if (favorito !== null) {
        sql += ` AND favorito = $${paramCount}`;
        values.push(favorito);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Avatar(row));
    } catch (error) {
      throw new Error(`Error al buscar avatares por marca: ${error.message}`);
    }
  }

  // Método para actualizar avatar
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          if (key === 'configuracion_generacion') {
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
      const sql = `UPDATE avatars SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new Avatar(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar avatar: ${error.message}`);
    }
  }

  // Método para eliminar avatar (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE avatars SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new Avatar(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar avatar: ${error.message}`);
    }
  }

  // Método para incrementar contador de uso
  async incrementUsage() {
    try {
      const sql = 'UPDATE avatars SET uso_frecuente = uso_frecuente + 1 WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      this.uso_frecuente = result.rows[0].uso_frecuente;
      return this;
    } catch (error) {
      throw new Error(`Error al incrementar uso del avatar: ${error.message}`);
    }
  }

  // Método para buscar avatares por roles
  static async findByRoles(roles, options = {}) {
    try {
      const { activo = true, estilo_visual = null, genero = null } = options;
      
      let sql = 'SELECT * FROM avatars WHERE roles && $1';
      const values = [roles];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (estilo_visual) {
        sql += ` AND estilo_visual = $${paramCount}`;
        values.push(estilo_visual);
        paramCount++;
      }

      if (genero) {
        sql += ` AND genero = $${paramCount}`;
        values.push(genero);
        paramCount++;
      }

      sql += ' ORDER BY uso_frecuente DESC, creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Avatar(row));
    } catch (error) {
      throw new Error(`Error al buscar avatares por roles: ${error.message}`);
    }
  }

  // Método para obtener todos los avatares (con filtros y paginación)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        estilo_visual = null,
        genero = null,
        activo = true,
        favorito = null,
        user_id = null,
        brand_id = null
      } = options;

      let sql = 'SELECT * FROM avatars WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (estilo_visual) {
        sql += ` AND estilo_visual = $${paramCount}`;
        values.push(estilo_visual);
        paramCount++;
      }

      if (genero) {
        sql += ` AND genero = $${paramCount}`;
        values.push(genero);
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
      return result.rows.map(row => new Avatar(row));
    } catch (error) {
      throw new Error(`Error al obtener avatares: ${error.message}`);
    }
  }

  // Método para contar avatares
  static async count(options = {}) {
    try {
      const { 
        estilo_visual = null, 
        genero = null, 
        activo = true,
        favorito = null,
        user_id = null,
        brand_id = null
      } = options;

      let sql = 'SELECT COUNT(*) FROM avatars WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (estilo_visual) {
        sql += ` AND estilo_visual = $${paramCount}`;
        values.push(estilo_visual);
        paramCount++;
      }

      if (genero) {
        sql += ` AND genero = $${paramCount}`;
        values.push(genero);
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
      throw new Error(`Error al contar avatares: ${error.message}`);
    }
  }

  // Método para obtener datos públicos del avatar
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      brand_id: this.brand_id,
      nombre: this.nombre,
      descripcion_personalidad: this.descripcion_personalidad,
      descripcion_estilo: this.descripcion_estilo,
      imagen_referencia_url: this.imagen_referencia_url,
      imagen_referencia_alt: this.imagen_referencia_alt,
      estilo_visual: this.estilo_visual,
      genero: this.genero,
      edad_aparente: this.edad_aparente,
      etnia: this.etnia,
      roles: this.roles,
      especializaciones: this.especializaciones,
      personalidad_atributos: this.personalidad_atributos,
      configuracion_generacion: this.configuracion_generacion,
      prompts_sugeridos: this.prompts_sugeridos,
      tags: this.tags,
      estado: this.estado,
      favorito: this.favorito,
      uso_frecuente: this.uso_frecuente,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en,
      activo: this.activo
    };
  }
}

module.exports = Avatar;
