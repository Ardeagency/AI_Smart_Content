const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID']
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// Endpoint para webhook de guiones
app.post('/api/webhook/scripts', (req, res) => {
  console.log('🔄 Enviando petición a webhook de guiones...');
  
  const postData = JSON.stringify(req.body);
  
  const options = {
    hostname: 'ardeagency.app.n8n.cloud',
    port: 443,
    path: '/webhook/4635dddf-f8f9-4cc2-be0f-54e1c542d702',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const request = https.request(options, (response) => {
    let data = '';
    
    response.on('data', (chunk) => {
      data += chunk;
    });
    
    response.on('end', () => {
      console.log(`✅ Respuesta del webhook de guiones: ${response.statusCode}`);
      
      try {
        const jsonData = JSON.parse(data);
        res.status(response.statusCode).json(jsonData);
      } catch (parseError) {
        res.status(response.statusCode).send(data);
      }
    });
  });

  request.on('error', (error) => {
    console.error('❌ Error en webhook de guiones:', error.message);
    res.status(500).json({ 
      error: 'Error del servidor',
      details: error.message 
    });
  });

  request.write(postData);
  request.end();
});

// Endpoint para webhook de escenas
app.post('/api/webhook/scenes', (req, res) => {
  console.log('🔄 Enviando petición a webhook de escenas...');
  
  const postData = JSON.stringify(req.body);
  
  const options = {
    hostname: 'ardeagency.app.n8n.cloud',
    port: 443,
    path: '/webhook/6b8560d8-b00c-4cda-85a1-143e4d5e869c',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const request = https.request(options, (response) => {
    let data = '';
    
    response.on('data', (chunk) => {
      data += chunk;
    });
    
    response.on('end', () => {
      console.log(`✅ Respuesta del webhook de escenas: ${response.statusCode}`);
      
      try {
        const jsonData = JSON.parse(data);
        res.status(response.statusCode).json(jsonData);
      } catch (parseError) {
        res.status(response.statusCode).send(data);
      }
    });
  });

  request.on('error', (error) => {
    console.error('❌ Error en webhook de escenas:', error.message);
    res.status(500).json({ 
      error: 'Error del servidor',
      details: error.message 
    });
  });

  request.write(postData);
  request.end();
});

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
  console.log(`🔄 Webhook guiones: /api/webhook/scripts`);
  console.log(`🔄 Webhook escenas: /api/webhook/scenes`);
});
