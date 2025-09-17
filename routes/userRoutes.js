const express = require('express');
const User = require('../models/User');
const router = express.Router();

// GET /api/users - Obtener todos los usuarios (con paginación y filtros)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      acceso,
      activo,
      marca
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      acceso,
      activo: activo !== undefined ? activo === 'true' : null,
      marca
    };

    const [users, total] = await Promise.all([
      User.getAll(options),
      User.count(options)
    ]);

    res.json({
      success: true,
      data: users.map(user => user.getPublicData()),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/users/:id - Obtener usuario por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: user.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/users/user-id/:userId - Obtener usuario por user_id
router.get('/user-id/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByUserId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      data: user.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/users - Crear nuevo usuario
router.post('/', async (req, res) => {
  try {
    const userData = req.body;

    // Validaciones básicas
    if (!userData.nombre || !userData.correo || !userData.contrasena) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos',
        required: ['nombre', 'correo', 'contrasena']
      });
    }

    // Verificar si el correo ya existe
    const existingUser = await User.findByEmail(userData.correo);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'El correo electrónico ya está registrado'
      });
    }

    // Generar user_id si no se proporciona
    if (!userData.user_id) {
      userData.user_id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    const user = await User.create(userData);

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: user.getPublicData()
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// PUT /api/users/:id - Actualizar usuario
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // No permitir actualizar campos sensibles
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.contrasena; // Usar endpoint específico para cambiar contraseña
    delete updateData.creado_en;

    const updatedUser = await user.update(updateData);

    res.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: updatedUser.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// DELETE /api/users/:id - Eliminar usuario (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    await user.delete();

    res.json({
      success: true,
      message: 'Usuario eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/users/:id/update-last-access - Actualizar último acceso
router.post('/:id/update-last-access', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    await user.updateLastAccess();

    res.json({
      success: true,
      message: 'Último acceso actualizado'
    });
  } catch (error) {
    console.error('Error al actualizar último acceso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/users/login - Login de usuario
router.post('/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({
        success: false,
        error: 'Correo y contraseña son requeridos'
      });
    }

    const user = await User.findByEmail(correo);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    const isValidPassword = await user.verifyPassword(contrasena);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    if (!user.activo) {
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo'
      });
    }

    // Actualizar último acceso
    await user.updateLastAccess();

    res.json({
      success: true,
      message: 'Login exitoso',
      data: user.getPublicData()
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;
