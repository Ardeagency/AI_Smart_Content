const express = require('express');
const VisualResource = require('../models/VisualResource');
const router = express.Router();

// GET /api/visual-resources - Obtener todos los recursos visuales (con paginación y filtros)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tipo,
      estilo_grafico,
      activo,
      favorito,
      user_id,
      brand_id,
      carpeta,
      proyecto
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      tipo,
      estilo_grafico,
      activo: activo !== undefined ? activo === 'true' : null,
      favorito: favorito !== undefined ? favorito === 'true' : null,
      user_id,
      brand_id,
      carpeta,
      proyecto
    };

    const [resources, total] = await Promise.all([
      VisualResource.findAll(options),
      VisualResource.count(options)
    ]);

    res.json({
      success: true,
      data: resources.map(resource => resource.getPublicData()),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener recursos visuales:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/visual-resources/:id - Obtener recurso por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const resource = await VisualResource.findById(id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Recurso visual no encontrado'
      });
    }

    res.json({
      success: true,
      data: resource.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener recurso visual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/visual-resources/user/:userId - Obtener recursos por usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activo, tipo, estilo_grafico, favorito, carpeta, proyecto } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo,
      estilo_grafico,
      favorito: favorito !== undefined ? favorito === 'true' : null,
      carpeta,
      proyecto
    };

    const resources = await VisualResource.findByUserId(userId, options);

    res.json({
      success: true,
      data: resources.map(resource => resource.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener recursos por usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/visual-resources/brand/:brandId - Obtener recursos por marca
router.get('/brand/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    const { activo, tipo, estilo_grafico, favorito } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo,
      estilo_grafico,
      favorito: favorito !== undefined ? favorito === 'true' : null
    };

    const resources = await VisualResource.findByBrandId(brandId, options);

    res.json({
      success: true,
      data: resources.map(resource => resource.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener recursos por marca:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/visual-resources/search/tags - Buscar recursos por tags
router.get('/search/tags', async (req, res) => {
  try {
    const { tags, activo, tipo, estilo_grafico } = req.query;

    if (!tags) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro tags es requerido'
      });
    }

    const tagsArray = Array.isArray(tags) ? tags : [tags];
    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo,
      estilo_grafico
    };

    const resources = await VisualResource.findByTags(tagsArray, options);

    res.json({
      success: true,
      data: resources.map(resource => resource.getPublicData())
    });
  } catch (error) {
    console.error('Error al buscar recursos por tags:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/visual-resources/search/colors - Buscar recursos por colores
router.get('/search/colors', async (req, res) => {
  try {
    const { colors, activo, tipo } = req.query;

    if (!colors) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro colors es requerido'
      });
    }

    const colorsArray = Array.isArray(colors) ? colors : [colors];
    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo
    };

    const resources = await VisualResource.findByColors(colorsArray, options);

    res.json({
      success: true,
      data: resources.map(resource => resource.getPublicData())
    });
  } catch (error) {
    console.error('Error al buscar recursos por colores:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/visual-resources - Crear nuevo recurso visual
router.post('/', async (req, res) => {
  try {
    const resourceData = req.body;

    // Validaciones básicas
    if (!resourceData.nombre || !resourceData.tipo || !resourceData.user_id) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos',
        required: ['nombre', 'tipo', 'user_id']
      });
    }

    const resource = await VisualResource.create(resourceData);

    res.status(201).json({
      success: true,
      message: 'Recurso visual creado exitosamente',
      data: resource.getPublicData()
    });
  } catch (error) {
    console.error('Error al crear recurso visual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// PUT /api/visual-resources/:id - Actualizar recurso visual
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const resource = await VisualResource.findById(id);
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Recurso visual no encontrado'
      });
    }

    // No permitir actualizar campos sensibles
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.creado_en;

    const updatedResource = await resource.update(updateData);

    res.json({
      success: true,
      message: 'Recurso visual actualizado exitosamente',
      data: updatedResource.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar recurso visual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// DELETE /api/visual-resources/:id - Eliminar recurso visual (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const resource = await VisualResource.findById(id);
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Recurso visual no encontrado'
      });
    }

    await resource.delete();

    res.json({
      success: true,
      message: 'Recurso visual eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar recurso visual:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/visual-resources/:id/use - Incrementar contador de uso
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;

    const resource = await VisualResource.findById(id);
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Recurso visual no encontrado'
      });
    }

    await resource.incrementUsage();

    res.json({
      success: true,
      message: 'Contador de uso actualizado',
      data: resource.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar uso del recurso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/visual-resources/stats/overview - Obtener estadísticas generales
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

    const [totalResources, activeResources, resourcesByType, resourcesByStyle] = await Promise.all([
      VisualResource.count(options),
      VisualResource.count({ ...options, activo: true }),
      VisualResource.count({ ...options, tipo: 'moodboard' }),
      VisualResource.count({ ...options, estilo_grafico: 'minimalista' })
    ]);

    res.json({
      success: true,
      data: {
        total_recursos: totalResources,
        recursos_activos: activeResources,
        recursos_inactivos: totalResources - activeResources,
        moodboards: resourcesByType,
        recursos_minimalistas: resourcesByStyle
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de recursos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;
