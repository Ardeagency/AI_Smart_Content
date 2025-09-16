# Sistema UGC (User Generated Content) Completo

Sistema integral para gestión de contenido generado por usuarios con PostgreSQL, Node.js y Express. Incluye gestión de marcas, productos, avatares, recursos visuales, configuraciones de generación y resultados.

## 🚀 Características

- **Gestión completa de usuarios** con campos personalizables y roles
- **Gestión de marcas** con identidad visual y personalidad
- **Biblioteca de productos/servicios** con atributos y categorización
- **Avatares digitales** para representación de marca
- **Recursos visuales** y moodboards para inspiración
- **Configuraciones de generación** automática de UGC
- **Historial de resultados** con métricas y calificaciones
- **Autenticación segura** con hash de contraseñas
- **Base de datos PostgreSQL** con migraciones automáticas
- **API REST** completa con paginación y filtros avanzados
- **Validaciones** y manejo de errores robusto
- **Sistema de acceso** con diferentes niveles de permisos

## 📋 Estructura de Datos

### 1. Usuarios
**Información Personal:**
- `nombre` - Nombre del usuario (requerido)
- `apellido` - Apellido del usuario
- `correo` - Correo electrónico único (requerido)
- `telefono` - Número de teléfono

**Acceso y Seguridad:**
- `user_id` - ID único del usuario (generado automáticamente)
- `contrasena` - Contraseña hasheada (requerida)
- `rol` - Rol del usuario (admin, usuario_normal)
- `acceso` - Nivel de acceso (admin, moderador, usuario, invitado)
- `activo` - Estado del usuario (activo/inactivo)
- `email_verificado` - Estado de verificación del email
- `ultimo_acceso` - Timestamp del último acceso

**Preferencias:**
- `idioma_preferido` - Idioma preferido del usuario
- `sector` - Sector o industria del usuario
- `preferencias_generales` - Preferencias en formato JSON

### 2. Marcas
**Información Básica:**
- `nombre_marca` - Nombre de la marca
- `nicho_principal` - Nicho principal (salud, fitness, moda, etc.)
- `subnicho` - Subnicho o vertical específico
- `categorias_asociadas` - Array de categorías (B2C, B2B, retail, etc.)
- `publico_objetivo` - Descripción del público objetivo
- `mercado_sector` - Mercado o sector (lujo, masivo, nicho especializado)

**Identidad Visual:**
- `logo_url` - URL del logo
- `eslogan` - Eslogan de la marca
- `paleta_colores` - Paleta de colores en formato JSON
- `tipografias` - Tipografías oficiales en formato JSON

**Personalidad y Comunicación:**
- `identidad_proposito` - Identidad y propósito de la marca
- `personalidad_atributos` - Array de atributos de personalidad
- `tono_comunicacion` - Tono de comunicación
- `storytelling_filosofia` - Storytelling y filosofía de la marca

### 3. Productos/Servicios
**Información Básica:**
- `nombre` - Nombre del producto/servicio
- `descripcion_corta` - Descripción corta
- `descripcion_larga` - Descripción larga
- `tipo` - Tipo (producto o servicio)
- `categoria` - Categoría (alimentación, moda, tecnología, etc.)

**Contenido Multimedia:**
- `imagen_principal_url` - URL de imagen principal
- `galeria_imagenes` - Array de URLs de imágenes
- `archivos_asociados` - Array de archivos asociados (PDF, fichas técnicas, etc.)

**Atributos:**
- `atributos_clave` - Atributos clave en formato JSON
- `precio` - Precio del producto/servicio
- `moneda` - Moneda (por defecto MXN)
- `stock` - Cantidad en stock
- `sku` - SKU del producto
- `tags` - Array de tags para búsqueda

### 4. Avatares
**Información Básica:**
- `nombre` - Nombre del avatar
- `descripcion_personalidad` - Descripción de personalidad
- `descripcion_estilo` - Descripción de estilo
- `imagen_referencia_url` - URL de imagen de referencia

**Características Visuales:**
- `estilo_visual` - Estilo visual (realista, cartoon, 3D, etc.)
- `genero` - Género del avatar
- `edad_aparente` - Edad aparente
- `etnia` - Etnia del avatar

**Roles y Especialización:**
- `roles` - Array de roles (modelo_fitness, chef, ejecutivo, etc.)
- `especializaciones` - Array de especializaciones
- `personalidad_atributos` - Array de atributos de personalidad

### 5. Recursos Visuales
**Información Básica:**
- `nombre` - Nombre del recurso
- `descripcion` - Descripción del recurso
- `tipo` - Tipo (moodboard, carpeta_ejemplos, referencia_estilo, multimedia)

**Contenido:**
- `archivos` - Array de archivos del recurso
- `urls_externas` - Array de URLs externas
- `tags` - Array de tags para categorización

**Metadatos:**
- `estilo_grafico` - Estilo gráfico (minimalista, cinematográfico, vibrante, etc.)
- `colores_principales` - Array de colores principales
- `emociones` - Array de emociones que evoca
- `marcas_referencia` - Array de marcas de referencia

### 6. Configuraciones de Generación
**Configuración Básica:**
- `nombre` - Nombre de la configuración
- `descripcion` - Descripción de la configuración
- `tipos_ugc` - Array de tipos de UGC a generar
- `estilos_preferidos` - Array de estilos preferidos (Nike, Apple, etc.)

**Formatos y Plataformas:**
- `formatos_salida` - Formatos de salida en formato JSON
- `idiomas` - Array de idiomas
- `region` - Región/país
- `plataformas_objetivo` - Array de plataformas objetivo

**Configuraciones Específicas:**
- `config_videos` - Configuraciones para videos
- `config_imagenes` - Configuraciones para imágenes
- `config_copies` - Configuraciones para copies
- `config_guiones` - Configuraciones para guiones

### 7. Resultados de Generación
**Información del Resultado:**
- `request_id` - ID único del request de generación
- `tipo_resultado` - Tipo de resultado (video, imagen, copy, guion)
- `subtipo` - Subtipo (reels, story, post, etc.)
- `titulo` - Título del resultado
- `descripcion` - Descripción del resultado

**Contenido Generado:**
- `contenido_texto` - Contenido de texto (para copies y guiones)
- `archivos_generados` - Array de archivos generados
- `archivos_originales` - Archivos originales si aplica
- `archivos_procesados` - Archivos procesados/optimizados

**Metadatos Técnicos:**
- `resolucion` - Resolución (1080x1920, 1080x1080, etc.)
- `duracion_segundos` - Duración en segundos (para videos)
- `formato` - Formato del archivo (mp4, jpg, png, etc.)
- `calidad` - Calidad del resultado

**Métricas:**
- `calificacion` - Calificación del usuario (1-5 estrellas)
- `favorito` - Si es favorito
- `descartado` - Si fue descartado
- `veces_usado` - Contador de uso
- `veces_compartido` - Contador de compartido
- `veces_descargado` - Contador de descargado

## 🛠️ Instalación

### Prerrequisitos
- Node.js (versión 14 o superior)
- PostgreSQL (versión 12 o superior)
- npm o yarn

### Pasos de instalación

1. **Clonar el repositorio**
   ```bash
   git clone <url-del-repositorio>
   cd ugc-user-profile
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp env.example .env
   ```
   
   Editar el archivo `.env` con tu configuración:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=ugc_users
   DB_USER=postgres
   DB_PASSWORD=tu_password_aqui
   PORT=3000
   NODE_ENV=development
   JWT_SECRET=tu_jwt_secret_muy_seguro_aqui
   ```

4. **Crear la base de datos**
   ```sql
   CREATE DATABASE ugc_users;
   ```

5. **Ejecutar migraciones**
   ```bash
   npm run migrate
   ```

6. **Iniciar el servidor**
   ```bash
   # Desarrollo
   npm run dev
   
   # Producción
   npm start
   ```

7. **Acceder a la interfaz web**:
   ```
   http://localhost:3000
   ```

## 📚 API Endpoints

### Usuarios (`/api/users`)

#### Obtener todos los usuarios
```http
GET /api/users?page=1&limit=10&acceso=usuario&activo=true&marca=ejemplo
```

#### Obtener usuario por ID
```http
GET /api/users/:id
```

#### Crear nuevo usuario
```http
POST /api/users
Content-Type: application/json

{
  "nombre": "Juan",
  "apellido": "Pérez",
  "correo": "juan@ejemplo.com",
  "contrasena": "password123",
  "rol": "usuario_normal",
  "sector": "tecnología"
}
```

#### Login de usuario
```http
POST /api/users/login
Content-Type: application/json

{
  "correo": "juan@ejemplo.com",
  "contrasena": "password123"
}
```

### Marcas (`/api/brands`)

#### Obtener todas las marcas
```http
GET /api/brands?page=1&limit=10&nicho_principal=fitness&mercado_sector=lujo
```

#### Crear nueva marca
```http
POST /api/brands
Content-Type: application/json

{
  "user_id": 1,
  "nombre_marca": "FitLife",
  "nicho_principal": "fitness",
  "subnicho": "suplementos_deportivos",
  "categorias_asociadas": ["B2C", "ecommerce"],
  "publico_objetivo": "Jóvenes 18-35 interesados en fitness",
  "paleta_colores": {
    "primary": "#FF6B35",
    "secondary": "#004E89"
  }
}
```

### Productos (`/api/products`)

#### Obtener todos los productos
```http
GET /api/products?page=1&limit=10&tipo=producto&categoria=alimentacion
```

#### Crear nuevo producto
```http
POST /api/products
Content-Type: application/json

{
  "user_id": 1,
  "brand_id": 1,
  "nombre": "Proteína Whey",
  "tipo": "producto",
  "categoria": "suplementos",
  "descripcion_corta": "Proteína de suero de leche premium",
  "precio": 599.99,
  "tags": ["proteina", "whey", "fitness"]
}
```

### Avatares (`/api/avatars`)

#### Obtener todos los avatares
```http
GET /api/avatars?page=1&limit=10&estilo_visual=realista&genero=femenino
```

#### Crear nuevo avatar
```http
POST /api/avatars
Content-Type: application/json

{
  "user_id": 1,
  "brand_id": 1,
  "nombre": "Ana Fitness",
  "estilo_visual": "realista",
  "genero": "femenino",
  "edad_aparente": 25,
  "roles": ["modelo_fitness", "influencer"],
  "especializaciones": ["yoga", "crossfit"]
}
```

### Recursos Visuales (`/api/visual-resources`)

#### Obtener todos los recursos
```http
GET /api/visual-resources?page=1&limit=10&tipo=moodboard&estilo_grafico=minimalista
```

#### Crear nuevo recurso
```http
POST /api/visual-resources
Content-Type: application/json

{
  "user_id": 1,
  "brand_id": 1,
  "nombre": "Moodboard Fitness 2024",
  "tipo": "moodboard",
  "estilo_grafico": "vibrante",
  "colores_principales": ["#FF6B35", "#004E89", "#FFFFFF"],
  "emociones": ["energia", "motivacion", "salud"]
}
```

### Configuraciones de Generación (`/api/generation-configs`)

#### Obtener todas las configuraciones
```http
GET /api/generation-configs?page=1&limit=10&es_plantilla=true&favorito=true
```

#### Crear nueva configuración
```http
POST /api/generation-configs
Content-Type: application/json

{
  "user_id": 1,
  "brand_id": 1,
  "nombre": "Configuración Instagram Reels",
  "tipos_ugc": ["videos", "imagenes"],
  "estilos_preferidos": ["Nike", "Apple"],
  "plataformas_objetivo": ["Instagram", "TikTok"],
  "formatos_salida": {
    "videos": [{"nombre": "Instagram Reels", "resolucion": "1080x1920", "ratio": "9:16"}]
  }
}
```

### Resultados de Generación (`/api/generation-results`)

#### Obtener todos los resultados
```http
GET /api/generation-results?page=1&limit=10&tipo_resultado=video&estado=generado
```

#### Crear nuevo resultado
```http
POST /api/generation-results
Content-Type: application/json

{
  "user_id": 1,
  "brand_id": 1,
  "product_id": 1,
  "avatar_id": 1,
  "request_id": "req_123456789",
  "tipo_resultado": "video",
  "subtipo": "reels",
  "titulo": "Proteína Whey - Beneficios",
  "resolucion": "1080x1920",
  "duracion_segundos": 30
}
```

### Health Check
```http
GET /health
```

## 🔧 Scripts Disponibles

### Servidor
- `npm start` - Iniciar servidor en producción
- `npm run dev` - Iniciar servidor en modo desarrollo con nodemon

### Base de Datos
- `npm run migrate` - Ejecutar migraciones de base de datos
- `npm run seed` - Ejecutar datos de prueba
- `npm run db:test` - Probar conexión básica a la base de datos
- `npm run db:diagnose` - Diagnóstico completo de la base de datos
- `npm run db:check-relations` - Verificar relaciones e integridad referencial
- `npm run db:full-check` - Ejecutar diagnóstico completo y verificación de relaciones

## 🔍 Diagnóstico de Base de Datos

El sistema incluye herramientas avanzadas de diagnóstico para monitorear la salud de la base de datos:

### Prueba de Conexión Básica
```bash
npm run db:test
```
Verifica que la conexión a PostgreSQL esté funcionando correctamente.

### Diagnóstico Completo
```bash
npm run db:diagnose
```
Ejecuta un diagnóstico exhaustivo que incluye:
- ✅ Verificación de conexión
- 📊 Información de la base de datos y versión
- 📋 Listado de tablas existentes
- 🏗️ Estructura de columnas
- 🔍 Índices y su optimización
- 🔒 Restricciones y constraints
- ⚡ Triggers y funciones
- 📈 Estadísticas de conexión
- ⚙️ Configuración del pool de conexiones
- 🚀 Pruebas de rendimiento

### Verificación de Relaciones
```bash
npm run db:check-relations
```
Verifica la integridad referencial y relaciones:
- 🔑 Claves foráneas y su integridad
- 🔗 Verificación de relaciones entre tablas
- ⚠️ Detección de registros huérfanos
- 📊 Índices en claves foráneas
- 🔒 Restricciones de integridad
- 🏆 Puntuación de salud de la base de datos

### Diagnóstico Completo
```bash
npm run db:full-check
```
Ejecuta tanto el diagnóstico completo como la verificación de relaciones.

## 🌐 Interfaz Web

### UGC STUDIO Frontend
La plataforma incluye una interfaz web moderna y responsive con las siguientes características:

#### 🎨 Diseño Visual
- **Esquema de colores**: Negro, grises oscuros, blanco y #FD624F como acento
- **Tipografía**: Helvetica para una apariencia moderna y limpia
- **Gradientes eléctricos**: Combinación dinámica de negro y #FD624F
- **Animaciones suaves**: Transiciones y efectos hover sin sobresaturación

#### 🏗️ Estructura de la Página Principal
1. **Header**: Logo, navegación principal y botón "Crear UGC"
2. **Dashboard**: Bienvenida personalizada, estado del plan y créditos
3. **Accesos Rápidos**: 4 acciones principales con iconos
4. **Biblioteca**: Pestañas para Marcas, Productos, Avatares y Recursos
5. **Explorador UGCs**: Grid de resultados con filtros
6. **Panel Solicitudes**: Historial de requests recientes
7. **Bloque Planes**: Información de suscripción y créditos
8. **Footer**: Enlaces de soporte e información legal

#### 🚀 Características Técnicas
- **Responsive Design**: Adaptable a desktop, tablet y mobile
- **JavaScript Interactivo**: Navegación de pestañas, modales, filtros
- **Animaciones CSS**: Efectos de entrada, hover y transiciones
- **Performance Optimizada**: Carga rápida y 60fps en animaciones

#### 📁 Archivos del Frontend
```
public/
├── index.html          # Página principal
├── css/styles.css      # Estilos con variables CSS
├── js/main.js          # Funcionalidad JavaScript
└── README.md           # Documentación del frontend
```

#### 🎯 Flujo del Usuario
1. **Entrada**: Usuario ve su marca y plan activo
2. **Navegación**: Accede a biblioteca sin volver a subir contenido
3. **Creación**: Selecciona producto y crea nuevo UGC
4. **Resultados**: Recibe resultados en el explorador sin repetir procesos

## 🗄️ Estructura de la Base de Datos

### Tabla `users`
La tabla principal contiene todos los campos del usuario con:
- **Índices** para optimizar consultas frecuentes
- **Triggers** para actualización automática de timestamps
- **Constraints** para validación de datos
- **Comentarios** descriptivos en cada columna

## 🔒 Seguridad

- **Hash de contraseñas** con bcryptjs (12 rounds)
- **Validación de entrada** en todos los endpoints
- **Headers de seguridad** con helmet
- **CORS** configurado
- **Soft delete** para preservar datos
- **Sanitización** de datos sensibles en respuestas

## 📊 Paginación y Filtros

El endpoint de listado de usuarios soporta:
- **Paginación**: `page` y `limit`
- **Filtros**: `acceso`, `activo`, `marca`
- **Ordenamiento**: Por fecha de creación (más recientes primero)

## 🚨 Manejo de Errores

- **Respuestas consistentes** con formato JSON
- **Códigos HTTP** apropiados
- **Mensajes descriptivos** en español
- **Logging** detallado en consola
- **Validación** de datos de entrada

## 🔄 Migraciones

El sistema incluye un sistema de migraciones automático:
- **Archivos SQL** numerados secuencialmente
- **Ejecución automática** de todas las migraciones
- **Rollback** manual disponible
- **Logging** detallado del proceso

## 📝 Ejemplos de Uso

### Crear un usuario administrador
```javascript
const userData = {
  nombre: "Admin",
  apellido: "Sistema",
  correo: "admin@empresa.com",
  contrasena: "admin123",
  acceso: "admin",
  marca: "empresa",
  activo: true
};

const user = await User.create(userData);
```

### Buscar usuarios por marca
```javascript
const users = await User.findAll({
  marca: "empresa",
  activo: true,
  page: 1,
  limit: 20
});
```

### Verificar contraseña
```javascript
const user = await User.findByEmail("usuario@ejemplo.com");
const isValid = await user.verifyPassword("password123");
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 👥 Equipo

Desarrollado por **ARDE AGENCY**

---

Para más información o soporte, contacta al equipo de desarrollo.
