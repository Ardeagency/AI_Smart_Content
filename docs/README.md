# UGC Studio - Plataforma de Generación de Contenido

## 📋 Descripción

UGC Studio es una plataforma completa para la generación de contenido User Generated Content (UGC) con backend serverless. Permite a los usuarios crear, gestionar y generar contenido visual de alta calidad para marcas y productos.

## 🚀 Características Principales

- **Dashboard Principal**: Interfaz centralizada para gestión de proyectos
- **Studio de Creación**: Herramienta avanzada para generación de UGC
- **Gestión de Marcas**: Administración completa de marcas y productos
- **Catálogo de Contenido**: Biblioteca de contenido generado
- **Sistema de Autenticación**: Login seguro con Supabase
- **Backend Serverless**: API REST con Express.js

## 🏗️ Arquitectura

### Frontend
- **HTML5/CSS3**: Interfaz responsive y moderna
- **JavaScript Vanilla**: Lógica de aplicación sin frameworks
- **Canvas API**: Generación de contenido visual
- **Supabase Client**: Integración con backend

### Backend
- **Express.js**: Servidor REST API
- **Supabase**: Base de datos y autenticación
- **CORS**: Configuración de seguridad
- **Axios**: Cliente HTTP

## 📁 Estructura del Proyecto

```
UGC/
├── 📄 Archivos Principales
│   ├── index.html              # Dashboard principal
│   ├── studio.html             # Studio de creación
│   ├── brands.html             # Gestión de marcas
│   ├── catalog.html            # Catálogo de contenido
│   ├── library.html            # Biblioteca de contenido
│   ├── login.html              # Sistema de autenticación
│   ├── planes.html             # Planes y precios
│   └── server.js               # Servidor backend
│
├── 🎨 Estilos (css/)
│   ├── style.css               # Estilos principales
│   ├── studio.css              # Estilos del studio
│   ├── dashboard.css            # Estilos del dashboard
│   ├── brands.css               # Estilos de marcas
│   ├── catalog.css              # Estilos del catálogo
│   ├── library.css              # Estilos de biblioteca
│   ├── login.css                # Estilos de login
│   ├── navigation.css           # Estilos de navegación
│   ├── canvas-animations.css    # Animaciones de canvas
│   └── payment-modal.css        # Estilos de pagos
│
├── ⚙️ Lógica (js/)
│   ├── main.js                 # Lógica principal
│   ├── studio.js               # Lógica del studio
│   ├── canvas-manager.js       # Gestión de canvas
│   ├── ugc-generator.js        # Generador de UGC
│   ├── data-collector.js      # Recolección de datos
│   ├── webhook-manager.js     # Gestión de webhooks
│   ├── brands.js               # Lógica de marcas
│   ├── catalog.js              # Lógica del catálogo
│   ├── library.js              # Lógica de biblioteca
│   ├── login.js                # Lógica de autenticación
│   ├── navigation.js            # Lógica de navegación
│   ├── planes.js               # Lógica de planes
│   ├── payment-modal.js        # Lógica de pagos
│   ├── onboarding-new.js       # Lógica de onboarding
│   ├── onboarding-verification.js # Verificación de onboarding
│   ├── supabase-client.js      # Cliente Supabase
│   ├── supabase-config.js      # Configuración Supabase
│   └── supabase-utils.js       # Utilidades Supabase
│
├── 📚 Documentación (docs/)
│   ├── README.md               # Documentación principal
│   ├── API.md                  # Documentación de API
│   ├── DEPLOYMENT.md           # Guía de despliegue
│   ├── CONTRIBUTING.md         # Guía de contribución
│   └── LICENSE                 # Licencia del proyecto
│
├── 🗄️ Base de Datos (SQL/)
│   ├── supabase-schema.sql     # Esquema principal
│   ├── public-supabase.sql     # Tablas públicas
│   ├── oauth-supabase.sql      # Configuración OAuth
│   ├── bucket.ugc-supabase.sql # Configuración de buckets
│   └── setup-product-images-bucket.sql # Setup de imágenes
│
├── 📦 Configuración
│   ├── package.json            # Dependencias del proyecto
│   ├── package-lock.json       # Lock de dependencias
│   └── node_modules/           # Dependencias instaladas
│
└── 🔗 Referencias (speel/)
    └── [Archivos de referencia externa]
```

## 🛠️ Instalación y Configuración

### Prerrequisitos
- Node.js (v14 o superior)
- npm o yarn
- Cuenta de Supabase

### Instalación
```bash
# Clonar el repositorio
git clone [URL_DEL_REPOSITORIO]

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Iniciar servidor de desarrollo
npm run dev
```

### Configuración de Supabase
1. Crear proyecto en Supabase
2. Ejecutar scripts SQL en el orden correcto
3. Configurar políticas de seguridad
4. Configurar autenticación OAuth

## 🚀 Uso

### Dashboard Principal
- Acceso a todas las funcionalidades
- Gestión de proyectos
- Estadísticas y métricas

### Studio de Creación
- Selección de marca y producto
- Configuración de parámetros
- Generación de contenido UGC
- Preview en tiempo real

### Gestión de Marcas
- Crear y editar marcas
- Configurar productos
- Gestionar imágenes
- Definir guidelines

## 🔧 API Endpoints

### Autenticación
- `POST /auth/login` - Iniciar sesión
- `POST /auth/logout` - Cerrar sesión
- `GET /auth/user` - Obtener usuario actual

### Marcas y Productos
- `GET /brands` - Listar marcas
- `POST /brands` - Crear marca
- `PUT /brands/:id` - Actualizar marca
- `DELETE /brands/:id` - Eliminar marca

### Contenido UGC
- `GET /ugc` - Listar contenido
- `POST /ugc/generate` - Generar contenido
- `GET /ugc/:id` - Obtener contenido específico

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Linting
npm run lint

# Build
npm run build
```

## 📈 Despliegue

### Producción
```bash
# Build para producción
npm run build

# Desplegar en servidor
# Configurar variables de entorno de producción
# Ejecutar migraciones de base de datos
```

### Variables de Entorno
```env
SUPABASE_URL=tu_url_de_supabase
SUPABASE_ANON_KEY=tu_clave_anonima
PORT=3000
NODE_ENV=production
```

## 🤝 Contribución

Ver [CONTRIBUTING.md](CONTRIBUTING.md) para detalles sobre cómo contribuir al proyecto.

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver [LICENSE](LICENSE) para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- Crear un issue en GitHub
- Contactar al equipo de desarrollo
- Revisar la documentación en `/docs`

---

**Versión**: 1.0.0  
**Última actualización**: Octubre 2024  
**Mantenido por**: ARDE Agency
