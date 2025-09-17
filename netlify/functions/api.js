const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const serverless = require('serverless-http');
require('dotenv').config();

const { testConnection } = require('../../config/database');
const userRoutes = require('../../routes/userRoutes');
const brandRoutes = require('../../routes/brandRoutes');
const productRoutes = require('../../routes/productRoutes');
const avatarRoutes = require('../../routes/avatarRoutes');
const visualResourceRoutes = require('../../routes/visualResourceRoutes');
const generationConfigRoutes = require('../../routes/generationConfigRoutes');
const generationResultRoutes = require('../../routes/generationResultRoutes');

const app = express();

// Middlewares de seguridad
app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https://via.placeholder.com", "https://i.pravatar.cc"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
}));
app.use(cors());

// Middlewares para parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos con headers anti-caché
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rutas
app.use('/api/users', userRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/products', productRoutes);
app.use('/api/avatars', avatarRoutes);
app.use('/api/visual-resources', visualResourceRoutes);
app.use('/api/generation-configs', generationConfigRoutes);
app.use('/api/generation-results', generationResultRoutes);

// Ruta de salud
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'Connected' : 'Disconnected',
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    res.status(500).json({
      status: 'DOWN',
      database: 'Error',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'API de Perfil de Usuario UGC',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      users: '/api/users',
      brands: '/api/brands',
      products: '/api/products',
      avatars: '/api/avatars',
      visualResources: '/api/visual-resources',
      generationConfigs: '/api/generation-configs',
      generationResults: '/api/generation-results'
    }
  });
});

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Ocurrió un error en el servidor',
    error: process.env.NODE_ENV === 'development' ? err.stack : {}
  });
});

// Exportar el handler para Netlify Functions
module.exports.handler = serverless(app);
