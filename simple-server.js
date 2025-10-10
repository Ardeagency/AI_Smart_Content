const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS para todas las rutas
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID']
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
});
