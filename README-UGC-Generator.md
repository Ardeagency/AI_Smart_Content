# 🎬 Generador de UGC con Weavy

Sistema simplificado para generar contenido UGC (User Generated Content) utilizando Weavy AI.

## ✨ Características

- **Interfaz intuitiva** con formulario completo para configurar el personaje UGC
- **Opciones detalladas** para personalizar:
  - Género, edad, etnia
  - Color de ojos, estilo de cabello
  - Expresiones faciales
  - Estilos de vestimenta
- **Integración con Weavy AI** para generación de contenido
- **Configuración técnica** (formato, relación de aspecto)

## 🚀 Instalación

1. **Instalar dependencias:**
```bash
npm install express cors http-proxy-middleware axios dotenv
```

2. **Configurar variables de entorno:**
Crea un archivo `.env` con:
```env
WEAVY_API_KEY=tu_api_key_aqui
UGC_WORKFLOW_WEBHOOK_URL=https://app.weavy.ai/flow/mWiC6EeWLT0v8VFss4VP9s
PORT=3000
```

3. **Ejecutar el servidor:**
```bash
node server.js
```

## 📱 Uso

1. **Acceder al generador:**
   - Visita: `http://localhost:3000/ugc-generator`

2. **Completar el formulario:**
   - **Información básica:** URL del producto y creative brief
   - **Configuración técnica:** Formato y relación de aspecto
   - **Características del personaje:** Selecciona las opciones deseadas

3. **Generar UGC:**
   - Haz clic en "Generar UGC"
   - El sistema enviará los datos a Weavy AI
   - Recibirás la respuesta con el contenido generado

## 🎯 Opciones del Personaje

### Género
- Masculino
- Femenino
- No binario

### Edad
- 10-17 años
- 18-25 años
- 26-30 años
- 31-35 años
- 36-40 años
- 41-45 años
- 46-50 años
- 51-55 años
- 56-60 años
- 61-65 años
- 66-70 años

### Etnia
- Caucásico
- Asiático
- Árabe
- Africano
- Latinoamericano

### Características Físicas
- **Color de ojos:** Marrón, Azul, Verde, Gris, Miel
- **Estilo de cabello:** Muy rizado largo, Liso largo, Rizado corto, Liso corto, Largo en moño, Largo con ondas, Corto con ondas

### Expresiones
- Alegría emocionada
- Confianza tranquila
- Ira contenida
- Duda escéptica
- Anticipación ansiosa
- Fatiga melancólica

### Estilos de Vestimenta
- Mediterráneo Smart Casual
- Preppy Moderno
- Ropa de Trabajo
- Chic Parisino
- Athleisure de Lujo
- Neo Rockabilly
- Mod de los 60s
- Western Contemporáneo
- Normcore Minimalista
- Vanguardia Japonesa
- Pijama
- Estilo Bohemio Hippie

### Estética y Color
- Piel natural con poros
- Temperatura ligeramente cálida
- Grano sutil tipo película
- Contraste moderado, sombras suaves
- Reflejos naturales
- Saturación natural
- Balance de blancos realista
- Aberración cromática sutil
- Viñeta muy ligera
- Enfoque moderado

### Detalles de Realismo
- Pelitos sueltos visibles
- Huellas dactilares ligeras
- Arrugas naturales de tela
- Micro temblor de mano
- Polvo/fibra diminuta en superficie
- Brillo natural de piel
- Sombras imperfectas de fondo
- Manchas ligeras en mesa
- Reflejo suave de ventana
- Distorsión sutil de lente ultra ancha

### Imágenes del Producto
- **5 imágenes predefinidas** disponibles para selección
- **Selección múltiple** - puedes elegir varias imágenes
- **Vista previa** de cada imagen en miniatura
- **URLs de alta calidad** para Weavy AI
- **Thumbnails optimizados** para carga rápida

## 🔧 API Endpoints

### POST `/api/trigger-ugc-workflow`
Endpoint principal para generar UGC con Weavy.

**Payload:**
```json
{
  "url": "https://ejemplo.com/producto",
  "creative_brief": "Descripción del brief creativo",
  "output_format": "video|image|both",
  "aspect_ratio": "16:9|9:16|1:1|4:3",
  "character_options": {
    "gender": ["Male", "Female"],
    "age": ["18-25", "26-30"],
    "ethnicity": ["Caucasian", "Asian"],
    "eyes": ["Brown", "Blue"],
    "hair": ["Long hair with waves"],
    "expression": ["Joyful excitement"],
    "style": ["Mediterranean Smart Casual"],
    "aesthetic": ["Natural skin with pores", "Slightly warm (+3% temp)"],
    "realism": ["Loose baby hairs visible", "Light fingerprints on bottle/screen"],
    "product_images": [
      "https://media.weavy.ai/image/upload/v1760896053/uploads/nsU92XFUTrXHLh6sLA0Ya1Vpe4D3/mpwvzbq831ndgkiythll.png",
      "https://media.weavy.ai/image/upload/v1760896273/uploads/nsU92XFUTrXHLh6sLA0Ya1Vpe4D3/t4v29uij2clhzgk8rphm.png"
    ]
  }
}
```

**Respuesta exitosa:**
```json
{
  "message": "Flujo UGC iniciado correctamente en Weavy.",
  "workflowResponse": { ... },
  "characterOptions": { ... }
}
```

## 🛠️ Estructura del Proyecto

```
├── server.js                 # Servidor principal
├── ugc-generator.html       # Interfaz del generador
├── js/
│   └── studio.js            # Lógica del frontend (simplificada)
├── config.example.js        # Configuración de ejemplo
└── README-UGC-Generator.md  # Este archivo
```

## 🔑 Configuración de Weavy

1. **Obtener API Key:**
   - Accede a tu cuenta de Weavy
   - Genera una API Key para el flujo

2. **Configurar el flujo:**
   - URL del flujo: `https://app.weavy.ai/flow/mWiC6EeWLT0v8VFss4VP9s`
   - Configura la autenticación según los requisitos de Weavy

3. **Probar la integración:**
   - Usa el formulario web para probar
   - Revisa los logs del servidor para debugging

## 🐛 Troubleshooting

### Error de conexión
- Verifica que la API Key de Weavy sea correcta
- Confirma que la URL del flujo sea válida
- Revisa los logs del servidor

### Error de autenticación
- Verifica que `WEAVY_API_KEY` esté configurada
- Confirma que la API Key tenga los permisos necesarios

### Timeout
- El timeout está configurado en 5 minutos
- Para flujos más largos, ajusta el valor en `server.js`

## 📝 Notas

- El sistema mantiene compatibilidad con los endpoints existentes
- Los datos del personaje se envían como arrays para permitir múltiples selecciones
- El formulario valida que al menos se seleccione una opción por categoría
- La respuesta incluye tanto el resultado de Weavy como las opciones seleccionadas

## 🚀 Próximos Pasos

1. **Integrar con el sistema principal** de studio
2. **Agregar más opciones** de personalización
3. **Implementar guardado** de configuraciones
4. **Agregar preview** del personaje generado
5. **Optimizar la UI** para móviles
