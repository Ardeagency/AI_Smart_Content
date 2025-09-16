const express = require('express');
const GenerationResult = require('../models/GenerationResult');
const router = express.Router();

// GET /api/generation-results - Obtener todos los resultados (con paginación y filtros)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tipo_resultado,
      estado,
      activo,
      favorito,
      descartado,
      user_id,
      brand_id,
      product_id,
      avatar_id
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      tipo_resultado,
      estado,
      activo: activo !== undefined ? activo === 'true' : null,
      favorito: favorito !== undefined ? favorito === 'true' : null,
      descartado: descartado !== undefined ? descartado === 'true' : null,
      user_id,
      brand_id,
      product_id,
      avatar_id
    };

    const [results, total] = await Promise.all([
      GenerationResult.findAll(options),
      GenerationResult.count(options)
    ]);

    res.json({
      success: true,
      data: results.map(result => result.getPublicData()),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener resultados:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-results/:id - Obtener resultado por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await GenerationResult.findById(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-results/request/:requestId - Obtener resultado por request_id
router.get('/request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const result = await GenerationResult.findByRequestId(requestId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    res.json({
      success: true,
      data: result.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener resultado por request_id:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-results/user/:userId - Obtener resultados por usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activo, tipo_resultado, estado, favorito, descartado } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo_resultado,
      estado,
      favorito: favorito !== undefined ? favorito === 'true' : null,
      descartado: descartado !== undefined ? descartado === 'true' : null
    };

    const results = await GenerationResult.findByUserId(userId, options);

    res.json({
      success: true,
      data: results.map(result => result.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener resultados por usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-results - Crear nuevo resultado
router.post('/', async (req, res) => {
  try {
    const resultData = req.body;

    // Validaciones básicas
    if (!resultData.request_id || !resultData.tipo_resultado || !resultData.user_id) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos',
        required: ['request_id', 'tipo_resultado', 'user_id']
      });
    }

    const result = await GenerationResult.create(resultData);

    res.status(201).json({
      success: true,
      message: 'Resultado creado exitosamente',
      data: result.getPublicData()
    });
  } catch (error) {
    console.error('Error al crear resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// PUT /api/generation-results/:id - Actualizar resultado
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const result = await GenerationResult.findById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    // No permitir actualizar campos sensibles
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.creado_en;

    const updatedResult = await result.update(updateData);

    res.json({
      success: true,
      message: 'Resultado actualizado exitosamente',
      data: updatedResult.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// DELETE /api/generation-results/:id - Eliminar resultado (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await GenerationResult.findById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    await result.delete();

    res.json({
      success: true,
      message: 'Resultado eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-results/:id/use - Incrementar contador de uso
router.post('/:id/use', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await GenerationResult.findById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    await result.incrementUsage();

    res.json({
      success: true,
      message: 'Contador de uso actualizado',
      data: result.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar uso del resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-results/:id/share - Incrementar contador de compartido
router.post('/:id/share', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await GenerationResult.findById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    await result.incrementShared();

    res.json({
      success: true,
      message: 'Contador de compartido actualizado',
      data: result.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar compartido del resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/generation-results/:id/download - Incrementar contador de descargado
router.post('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await GenerationResult.findById(id);
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Resultado no encontrado'
      });
    }

    await result.incrementDownloaded();

    res.json({
      success: true,
      message: 'Contador de descargado actualizado',
      data: result.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar descargado del resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-results/stats/overview - Obtener estadísticas generales
router.get('/stats/overview', async (req, res) => {
  try {
    const { user_id, fecha_inicio, fecha_fin, tipo_resultado } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id es requerido'
      });
    }

    const options = { user_id };
    if (fecha_inicio) options.fecha_inicio = fecha_inicio;
    if (fecha_fin) options.fecha_fin = fecha_fin;
    if (tipo_resultado) options.tipo_resultado = tipo_resultado;

    const stats = await GenerationResult.getStats(user_id, options);

    res.json({
      success: true,
      data: {
        total_resultados: parseInt(stats.total_resultados),
        favoritos: parseInt(stats.favoritos),
        descartados: parseInt(stats.descartados),
        calificacion_promedio: parseFloat(stats.calificacion_promedio) || 0,
        total_usos: parseInt(stats.total_usos),
        total_compartidos: parseInt(stats.total_compartidos),
        total_descargas: parseInt(stats.total_descargas),
        costo_total: parseFloat(stats.costo_total) || 0,
        tokens_totales: parseInt(stats.tokens_totales)
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de resultados:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/generation-results/stats/by-type - Obtener estadísticas por tipo
router.get('/stats/by-type', async (req, res) => {
  try {
    const { user_id, fecha_inicio, fecha_fin } = req.query;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id es requerido'
      });
    }

    const tipos = ['video', 'imagen', 'copy', 'guion'];
    const stats = {};

    for (const tipo of tipos) {
      const options = { user_id, tipo_resultado: tipo };
      if (fecha_inicio) options.fecha_inicio = fecha_inicio;
      if (fecha_fin) options.fecha_fin = fecha_fin;

      const tipoStats = await GenerationResult.getStats(user_id, options);
      stats[tipo] = {
        total: parseInt(tipoStats.total_resultados),
        favoritos: parseInt(tipoStats.favoritos),
        calificacion_promedio: parseFloat(tipoStats.calificacion_promedio) || 0,
        usos: parseInt(tipoStats.total_usos),
        costo: parseFloat(tipoStats.costo_total) || 0
      };
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error al obtener estadísticas por tipo:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;
