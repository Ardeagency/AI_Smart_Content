const { query } = require('../config/database');

class Product {
  constructor(productData) {
    this.id = productData.id;
    this.user_id = productData.user_id;
    this.brand_id = productData.brand_id;
    this.nombre = productData.nombre;
    this.descripcion_corta = productData.descripcion_corta;
    this.descripcion_larga = productData.descripcion_larga;
    this.tipo = productData.tipo;
    this.categoria = productData.categoria;
    this.imagen_principal_url = productData.imagen_principal_url;
    this.galeria_imagenes = productData.galeria_imagenes || [];
    this.archivos_asociados = productData.archivos_asociados || [];
    this.atributos_clave = productData.atributos_clave || {};
    this.precio = productData.precio;
    this.moneda = productData.moneda || 'MXN';
    this.stock = productData.stock;
    this.sku = productData.sku;
    this.tags = productData.tags || [];
    this.estado = productData.estado || 'activo';
    this.destacado = productData.destacado || false;
    this.creado_en = productData.creado_en;
    this.actualizado_en = productData.actualizado_en;
    this.activo = productData.activo !== undefined ? productData.activo : true;
  }

  // Método para crear un nuevo producto
  static async create(productData) {
    try {
      const sql = `
        INSERT INTO products (
          user_id, brand_id, nombre, descripcion_corta, descripcion_larga,
          tipo, categoria, imagen_principal_url, galeria_imagenes, archivos_asociados,
          atributos_clave, precio, moneda, stock, sku, tags, estado, destacado
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) RETURNING *
      `;

      const values = [
        productData.user_id, productData.brand_id, productData.nombre,
        productData.descripcion_corta, productData.descripcion_larga,
        productData.tipo, productData.categoria, productData.imagen_principal_url,
        JSON.stringify(productData.galeria_imagenes),
        JSON.stringify(productData.archivos_asociados),
        JSON.stringify(productData.atributos_clave), productData.precio,
        productData.moneda, productData.stock, productData.sku,
        productData.tags, productData.estado, productData.destacado
      ];

      const result = await query(sql, values);
      return new Product(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear producto: ${error.message}`);
    }
  }

  // Método para buscar producto por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM products WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Product(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar producto por ID: ${error.message}`);
    }
  }

  // Método para buscar productos por usuario
  static async findByUserId(userId, options = {}) {
    try {
      const { activo = true, tipo = null, categoria = null } = options;
      
      let sql = 'SELECT * FROM products WHERE user_id = $1';
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

      if (categoria) {
        sql += ` AND categoria = $${paramCount}`;
        values.push(categoria);
        paramCount++;
      }

      sql += ' ORDER BY creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Product(row));
    } catch (error) {
      throw new Error(`Error al buscar productos por usuario: ${error.message}`);
    }
  }

  // Método para buscar productos por marca
  static async findByBrandId(brandId, options = {}) {
    try {
      const { activo = true, tipo = null, categoria = null } = options;
      
      let sql = 'SELECT * FROM products WHERE brand_id = $1';
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

      if (categoria) {
        sql += ` AND categoria = $${paramCount}`;
        values.push(categoria);
        paramCount++;
      }

      sql += ' ORDER BY creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Product(row));
    } catch (error) {
      throw new Error(`Error al buscar productos por marca: ${error.message}`);
    }
  }

  // Método para actualizar producto
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          if (key === 'galeria_imagenes' || key === 'archivos_asociados' || key === 'atributos_clave') {
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
      const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new Product(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar producto: ${error.message}`);
    }
  }

  // Método para eliminar producto (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE products SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new Product(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar producto: ${error.message}`);
    }
  }

  // Método para obtener todos los productos (con filtros y paginación)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        tipo = null,
        categoria = null,
        activo = true,
        destacado = null,
        user_id = null,
        brand_id = null
      } = options;

      let sql = 'SELECT * FROM products WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (categoria) {
        sql += ` AND categoria = $${paramCount}`;
        values.push(categoria);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (destacado !== null) {
        sql += ` AND destacado = $${paramCount}`;
        values.push(destacado);
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

      sql += ` ORDER BY creado_en DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, (page - 1) * limit);

      const result = await query(sql, values);
      return result.rows.map(row => new Product(row));
    } catch (error) {
      throw new Error(`Error al obtener productos: ${error.message}`);
    }
  }

  // Método para buscar productos por tags
  static async findByTags(tags, options = {}) {
    try {
      const { activo = true, tipo = null, categoria = null } = options;
      
      let sql = 'SELECT * FROM products WHERE tags && $1';
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

      if (categoria) {
        sql += ` AND categoria = $${paramCount}`;
        values.push(categoria);
        paramCount++;
      }

      sql += ' ORDER BY creado_en DESC';

      const result = await query(sql, values);
      return result.rows.map(row => new Product(row));
    } catch (error) {
      throw new Error(`Error al buscar productos por tags: ${error.message}`);
    }
  }

  // Método para contar productos
  static async count(options = {}) {
    try {
      const { 
        tipo = null, 
        categoria = null, 
        activo = true,
        destacado = null,
        user_id = null,
        brand_id = null
      } = options;

      let sql = 'SELECT COUNT(*) FROM products WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (tipo) {
        sql += ` AND tipo = $${paramCount}`;
        values.push(tipo);
        paramCount++;
      }

      if (categoria) {
        sql += ` AND categoria = $${paramCount}`;
        values.push(categoria);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (destacado !== null) {
        sql += ` AND destacado = $${paramCount}`;
        values.push(destacado);
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
      throw new Error(`Error al contar productos: ${error.message}`);
    }
  }

  // Método para obtener datos públicos del producto
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      brand_id: this.brand_id,
      nombre: this.nombre,
      descripcion_corta: this.descripcion_corta,
      descripcion_larga: this.descripcion_larga,
      tipo: this.tipo,
      categoria: this.categoria,
      imagen_principal_url: this.imagen_principal_url,
      galeria_imagenes: this.galeria_imagenes,
      archivos_asociados: this.archivos_asociados,
      atributos_clave: this.atributos_clave,
      precio: this.precio,
      moneda: this.moneda,
      stock: this.stock,
      sku: this.sku,
      tags: this.tags,
      estado: this.estado,
      destacado: this.destacado,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en,
      activo: this.activo
    };
  }
}

module.exports = Product;
