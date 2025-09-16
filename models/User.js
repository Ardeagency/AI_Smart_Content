const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

class User {
  constructor(userData) {
    this.user_id = userData.user_id;
    this.nombre = userData.nombre;
    this.apellido = userData.apellido;
    this.correo = userData.correo;
    this.contrasena = userData.contrasena;
    this.telefono = userData.telefono;
    this.acceso = userData.acceso || 'usuario';
    this.activo = userData.activo !== undefined ? userData.activo : true;
    this.email_verificado = userData.email_verificado || false;
    this.marca = userData.marca;
    this.avatar_url = userData.avatar_url;
    this.biografia = userData.biografia;
    this.sitio_web = userData.sitio_web;
    this.pais = userData.pais;
    this.ciudad = userData.ciudad;
    this.zona_horaria = userData.zona_horaria || 'UTC';
    this.idioma = userData.idioma || 'es';
    this.tema = userData.tema || 'claro';
    this.notificaciones_email = userData.notificaciones_email !== undefined ? userData.notificaciones_email : true;
    this.notificaciones_push = userData.notificaciones_push !== undefined ? userData.notificaciones_push : true;
  }

  // Método para hashear la contraseña
  async hashPassword() {
    if (this.contrasena) {
      const saltRounds = 12;
      this.contrasena = await bcrypt.hash(this.contrasena, saltRounds);
    }
  }

  // Método para verificar contraseña
  async verifyPassword(plainPassword) {
    return await bcrypt.compare(plainPassword, this.contrasena);
  }

  // Método para crear un nuevo usuario
  static async create(userData) {
    try {
      const user = new User(userData);
      await user.hashPassword();

      const sql = `
        INSERT INTO users (
          user_id, nombre, apellido, correo, contrasena, telefono, 
          acceso, activo, email_verificado,
          marca, avatar_url, biografia, sitio_web, pais, ciudad,
          zona_horaria, idioma, tema, notificaciones_email, notificaciones_push
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING *
      `;

      const values = [
        user.user_id, user.nombre, user.apellido, user.correo, user.contrasena,
        user.telefono, user.acceso, user.activo,
        user.email_verificado, user.marca, user.avatar_url, user.biografia,
        user.sitio_web, user.pais, user.ciudad, user.zona_horaria, user.idioma,
        user.tema, user.notificaciones_email, user.notificaciones_push
      ];

      const result = await query(sql, values);
      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al crear usuario: ${error.message}`);
    }
  }

  // Método para buscar usuario por ID
  static async findById(id) {
    try {
      const sql = 'SELECT * FROM users WHERE id = $1';
      const result = await query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar usuario por ID: ${error.message}`);
    }
  }

  // Método para buscar usuario por user_id
  static async findByUserId(userId) {
    try {
      const sql = 'SELECT * FROM users WHERE user_id = $1';
      const result = await query(sql, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar usuario por user_id: ${error.message}`);
    }
  }

  // Método para buscar usuario por correo
  static async findByEmail(email) {
    try {
      const sql = 'SELECT * FROM users WHERE correo = $1';
      const result = await query(sql, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al buscar usuario por correo: ${error.message}`);
    }
  }

  // Método para actualizar usuario
  async update(updateData) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      // Construir la consulta dinámicamente
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
          fields.push(`${key} = $${paramCount}`);
          values.push(updateData[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        throw new Error('No hay campos para actualizar');
      }

      values.push(this.id);
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      
      const result = await query(sql, values);
      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al actualizar usuario: ${error.message}`);
    }
  }

  // Método para eliminar usuario (soft delete)
  async delete() {
    try {
      const sql = 'UPDATE users SET activo = false WHERE id = $1 RETURNING *';
      const result = await query(sql, [this.id]);
      return new User(result.rows[0]);
    } catch (error) {
      throw new Error(`Error al eliminar usuario: ${error.message}`);
    }
  }

  // Método para actualizar último acceso
  async updateLastAccess() {
    try {
      const sql = 'UPDATE users SET ultimo_acceso = CURRENT_TIMESTAMP WHERE id = $1';
      await query(sql, [this.id]);
    } catch (error) {
      throw new Error(`Error al actualizar último acceso: ${error.message}`);
    }
  }

  // Método para obtener todos los usuarios (con paginación)
  static async findAll(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        acceso = null, 
        activo = null,
        marca = null 
      } = options;

      let sql = 'SELECT * FROM users WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (acceso) {
        sql += ` AND acceso = $${paramCount}`;
        values.push(acceso);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (marca) {
        sql += ` AND marca = $${paramCount}`;
        values.push(marca);
        paramCount++;
      }

      sql += ` ORDER BY creado_en DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      values.push(limit, (page - 1) * limit);

      const result = await query(sql, values);
      return result.rows.map(row => new User(row));
    } catch (error) {
      throw new Error(`Error al obtener usuarios: ${error.message}`);
    }
  }

  // Método para contar usuarios
  static async count(options = {}) {
    try {
      const { acceso = null, activo = null, marca = null } = options;

      let sql = 'SELECT COUNT(*) FROM users WHERE 1=1';
      const values = [];
      let paramCount = 1;

      if (acceso) {
        sql += ` AND acceso = $${paramCount}`;
        values.push(acceso);
        paramCount++;
      }

      if (activo !== null) {
        sql += ` AND activo = $${paramCount}`;
        values.push(activo);
        paramCount++;
      }

      if (marca) {
        sql += ` AND marca = $${paramCount}`;
        values.push(marca);
        paramCount++;
      }

      const result = await query(sql, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      throw new Error(`Error al contar usuarios: ${error.message}`);
    }
  }

  // Método para obtener datos públicos del usuario (sin información sensible)
  getPublicData() {
    return {
      id: this.id,
      user_id: this.user_id,
      nombre: this.nombre,
      apellido: this.apellido,
      correo: this.correo,
      telefono: this.telefono,
      acceso: this.acceso,
      activo: this.activo,
      email_verificado: this.email_verificado,
      marca: this.marca,
      avatar_url: this.avatar_url,
      biografia: this.biografia,
      sitio_web: this.sitio_web,
      pais: this.pais,
      ciudad: this.ciudad,
      zona_horaria: this.zona_horaria,
      idioma: this.idioma,
      tema: this.tema,
      notificaciones_email: this.notificaciones_email,
      notificaciones_push: this.notificaciones_push,
      creado_en: this.creado_en,
      actualizado_en: this.actualizado_en
    };
  }
}

module.exports = User;
