const express = require('express');
const Avatar = require('../models/Avatar');
const router = express.Router();

// GET /api/avatars - Obtener todos los avatares (con paginación y filtros)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      estilo_visual,
      genero,
      activo,
      favorito,
      user_id,
      brand_id
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      estilo_visual,
      genero,
      activo: activo !== undefined ? activo === 'true' : null,
      favorito: favorito !== undefined ? favorito === 'true' : null,
      user_id,
      brand_id
    };

    const [avatars, total] = await Promise.all([
      Avatar.findAll(options),
      Avatar.count(options)
    ]);

    res.json({
      success: true,
      data: avatars.map(avatar => avatar.getPublicData()),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener avatares:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/avatars/:id - Obtener avatar por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const avatar = await Avatar.findById(id);

    if (!avatar) {
      return res.status(404).json({
        success: false,
        error: 'Avatar no encontrado'
      });
    }

    res.json({
      success: true,
      data: avatar.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener avatar:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/avatars/user/:userId - Obtener avatares por usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activo, estilo_visual, genero, favorito } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      estilo_visual,
      genero,
      favorito: favorito !== undefined ? favorito === 'true' : null
    };

    const avatars = await Avatar.findByUserId(userId, options);

    res.json({
      success: true,
      data: avatars.map(avatar => avatar.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener avatares por usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/avatars/brand/:brandId - Obtener avatares por marca
router.get('/brand/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    const { activo, estilo_visual, genero, favorito } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      estilo_visual,
      genero,
      favorito: favorito !== undefined ? favorito === 'true' : null
    };

    const avatars = await Avatar.findByBrandId(brandId, options);

    res.json({
      success: true,
      data: avatars.map(avatar => avatar.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener avatares por marca:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/avatars/search/roles - Buscar avatares por roles
router.get('/search/roles', async (req, res) => {
  try {
    const { roles, activo, estilo_visual, genero } = req.query;

    if (!roles) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro roles es requerido'
      });
    }

    const rolesArray = Array.isArray(roles) ? roles : [roles];
    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      estilo_visual,
      genero
    };

    const avatars = await Avatar.findByRoles(rolesArray, options);

    res.json({
      success: true,
      data: avatars.map(avatar => avatar.getPublicData())
    });
  } catch (error) {
    console.error('Error al buscar avatares por roles:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/avatars - Crear nuevo avatar
router.post('/', async (req, res) => {
  try {
    const avatarData = req.body;

    // Validaciones básicas
    if (!avatarData.nombre || !avatarData.estilo_visual || !avatarData.user_id) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos',
        required: ['nombre', 'estilo_visual', 'user_id']
      });
    }

    const avatar = await Avatar.create(avatarData);

    res.status(201).json({
      success: true,
      message: 'Avatar creado exitosamente',
      data: avatar.getPublicData()
    });
  } catch (error) {
    console.error('Error al crear avatar:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// PUT /api/avatars/:id - Actualizar avatar
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const avatar = await Avatar.findById(id);
    if (!avatar) {
      return res.status(404).json({
        success: false,
        error: 'Avatar no encontrado'
      });
    }

    // No permitir actualizar campos sensibles
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.creado_en;

    const updatedAvatar = await avatar.update(updateData);

    res.json({
      success: true,
      message: 'Avatar actualizado exitosamente',
      data: updatedAvatar.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar avatar:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// DELETE /api/avatars/:id - Eliminar avatar (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const avatar = await Avatar.findById(id);
    if (!avatar) {
      return res.status(404).json({
        success: false,
        error: 'Avatar no encontrado'
      });
    }

    await avatar.delete();

    res.json({
      success: true,
      message: 'Avatar eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar avatar:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/avatars/:id/use - Incrementar contador de uso
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;

    const avatar = await Avatar.findById(id);
    if (!avatar) {
      return res.status(404).json({
        success: false,
        error: 'Avatar no encontrado'
      });
    }

    await avatar.incrementUsage();

    res.json({
      success: true,
      message: 'Contador de uso actualizado',
      data: avatar.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar uso del avatar:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/avatars/stats/overview - Obtener estadísticas generales
router.get('/stats/overview', async (req, res) => {
  try {
    const { user_id, brand_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id es requerido'
      });
    }

    const options = { user_id };
    if (brand_id) options.brand_id = brand_id;

    const [totalAvatars, activeAvatars, avatarsByStyle, avatarsByGender] = await Promise.all([
      Avatar.count(options),
      Avatar.count({ ...options, activo: true }),
      Avatar.count({ ...options, estilo_visual: 'realista' }),
      Avatar.count({ ...options, genero: 'femenino' })
    ]);

    res.json({
      success: true,
      data: {
        total_avatars: totalAvatars,
        avatars_activos: activeAvatars,
        avatars_inactivos: totalAvatars - activeAvatars,
        avatars_realistas: avatarsByStyle,
        avatars_femeninos: avatarsByGender
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de avatares:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;
