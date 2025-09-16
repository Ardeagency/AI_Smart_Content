const express = require('express');
const Product = require('../models/Product');
const router = express.Router();

// GET /api/products - Obtener todos los productos (con paginación y filtros)
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tipo,
      categoria,
      activo,
      destacado,
      user_id,
      brand_id
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      tipo,
      categoria,
      activo: activo !== undefined ? activo === 'true' : null,
      destacado: destacado !== undefined ? destacado === 'true' : null,
      user_id,
      brand_id
    };

    const [products, total] = await Promise.all([
      Product.findAll(options),
      Product.count(options)
    ]);

    res.json({
      success: true,
      data: products.map(product => product.getPublicData()),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/products/:id - Obtener producto por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: product.getPublicData()
    });
  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/products/user/:userId - Obtener productos por usuario
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activo, tipo, categoria } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo,
      categoria
    };

    const products = await Product.findByUserId(userId, options);

    res.json({
      success: true,
      data: products.map(product => product.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener productos por usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/products/brand/:brandId - Obtener productos por marca
router.get('/brand/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;
    const { activo, tipo, categoria } = req.query;

    const options = {
      activo: activo !== undefined ? activo === 'true' : null,
      tipo,
      categoria
    };

    const products = await Product.findByBrandId(brandId, options);

    res.json({
      success: true,
      data: products.map(product => product.getPublicData())
    });
  } catch (error) {
    console.error('Error al obtener productos por marca:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/products/search/tags - Buscar productos por tags
router.get('/search/tags', async (req, res) => {
  try {
    const { tags, activo, tipo, categoria } = req.query;

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
      categoria
    };

    const products = await Product.findByTags(tagsArray, options);

    res.json({
      success: true,
      data: products.map(product => product.getPublicData())
    });
  } catch (error) {
    console.error('Error al buscar productos por tags:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// POST /api/products - Crear nuevo producto
router.post('/', async (req, res) => {
  try {
    const productData = req.body;

    // Validaciones básicas
    if (!productData.nombre || !productData.tipo || !productData.categoria || !productData.user_id) {
      return res.status(400).json({
        success: false,
        error: 'Faltan campos requeridos',
        required: ['nombre', 'tipo', 'categoria', 'user_id']
      });
    }

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente',
      data: product.getPublicData()
    });
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// PUT /api/products/:id - Actualizar producto
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    // No permitir actualizar campos sensibles
    delete updateData.id;
    delete updateData.user_id;
    delete updateData.creado_en;

    const updatedProduct = await product.update(updateData);

    res.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: updatedProduct.getPublicData()
    });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// DELETE /api/products/:id - Eliminar producto (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    await product.delete();

    res.json({
      success: true,
      message: 'Producto eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

// GET /api/products/stats/overview - Obtener estadísticas generales
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

    const [totalProducts, activeProducts, productsByType, productsByCategory] = await Promise.all([
      Product.count(options),
      Product.count({ ...options, activo: true }),
      Product.count({ ...options, tipo: 'producto' }),
      Product.count({ ...options, tipo: 'servicio' })
    ]);

    res.json({
      success: true,
      data: {
        total_productos: totalProducts,
        productos_activos: activeProducts,
        productos_inactivos: totalProducts - activeProducts,
        productos_fisicos: productsByType,
        servicios: productsByCategory
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de productos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;
