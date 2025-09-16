const express = require('express');
const GenerationConfig = require('../models/GenerationConfig');
const router = express.Router();

// GET /api/generation-configs - Obtener todas las configuraciones (con paginación y filtros)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      es_plantilla,
      activo,
      favorito,
      user_id,
      brand_id
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      es_plantilla: es_plantilla !== undefined ? es_plantilla === 'true' : null,
      activo: activo !== undefined ? activo === 'true' : null,
      favorito: favorito !== undefined ? favorito === 'true' : null,
      user_id,
      brand_id
    };

    const [configs, total] = await Promise.all([
      GenerationConfig.findAll(options),
      GenerationConfig.count(options)
    ]);

    res.json({
      success: true,
      data: configs.map(config => config.getPublicData()),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener configuraciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-configs/:id - Obtener configuración por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await GenerationConfig.findById(id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    res.json({
      success: true,
      data: config.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-configs/user/:userId - Obtener configuraciones por usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activo, es_plantilla, favorito } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      es_plantilla: es_plantilla !== undefined ? es_plantilla === 'true' : null,
      favorito: favorito !== undefined ? favorito === 'true' : null
    };

    const configs = await GenerationConfig.findByUserId(userId, options);

    res.json({
      success: true,
      data: configs.map(config => config.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener configuraciones por usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-configs/brand/:brandId - Obtener configuraciones por marca
router.get('/brand/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    const { activo, es_plantilla, favorito } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      es_plantilla: es_plantilla !== undefined ? es_plantilla === 'true' : null,
      favorito: favorito !== undefined ? favorito === 'true' : null
    };

    const configs = await GenerationConfig.findByBrandId(brandId, options);

    res.json({
      success: true,
      data: configs.map(config => config.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener configuraciones por marca:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-configs/search/ugc-types - Buscar configuraciones por tipos de UGC
router.get('/search/ugc-types', async (req, res) => {
  try {
    const { types, activo, es_plantilla } = req.query;

    if (!types) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro types es requerido'
      });
    }

    const typesArray = Array.isArray(types) ? types : [types];
    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      es_plantilla: es_plantilla !== undefined ? es_plantilla === 'true' : null
    };

    const configs = await GenerationConfig.findByUgcTypes(typesArray, options);

    res.json({
      success: true,
      data: configs.map(config => config.getPublicData())
    });
  } catch (error) {
    console.error('Error al buscar configuraciones por tipos UGC:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-configs - Crear nueva configuración
router.post('/', async (req, res) => {
  try {
    const configData = req.body;

    // Validaciones básicas
    if (!configData.nombre || !configData.tipos_ugc || !configData.user_id) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos',
        required: ['nombre', 'tipos_ugc', 'user_id']
      });
    }

    const config = await GenerationConfig.create(configData);

    res.status(201).json({
      success: true,
      message: 'Configuración creada exitosamente',
      data: config.getPublicData()
    });
  } catch (error) {
    console.error('Error al crear configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// PUT /api/generation-configs/:id - Actualizar configuración
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const config = await GenerationConfig.findById(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    // No permitir actualizar campos sensibles
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.creado_en;

    const updatedConfig = await config.update(updateData);

    res.json({
      success: true,
      message: 'Configuración actualizada exitosamente',
      data: updatedConfig.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// DELETE /api/generation-configs/:id - Eliminar configuración (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const config = await GenerationConfig.findById(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    await config.delete();

    res.json({
      success: true,
      message: 'Configuración eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-configs/:id/use - Incrementar contador de uso
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;

    const config = await GenerationConfig.findById(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    await config.incrementUsage();

    res.json({
      success: true,
      message: 'Contador de uso actualizado',
      data: config.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar uso de la configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-configs/:id/clone - Clonar configuración
router.post('/:id/clone', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, nombre } = req.body;

    if (!user_id || !nombre) {
      return res.status(400).json({
        success: false,
        error: 'user_id y nombre son requeridos'
      });
    }

    const originalConfig = await GenerationConfig.findById(id);
    if (!originalConfig) {
      return res.status(404).json({
        success: false,
        error: 'Configuración no encontrada'
      });
    }

    // Crear nueva configuración basada en la original
    const configData = {
      ...originalConfig.getPublicData(),
      id: undefined,
      user_id,
      nombre,
      es_plantilla: false,
      favorito: false,
      uso_frecuente: 0,
      creado_en: undefined,
      actualizado_en: undefined
    };

    const newConfig = await GenerationConfig.create(configData);

    res.status(201).json({
      success: true,
      message: 'Configuración clonada exitosamente',
      data: newConfig.getPublicData()
    });
  } catch (error) {
    console.error('Error al clonar configuración:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-configs/stats/overview - Obtener estadísticas generales
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

    const [totalConfigs, activeConfigs, templates, favorites] = await Promise.all([
      GenerationConfig.count(options),
      GenerationConfig.count({ ...options, activo: true }),
      GenerationConfig.count({ ...options, es_plantilla: true }),
      GenerationConfig.count({ ...options, favorito: true })
    ]);

    res.json({
      success: true,
      data: {
        total_configuraciones: totalConfigs,
        configuraciones_activas: activeConfigs,
        configuraciones_inactivas: totalConfigs - activeConfigs,
        plantillas: templates,
        favoritos: favorites
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de configuraciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;
