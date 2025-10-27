# 🎬 UGC Studio

Plataforma completa para generación de contenido UGC (User Generated Content) con backend serverless.

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
npm install
```

2. **Configurar variables de entorno:**
Crea un archivo `.env` con:
```env
WEAVY_API_KEY=tu_api_key_aqui
UGC_WORKFLOW_WEBHOOK_URL=https://app.weavy.ai/flow/mWiC6EeWLT0v8VFss4VP9s
PORT=3000
```

3. **Ejecutar la aplicación:**
```bash
npm start
```

## 📱 Uso

1. **Acceder al generador:**
   - Visita: `http://localhost:3000/studio`

2. **Completar el formulario:**
   - **Información básica:** URL del producto y creative brief
   - **Configuración técnica:** Formato y relación de aspecto
   - **Características del personaje:** Selecciona las opciones deseadas

3. **Generar UGC:**
   - Haz clic en "Generar UGC"
   - El sistema enviará los datos a Weavy AI
   - Recibirás la respuesta con el contenido generado

## 🏗️ Estructura del Proyecto

```
├── index.html               # Página principal
├── studio.html              # Interfaz del generador UGC
├── main-dashboard.html      # Panel principal
├── library.html            # Biblioteca de archivos
├── catalog.html            # Catálogo de productos
├── brands.html             # Gestión de marcas
├── planes.html            # Planes y precios
├── login.html              # Autenticación
├── onboarding-new.html      # Onboarding de usuarios
├── css/                    # Estilos CSS
├── js/                     # JavaScript modules
├── speel/                  # Referencia de implementación
└── package.json            # Configuración del proyecto
```

## 🎯 Páginas Principales

- **`index.html`** - Landing page principal
- **`studio.html`** - Generador de contenido UGC
- **`main-dashboard.html`** - Panel de control principal
- **`library.html`** - Gestión de archivos y assets
- **`catalog.html`** - Catálogo de productos
- **`brands.html`** - Gestión de marcas
- **`planes.html`** - Planes y precios
- **`login.html`** - Autenticación de usuarios

## 🔧 Scripts Disponibles

```bash
npm run dev      # Servidor de desarrollo
npm start        # Iniciar aplicación
npm run build    # Build del proyecto
npm run deploy   # Deploy a GitHub Pages
```

## 🛠️ Tecnologías

- **Frontend:** HTML5, CSS3, JavaScript ES6+
- **Backend:** Supabase (serverless)
- **AI Integration:** Weavy AI
- **Styling:** CSS custom properties, responsive design
- **Deployment:** GitHub Pages, Netlify, Vercel

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

## 📞 Soporte

- **Email:** support@ugcstudio.com
- **Issues:** [GitHub Issues](https://github.com/ardeagency/ugc-studio/issues)

---

**Desarrollado por ARDE Agency** 🚀
