const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rutas para las diferentes páginas
app.get('/main-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'main-dashboard.html'));
});

app.get('/studio', (req, res) => {
  res.sendFile(path.join(__dirname, 'studio.html'));
});

app.get('/library', (req, res) => {
  res.sendFile(path.join(__dirname, 'library.html'));
});

app.get('/catalog', (req, res) => {
  res.sendFile(path.join(__dirname, 'catalog.html'));
});

app.get('/brands', (req, res) => {
  res.sendFile(path.join(__dirname, 'brands.html'));
});

app.get('/planes', (req, res) => {
  res.sendFile(path.join(__dirname, 'planes.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/onboarding-new', (req, res) => {
  res.sendFile(path.join(__dirname, 'onboarding-new.html'));
});

// Ruta para el generador simple
app.get('/ugc-simple', (req, res) => {
  res.sendFile(path.join(__dirname, 'ugc-simple.html'));
});

// API Routes
app.post('/api/trigger-ugc-workflow', async (req, res) => {
  try {
    const {
      url,
      creative_brief,
      output_format,
      aspect_ratio,
      product_images,
      character_options
    } = req.body;

    // Validar datos requeridos
    if (!url || !creative_brief) {
      return res.status(400).json({
        success: false,
        message: 'URL del producto y Creative Brief son requeridos'
      });
    }

    // Preparar payload para Weavy API
    const weavyPayload = {
      url: url,
      creative_brief: creative_brief,
      output_format: output_format || 'video',
      aspect_ratio: aspect_ratio || '16:9',
      product_images: product_images || [],
      character_options: character_options || {}
    };

    console.log('Enviando datos a Weavy API:', JSON.stringify(weavyPayload, null, 2));

    // Llamada directa al flujo de Weavy
    const weavyFlowUrl = 'https://app.weavy.ai/flow/mWiC6EeWLT0v8VFss4VP9s';
    const weavyApiKey = process.env.WEAVY_API_KEY || 'demo-key';

    try {
      // Llamada directa al flujo de Weavy
      const weavyResponse = await axios.post(weavyFlowUrl, weavyPayload, {
        headers: {
          'Authorization': `Bearer ${weavyApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 300000 // 5 minutos timeout para el flujo
      });

      console.log('Respuesta de Weavy API:', weavyResponse.data);

      // Procesar respuesta de Weavy API para 6 videos
      const weavyData = weavyResponse.data;
      const processedData = {
        workflow_id: weavyData.workflow_id || 'demo-workflow-123',
        status: 'completed',
        total_videos: weavyData.total_videos || 6,
        generated_videos: weavyData.generated_videos || weavyData.videos || [],
        character_used: character_options,
        product_images_used: product_images,
        generation_time: weavyData.generation_time || '2.5 minutos',
        quality: weavyData.quality || 'HD 1080p'
      };

      res.json({
        success: true,
        message: 'UGC generado exitosamente',
        data: processedData
      });

    } catch (weavyError) {
      console.error('Error llamando a Weavy API:', weavyError.response?.data || weavyError.message);
      
      // En caso de error, devolver respuesta simulada para desarrollo con 6 videos
      const generatedVideos = [];
      for (let i = 1; i <= 6; i++) {
        generatedVideos.push({
          id: `video-${i}`,
          video_url: `https://example.com/generated-video-${i}.mp4`,
          thumbnail_url: `https://example.com/thumbnail-${i}.jpg`,
          duration: '30s',
          format: output_format,
          aspect_ratio: aspect_ratio,
          variation: `Variación ${i}`,
          style: i <= 2 ? 'Formal' : i <= 4 ? 'Casual' : 'Creativo',
          focus: i % 2 === 0 ? 'Producto' : 'Beneficios'
        });
      }

      res.json({
        success: true,
        message: 'UGC generado exitosamente (modo demo)',
        data: {
          workflow_id: 'demo-workflow-' + Date.now(),
          status: 'completed',
          total_videos: 6,
          generated_videos: generatedVideos,
          character_used: character_options,
          product_images_used: product_images,
          generation_time: '2.5 minutos',
          quality: 'HD 1080p'
        },
        demo_mode: true
      });
    }

  } catch (error) {
    console.error('Error en trigger-ugc-workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
});

// Ruta para obtener estado del workflow
app.get('/api/workflow-status/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    // Simular verificación de estado
    res.json({
      success: true,
      workflow_id: workflowId,
      status: 'completed',
      progress: 100,
      message: 'Workflow completado'
    });
  } catch (error) {
    console.error('Error obteniendo estado del workflow:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estado del workflow',
      error: error.message
    });
  }
});

// Ruta para obtener datos de productos (para el dropdown)
app.get('/api/products', async (req, res) => {
  try {
    // Simular datos de productos
    const products = [
      { id: '1', name: 'Producto Demo 1', type: 'Electrónico' },
      { id: '2', name: 'Producto Demo 2', type: 'Ropa' },
      { id: '3', name: 'Producto Demo 3', type: 'Hogar' }
    ];

    res.json({
      success: true,
      products: products
    });
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo productos',
      error: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📱 Aplicación UGC Studio disponible`);
  console.log(`🔗 Presiona Ctrl+C para detener el servidor`);
  console.log(`🔧 Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Weavy API: ${process.env.WEAVY_API_URL || 'https://api.weavy.ai/v1/ugc/generate'}`);
});
