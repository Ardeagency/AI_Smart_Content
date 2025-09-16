const { query } = require('../config/database');

class Brand {
  constructor(brandData) {
    this.id = brandData.id;
    this.user_id = brandData.user_id;
    this.nombre_marca = brandData.nombre_marca;
    this.nicho_principal = brandData.nicho_principal;
    this.subnicho = brandData.subnicho;
    this.categorias_asociadas = brandData.categorias_asociadas || [];
    this.publico_objetivo = brandData.publico_objetivo;
    this.mercado_sector = brandData.mercado_sector;
    this.logo_url = brandData.logo_url;
    this.eslogan = brandData.eslogan;
    this.paleta_colores = brandData.paleta_colores || {};
    this.tipografias = brandData.tipografias || {};
    this.identidad_proposito = brandData.identidad_proposito;
    this.personalidad_atributos = brandData.personalidad_atributos || [];
    this.tono_comunicacion = brandData.tono_comunicacion;
    this.storytelling_filosofia = brandData.storytelling_filosofia;
    this.archivos_adicionales = brandData.archivos_adicionales || [];
    this.creado_en = brandData.creado_en;
    this.actualizado_en = brandData.actualizado_en;
    this.activo = brandData.activo !== undefined ? brandData.activo : true;
  }

  // Método para crear una nueva marca
  static async create(brandData) {
    try {
      const sql = `
        INSERT INTO brands (
          user_id, nombre_marca, nicho_principal, subnicho, categorias_asociadas,
          publico_objetivo, mercado_sector, logo_url, eslogan, paleta_colores,
          tipografias, identidad_proposito, personalidad_atributos, tono_comunicacion,
          storytelling_filosofia, archivos_adicionales
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        ) RETURNING *
      `;

      const values = [
        brandData.user_id, brandData.nombre_marca, brandData.nicho_principal,
        brandData.subnicho, brandData.categorias_asociadas, brandData.publico_objetivo,
        brandData.mercado_sector, brandData.logo_url, brandData.eslogan,
        JSON.stringify(brandData.paleta_colores), JSON.stringify(brandData.tipografias),
        brandData.identidad_proposito, brandData.personalidad_atributos,
        brandData.tono_comunicacion, brandData.storytelling_filosofia,
        JSON.stringify(brandData.archivos_adicionales)
      ];

      const result = await query(sql, values);
      return new Brand(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear marca: ${error.message}`);
    }
  }

  // Método para buscar marca por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM brands WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Brand(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar marca por ID: ${error.message}`);
    }
  }

  // Método para buscar marcas por usuario
  static async findByUserId(userId, options = {}) {
    try {
      const { activo = true } = options;
      
      let sql = 'SELECT * FROM brands WHERE user_id = $1';
      const values = [userId];
      let paramCount = 2;

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      sql += ' ORDER BY creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Brand(row));
    } catch (error) {
      throw new Error(`Error al buscar marcas por usuario: ${error.message}`);
    }
  }

  // Método para actualizar marca
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          if (key === 'paleta_colores' || key === 'tipografias' || key === 'archivos_adicionales') {
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
      const sql = `UPDATE brands SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new Brand(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar marca: ${error.message}`);
    }
  }

  // Método para eliminar marca (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE brands SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new Brand(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar marca: ${error.message}`);
    }
  }

  // Método para obtener todas las marcas (con filtros)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        nicho_principal = null,
        mercado_sector = null,
        activo = true
      } = options;

      let sql = 'SELECT * FROM brands WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (nicho_principal) {
        sql += ` AND nicho_principal = $${paramCount}`;
        values.push(nicho_principal);
        paramCount++;
      }

      if (mercado_sector) {
        sql += ` AND mercado_sector = $${paramCount}`;
        values.push(mercado_sector);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      sql += ` ORDER BY creado_en DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, (page - 1) * limit);

      const result = await query(sql, values);
      return result.rows.map(row => new Brand(row));
    } catch (error) {
      throw new Error(`Error al obtener marcas: ${error.message}`);
    }
  }

  // Método para contar marcas
  static async count(options = {}) {
    try {
      const { nicho_principal = null, mercado_sector = null, activo = true } = options;

      let sql = 'SELECT COUNT(*) FROM brands WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (nicho_principal) {
        sql += ` AND nicho_principal = $${paramCount}`;
        values.push(nicho_principal);
        paramCount++;
      }

      if (mercado_sector) {
        sql += ` AND mercado_sector = $${paramCount}`;
        values.push(mercado_sector);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      const result = await query(sql, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Error al contar marcas: ${error.message}`);
    }
  }

  // Método para obtener datos públicos de la marca
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      nombre_marca: this.nombre_marca,
      nicho_principal: this.nicho_principal,
      subnicho: this.subnicho,
      categorias_asociadas: this.categorias_asociadas,
      publico_objetivo: this.publico_objetivo,
      mercado_sector: this.mercado_sector,
      logo_url: this.logo_url,
      eslogan: this.eslogan,
      paleta_colores: this.paleta_colores,
      tipografias: this.tipografias,
      identidad_proposito: this.identidad_proposito,
      personalidad_atributos: this.personalidad_atributos,
      tono_comunicacion: this.tono_comunicacion,
      storytelling_filosofia: this.storytelling_filosofia,
      archivos_adicionales: this.archivos_adicionales,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en,
      activo: this.activo
    };
  }
}

module.exports = Brand;
