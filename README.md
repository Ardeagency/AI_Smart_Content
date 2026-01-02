# AI Smart Content - Single Page Application

Plataforma de generación de contenido con IA desarrollada por Arde Agency.

---

## 🚀 Características

- **Single Page Application (SPA)** - Navegación fluida sin recargas
- **Autenticación completa** - Login, registro, y gestión de sesiones
- **Dashboard interactivo** - Gestión de productos, campañas y contenido
- **Editor de contenido** - Creación de contenido con IA
- **Optimizado** - Transiciones suaves, lazy loading, y cache inteligente

---

## 📁 Estructura del Proyecto

```
/
├── index.html                    # Container único SPA
├── css/                          # Estilos
│   ├── base.css                  # Estilos base
│   ├── app.css                   # Estilos SPA
│   └── [CSS modular]
├── js/
│   ├── app.js                    # App principal
│   ├── router.js                 # Sistema de routing
│   ├── views/                    # Vistas de la aplicación
│   ├── components/               # Componentes reutilizables
│   ├── services/                 # Servicios (Auth, Supabase, etc.)
│   └── utils/                    # Utilidades
├── templates/                    # Templates HTML de vistas
├── docs/                         # Documentación
└── _old/                         # Backup de archivos antiguos
```

---

## 🛠️ Setup

### Requisitos

- Servidor web (Netlify, Vercel, o similar)
- Supabase (para backend)
- Node.js (opcional, para desarrollo local)

### Instalación

1. Clonar el repositorio
2. Configurar variables de entorno en Netlify:
   - `SUPABASE_DATABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Desplegar en Netlify

### Desarrollo Local

```bash
# Usar un servidor local simple
python -m http.server 8000
# o
npx serve
```

Abrir `http://localhost:8000` en el navegador.

---

## 🏗️ Arquitectura

### SPA (Single Page Application)

La aplicación es una SPA construida con Vanilla JavaScript:

- **Router**: Hash-based routing (`#/route`)
- **Vistas**: Clases que extienden `BaseView`
- **Servicios**: Lógica centralizada (Auth, Supabase, Estado)
- **Componentes**: Elementos reutilizables (Navigation)

### Flujo de Navegación

```
Usuario → Router → Vista → Servicios → Supabase
                ↓
         Navigation (actualiza UI)
```

### Rutas

**Públicas**:
- `/` - Landing page
- `/login` - Login
- `/planes` - Planes y registro

**Protegidas**:
- `/form-record` - Formulario de onboarding
- `/living` - Dashboard principal
- `/studio` - Editor de contenido
- `/products` - Gestión de productos

---

## 📚 Documentación

- **[Guía de Desarrollo](docs/SPA_DEVELOPMENT_GUIDE.md)** - Guía completa para desarrolladores
- **[Plan de Migración](SPA_MIGRATION_PLAN.md)** - Plan completo de migración MPA → SPA
- **[Fases Detalladas](SPA_PHASES_DETAILED.md)** - Plan detallado por fases
- **[Arquitectura](SPA_ARCHITECTURE_DIAGRAM.md)** - Diagramas de arquitectura
- **[Ejemplos de Código](SPA_CODE_EXAMPLES.md)** - Ejemplos de implementación

---

## 🔧 Servicios Principales

### AuthService

Maneja autenticación de usuarios:

```javascript
// Login
const result = await window.authService.login(email, password);

// Verificar autenticación
const isAuth = await window.authService.isAuthenticated();

// Logout
await window.authService.logout();
```

### SupabaseService

Acceso unificado a Supabase:

```javascript
// Obtener cliente
const supabase = await window.supabaseService.getClient();

// Query
const { data } = await window.supabaseService.query('table', {
  select: '*',
  eq: { id: userId }
});
```

### AppState

Estado global de la aplicación:

```javascript
// Establecer valor
window.appState.set('key', value, true); // true = persistir

// Obtener valor
const value = window.appState.get('key');

// Suscribirse a cambios
window.appState.subscribe('key', (key, newValue, oldValue) => {
  // Manejar cambio
});
```

---

## 🎨 Desarrollo

### Agregar una Nueva Vista

1. Crear template en `templates/mi-vista.html`
2. Crear vista en `js/views/MiVista.js` extendiendo `BaseView`
3. Registrar en `index.html` y `app.js`

Ver [Guía de Desarrollo](docs/SPA_DEVELOPMENT_GUIDE.md) para más detalles.

### Convenciones

- **Vistas**: `PascalCase.js` (ej: `LandingView.js`)
- **Templates**: `kebab-case.html` (ej: `landing.html`)
- **Variables**: `camelCase`
- **Constantes**: `UPPER_SNAKE_CASE`

---

## 🧪 Testing

### Checklist de Testing

- [ ] Todas las rutas funcionan
- [ ] Autenticación completa
- [ ] Navegación fluida
- [ ] Route guards funcionando
- [ ] Responsive design
- [ ] Performance aceptable

---

## 🚀 Deployment

### Netlify

1. Conectar repositorio
2. Configurar variables de entorno
3. Deploy automático en push

### Configuración de Netlify

```toml
# netlify.toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 📝 Changelog

### v2.0.0 - Migración a SPA
- ✅ Migración completa de MPA a SPA
- ✅ Router con hash-based routing
- ✅ Servicios centralizados
- ✅ Estado global
- ✅ Optimizaciones de performance
- ✅ Manejo de errores mejorado

---

## 👥 Contribución

Ver [CONTRIBUTING.md](docs/CONTRIBUTING.md) para guías de contribución.

---

## 📄 Licencia

Ver [LICENSE](docs/LICENSE) para más información.

---

## 📞 Contacto

- **Email**: contact@ardeagency.com
- **WhatsApp**: +57 321 8300088
- **Web**: [www.ardeagency.com](https://www.ardeagency.com)

---

**Desarrollado por [Arde Agency](https://www.ardeagency.com)**

