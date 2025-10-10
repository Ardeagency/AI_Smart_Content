const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Proxy para webhook de guiones
app.post('/api/webhook/scripts', createProxyMiddleware({
  target: 'https://ardeagency.app.n8n.cloud/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702',
  changeOrigin: true,
  pathRewrite: {
    '^/api/webhook/scripts': ''
  },
  onError: (err, req, res) => {
    console.error('Error en proxy de scripts:', err);
    res.status(500).json({ error: 'Error del servidor proxy' });
  }
}));

// Proxy para webhook de escenas
app.post('/api/webhook/scenes', createProxyMiddleware({
  target: 'https://ardeagency.app.n8n.cloud/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c',
  changeOrigin: true,
  pathRewrite: {
    '^/api/webhook/scenes': ''
  },
  onError: (err, req, res) => {
    console.error('Error en proxy de escenas:', err);
    res.status(500).json({ error: 'Error del servidor proxy' });
  }
}));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor UGC Studio ejecutándose en puerto ${PORT}`);
  console.log(`📱 Accede en: http://localhost:${PORT}`);
});
