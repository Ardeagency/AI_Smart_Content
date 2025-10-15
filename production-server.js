const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS para todas las solicitudes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID']
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Proxy para webhook de generación de guiones
app.use('/api/webhook/scripts', createProxyMiddleware({
  target: 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702',
  changeOrigin: true,
  pathRewrite: {
    '^/api/webhook/scripts': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // Añadir headers necesarios
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Accept', 'application/json');
    
    // Añadir query parameter 'v' si existe
    if (req.query.v) {
      proxyReq.path += (proxyReq.path.includes('?') ? '&' : '?') + `v=${req.query.v}`;
    }
    
    console.log(`🔄 Proxying scripts request to: ${proxyReq.getHeader('host')}${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Añadir headers CORS a la respuesta
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-User-ID';
    
    console.log(`✅ Scripts response: ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error('❌ Error en proxy de scripts:', err.message);
    res.status(500).json({ 
      error: 'Error del servidor proxy',
      details: err.message 
    });
  },
  logger: console
}));

// Proxy para webhook de generación de escenas
app.use('/api/webhook/scenes', createProxyMiddleware({
  target: 'https://ardeagency.app.n8n.cloud/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c',
  changeOrigin: true,
  pathRewrite: {
    '^/api/webhook/scenes': ''
  },
  onProxyReq: (proxyReq, req, res) => {
    // Añadir headers necesarios
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('Accept', 'application/json');
    
    // Añadir query parameter 'v' si existe
    if (req.query.v) {
      proxyReq.path += (proxyReq.path.includes('?') ? '&' : '?') + `v=${req.query.v}`;
    }
    
    console.log(`🔄 Proxying scenes request to: ${proxyReq.getHeader('host')}${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    // Añadir headers CORS a la respuesta
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-User-ID';
    
    console.log(`✅ Scenes response: ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error('❌ Error en proxy de escenas:', err.message);
    res.status(500).json({ 
      error: 'Error del servidor proxy',
      details: err.message 
    });
  },
  logger: console
}));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Rutas principales
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/studio', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio.html'));
});

app.get('/studio.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio.html'));
});

app.get('/main-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'main-dashboard.html'));
});

app.get('/main-dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'main-dashboard.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/planes', (req, res) => {
  res.sendFile(path.join(__dirname, 'planes.html'));
});

app.get('/planes.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'planes.html'));
});

app.get('/library', (req, res) => {
  res.sendFile(path.join(__dirname, 'library.html'));
});

app.get('/library.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'library.html'));
});

app.get('/brands', (req, res) => {
  res.sendFile(path.join(__dirname, 'brands.html'));
});

app.get('/brands.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'brands.html'));
});

app.get('/catalog', (req, res) => {
  res.sendFile(path.join(__dirname, 'catalog.html'));
});

app.get('/catalog.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'catalog.html'));
});

app.get('/onboarding-new', (req, res) => {
  res.sendFile(path.join(__dirname, 'onboarding-new.html'));
});

app.get('/onboarding-new.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'onboarding-new.html'));
});

app.get('/verify-email', (req, res) => {
  res.sendFile(path.join(__dirname, 'verify-email.html'));
});

app.get('/verify-email.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'verify-email.html'));
});

app.get('/auth-callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth-callback.html'));
});

app.get('/auth-callback.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'auth-callback.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 UGC Studio ejecutándose en puerto ${PORT}`);
  console.log(`📱 Accede en: http://localhost:${PORT}`);
  console.log(`✅ CORS habilitado para webhooks externos`);
  console.log(`🔄 Proxy scripts: /api/webhook/scripts -> https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702`);
  console.log(`🔄 Proxy scenes: /api/webhook/scenes -> https://ardeagency.app.n8n.cloud/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c`);
});

