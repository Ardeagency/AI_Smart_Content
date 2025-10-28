# 🎨 UGC Studio

> Plataforma completa para generación de contenido User Generated Content (UGC) con backend serverless

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ardeagency/ugc-studio)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node.js-v14+-green.svg)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/supabase-ready-orange.svg)](https://supabase.com/)

## ✨ Características

- 🎯 **Dashboard Principal**: Interfaz centralizada para gestión de proyectos
- 🎨 **Studio de Creación**: Herramienta avanzada para generación de UGC
- 🏢 **Gestión de Marcas**: Administración completa de marcas y productos
- 📚 **Catálogo de Contenido**: Biblioteca de contenido generado
- 🔐 **Autenticación Segura**: Login con Supabase Auth
- ⚡ **Backend Serverless**: API REST con Express.js
- 🖼️ **Canvas Avanzado**: Generación de contenido visual interactivo
- 📱 **Responsive Design**: Optimizado para todos los dispositivos

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js v14 o superior
- npm o yarn
- Cuenta de Supabase

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/ardeagency/ugc-studio.git
cd ugc-studio

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Iniciar servidor de desarrollo
npm run dev
```

### Configuración de Supabase

1. Crear proyecto en [Supabase](https://supabase.com/dashboard)
2. Ejecutar scripts SQL en el orden correcto (ver `/SQL/`)
3. Configurar políticas de seguridad
4. Configurar autenticación OAuth

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
└── 🔗 Referencias (speel/)
    └── [Archivos de referencia externa]
```

## 🛠️ Tecnologías Utilizadas

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

### Base de Datos
- **PostgreSQL**: Base de datos principal
- **Supabase**: Plataforma backend-as-a-service
- **Row Level Security**: Seguridad a nivel de fila

## 🎯 Uso

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

## 📡 API

La aplicación incluye una API REST completa. Ver [API.md](docs/API.md) para documentación detallada.

### Endpoints Principales
- `POST /auth/login` - Autenticación
- `GET /brands` - Listar marcas
- `POST /brands` - Crear marca
- `GET /products` - Listar productos
- `POST /ugc/generate` - Generar contenido UGC

## 🚀 Despliegue

Ver [DEPLOYMENT.md](docs/DEPLOYMENT.md) para guía completa de despliegue en producción.

### Despliegue Rápido
```bash
# Build para producción
npm run build

# Desplegar con PM2
pm2 start ecosystem.config.js --env production
```

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Linting
npm run lint

# Build
npm run build
```

## 🤝 Contribución

¡Las contribuciones son bienvenidas! Por favor lee [CONTRIBUTING.md](docs/CONTRIBUTING.md) para detalles sobre cómo contribuir al proyecto.

### Proceso de Contribución
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver [LICENSE](docs/LICENSE) para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- 📧 Crear un [issue](https://github.com/ardeagency/ugc-studio/issues) en GitHub
- 📖 Revisar la [documentación](docs/) completa
- 💬 Contactar al equipo de desarrollo

## 🏆 Roadmap

### Próximas Características
- [ ] Integración con redes sociales
- [ ] Templates predefinidos
- [ ] Exportación en múltiples formatos
- [ ] Colaboración en tiempo real
- [ ] Analytics avanzados
- [ ] API de terceros

### Versiones
- **v1.0.0** - Versión inicial con funcionalidades básicas
- **v1.1.0** - Mejoras en UI/UX y rendimiento
- **v1.2.0** - Nuevas características y integraciones

## 🙏 Agradecimientos

- [Supabase](https://supabase.com/) por la plataforma backend
- [Express.js](https://expressjs.com/) por el framework web
- Comunidad de desarrolladores por el feedback y contribuciones

---

**Desarrollado con ❤️ por [ARDE Agency](https://ardeagency.com)**

[![GitHub](https://img.shields.io/badge/GitHub-ardeagency-black.svg)](https://github.com/ardeagency)
[![Website](https://img.shields.io/badge/Website-ardeagency.com-blue.svg)](https://ardeagency.com)