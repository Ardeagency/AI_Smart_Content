# 🚀 UGC STUDIO - Sistema de Generación de Contenido UGC

## 📋 Descripción del Proyecto

UGC STUDIO es una plataforma web para la generación automatizada de contenido User Generated Content (UGC) personalizado. El sistema permite a los usuarios configurar sus marcas, productos y preferencias para generar contenido visual optimizado para diferentes plataformas sociales.

## ✨ Características Principales

### 🎯 Formularios Ultra Simplificados
- **Datos del Usuario**: Solo 3 campos esenciales (nombre, apellido, correo)
- **Datos de la Marca**: Identidad visual completa sin tipografías
- **Datos del Producto**: Ultra simplificado con 4 imágenes obligatorias
- **Preferencias UGC**: Configuración completa sin opciones avanzadas

### 🎨 Interfaz Optimizada
- **Tema Oscuro**: Diseño moderno y profesional
- **Layout Vertical**: Navegación intuitiva sin carruseles
- **Validación en Tiempo Real**: Feedback inmediato al usuario
- **Responsive Design**: Optimizado para todos los dispositivos

### 🗄️ Base de Datos Optimizada
- **Esquema Simplificado**: 5 tablas principales optimizadas
- **Índices Optimizados**: Para mejor rendimiento
- **Validaciones Estrictas**: Datos consistentes y confiables
- **Triggers Automáticos**: Actualización automática de timestamps

## 🏗️ Estructura del Proyecto

```
UGC_STUDIO/
├── public/                          # Frontend completo
│   ├── css/                        # Estilos CSS
│   │   ├── auth.css               # Estilos de autenticación
│   │   ├── forms.css              # Estilos de formularios
│   │   ├── landing.css            # Estilos de landing page
│   │   └── styles.css             # Estilos generales
│   ├── js/                        # JavaScript
│   │   ├── auth.js                # Lógica de autenticación
│   │   ├── brand-data-form.js     # Formulario de marca
│   │   ├── landing.js             # Landing page
│   │   ├── preferences-data-form.js # Formulario de preferencias
│   │   ├── product-data-form.js   # Formulario de productos
│   │   └── user-data-form.js      # Formulario de usuario
│   ├── datos-usuario.html         # Formulario de datos del usuario
│   ├── datos-marca.html           # Formulario de datos de la marca
│   ├── datos-productos.html       # Formulario de productos
│   ├── datos-preferencias.html    # Formulario de preferencias UGC
│   ├── index.html                 # Landing page
│   ├── login.html                 # Página de inicio de sesión
│   └── [otras páginas del sistema]
├── supabase-new-schema.sql        # Esquema de base de datos optimizado
└── README.md                      # Este archivo
```

## 🚀 Instalación y Configuración

### Prerrequisitos
- Python 3.x (para servidor local)
- Supabase (para base de datos)
- Navegador web moderno

### Configuración Local

1. **Clonar el repositorio**
```bash
git clone https://github.com/Ardeagency/UGC_STUDIO.git
cd UGC_STUDIO
```

2. **Iniciar servidor local**
```bash
cd public
python3 -m http.server 3000
```

3. **Acceder a la aplicación**
```
http://localhost:3000
```

### Configuración de Base de Datos

1. **Crear proyecto en Supabase**
2. **Ejecutar el esquema SQL**
```sql
-- Ejecutar en Supabase SQL Editor
\i supabase-new-schema.sql
```

## 📊 Esquema de Base de Datos

### Tablas Principales

#### 1. **users** - Usuarios del Sistema
```sql
- id (SERIAL PRIMARY KEY)
- user_id (VARCHAR UNIQUE)
- nombre (VARCHAR NOT NULL)
- apellido (VARCHAR)
- correo (VARCHAR UNIQUE NOT NULL)
- contrasena (VARCHAR NOT NULL)
- [campos de sistema...]
```

#### 2. **brands** - Marcas de los Usuarios
```sql
- id (SERIAL PRIMARY KEY)
- user_id (INTEGER REFERENCES users)
- nombre_marca (VARCHAR NOT NULL)
- nicho_principal (VARCHAR NOT NULL)
- paleta_colores (JSONB)
- identidad_proposito (TEXT NOT NULL)
- [campos de identidad visual...]
```

#### 3. **products** - Productos/Servicios
```sql
- id (SERIAL PRIMARY KEY)
- user_id (INTEGER REFERENCES users)
- brand_id (INTEGER REFERENCES brands)
- nombre_producto (VARCHAR NOT NULL)
- tipo_producto (VARCHAR NOT NULL)
- categoria (VARCHAR NOT NULL)
- descripcion (TEXT NOT NULL)
- imagenes_producto (JSONB) -- 4 imágenes obligatorias
- [campos simplificados...]
```

#### 4. **ugc_preferences** - Preferencias de Generación
```sql
- id (SERIAL PRIMARY KEY)
- user_id (INTEGER REFERENCES users)
- brand_id (INTEGER REFERENCES brands)
- product_id (INTEGER REFERENCES products)
- tipo_contenido (VARCHAR NOT NULL)
- plataforma_principal (VARCHAR NOT NULL)
- [configuración completa de UGC...]
```

#### 5. **generation_results** - Resultados de Generación
```sql
- id (SERIAL PRIMARY KEY)
- user_id (INTEGER REFERENCES users)
- ugc_preferences_id (INTEGER REFERENCES ugc_preferences)
- archivos_generados (JSONB)
- [metadatos de generación...]
```

## 🎯 Flujo de Usuario

### 1. **Registro/Login**
- Usuario accede a la landing page
- Puede registrarse (llenar formularios) o iniciar sesión

### 2. **Recolección de Datos**
- **Datos del Usuario**: 3 campos esenciales
- **Datos de la Marca**: Identidad visual completa
- **Datos del Producto**: 4 imágenes obligatorias
- **Preferencias UGC**: Configuración de generación

### 3. **Generación de Contenido**
- Sistema procesa las preferencias
- Genera contenido UGC personalizado
- Usuario revisa y aprueba resultados

## 🔧 Tecnologías Utilizadas

### Frontend
- **HTML5**: Estructura semántica
- **CSS3**: Estilos modernos y responsive
- **JavaScript ES6+**: Lógica de formularios y validación
- **Font Awesome**: Iconografía
- **Google Fonts**: Tipografía (Inter)

### Base de Datos
- **Supabase**: Backend as a Service
- **PostgreSQL**: Base de datos relacional
- **JSONB**: Almacenamiento de datos complejos

## 📈 Beneficios de la Simplificación

### Para el Usuario
- ✅ **Formularios más rápidos**: Completar en 2-3 minutos
- ✅ **Mejor experiencia**: Sin campos innecesarios
- ✅ **Navegación intuitiva**: Layout vertical claro
- ✅ **Validación inmediata**: Feedback en tiempo real

### Para el Desarrollo
- ✅ **Base de datos optimizada**: Menos campos, mejor rendimiento
- ✅ **Código más limpio**: Estructura simplificada
- ✅ **Mantenimiento fácil**: Menos complejidad
- ✅ **Escalabilidad mejorada**: Arquitectura eficiente

## 🚧 Estado Actual

### ✅ Completado
- [x] Formularios ultra simplificados
- [x] Landing page con tema oscuro
- [x] Validación de 4 imágenes obligatorias
- [x] Esquema de base de datos optimizado
- [x] Navegación entre formularios
- [x] Layout vertical en todos los formularios

### 🔄 En Progreso
- [ ] Implementación de backend nuevo
- [ ] Integración con Supabase
- [ ] Sistema de autenticación
- [ ] Generación de contenido UGC

### 📋 Próximos Pasos
- [ ] Configurar Supabase
- [ ] Implementar API endpoints
- [ ] Sistema de autenticación JWT
- [ ] Integración con IA para generación
- [ ] Panel de administración
- [ ] Testing y optimización

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 📞 Contacto

**ARDE AGENCY**
- Email: info@ardeagency.com
- Website: https://ardeagency.com
- GitHub: https://github.com/Ardeagency

---

**Versión**: 2.0.0 - Ultra Simplificada  
**Última actualización**: Diciembre 2024
