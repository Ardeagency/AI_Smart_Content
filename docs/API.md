# API Documentation - UGC Studio

## 📡 Endpoints de la API

### Autenticación

#### `POST /auth/login`
Iniciar sesión de usuario
```json
{
  "email": "usuario@ejemplo.com",
  "password": "contraseña123"
}
```

**Respuesta:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "usuario@ejemplo.com",
    "name": "Nombre Usuario"
  },
  "token": "jwt_token"
}
```

#### `POST /auth/logout`
Cerrar sesión de usuario
```json
{
  "token": "jwt_token"
}
```

#### `GET /auth/user`
Obtener información del usuario actual
**Headers:** `Authorization: Bearer jwt_token`

### Marcas

#### `GET /brands`
Listar todas las marcas del usuario
**Headers:** `Authorization: Bearer jwt_token`

**Respuesta:**
```json
{
  "success": true,
  "brands": [
    {
      "id": "uuid",
      "name": "Nombre Marca",
      "description": "Descripción de la marca",
      "tone_of_voice": "Tono de voz",
      "keywords_yes": ["palabra1", "palabra2"],
      "keywords_no": ["palabra3", "palabra4"],
      "dos_donts": "Do's y Don'ts",
      "created_at": "2024-10-28T00:00:00Z"
    }
  ]
}
```

#### `POST /brands`
Crear nueva marca
**Headers:** `Authorization: Bearer jwt_token`
```json
{
  "name": "Nombre Marca",
  "description": "Descripción de la marca",
  "tone_of_voice": "Tono de voz",
  "keywords_yes": ["palabra1", "palabra2"],
  "keywords_no": ["palabra3", "palabra4"],
  "dos_donts": "Do's y Don'ts"
}
```

#### `PUT /brands/:id`
Actualizar marca existente
**Headers:** `Authorization: Bearer jwt_token`
```json
{
  "name": "Nuevo Nombre",
  "description": "Nueva descripción"
}
```

#### `DELETE /brands/:id`
Eliminar marca
**Headers:** `Authorization: Bearer jwt_token`

### Productos

#### `GET /products`
Listar productos del usuario
**Headers:** `Authorization: Bearer jwt_token`

**Respuesta:**
```json
{
  "success": true,
  "products": [
    {
      "id": "uuid",
      "name": "Nombre Producto",
      "product_type": "Tipo de producto",
      "short_desc": "Descripción corta",
      "benefits": ["beneficio1", "beneficio2"],
      "ingredients": ["ingrediente1", "ingrediente2"],
      "price": 29.99,
      "project_id": "uuid",
      "created_at": "2024-10-28T00:00:00Z"
    }
  ]
}
```

#### `POST /products`
Crear nuevo producto
**Headers:** `Authorization: Bearer jwt_token`
```json
{
  "name": "Nombre Producto",
  "product_type": "Tipo de producto",
  "short_desc": "Descripción corta",
  "benefits": ["beneficio1", "beneficio2"],
  "ingredients": ["ingrediente1", "ingrediente2"],
  "price": 29.99,
  "project_id": "uuid"
}
```

### Ofertas

#### `GET /offers`
Listar ofertas del usuario
**Headers:** `Authorization: Bearer jwt_token`

#### `POST /offers`
Crear nueva oferta
**Headers:** `Authorization: Bearer jwt_token`
```json
{
  "name": "Nombre Oferta",
  "description": "Descripción de la oferta",
  "offer_type": "descuento",
  "discount": "20%",
  "valid_until": "2024-12-31",
  "project_id": "uuid"
}
```

### Audiencias

#### `GET /audiences`
Listar audiencias del usuario
**Headers:** `Authorization: Bearer jwt_token`

#### `POST /audiences`
Crear nueva audiencia
**Headers:** `Authorization: Bearer jwt_token`
```json
{
  "name": "Nombre Audiencia",
  "description": "Descripción de la audiencia",
  "age_range": "25-35",
  "interests": ["interés1", "interés2"],
  "behavior": "Comportamiento de la audiencia",
  "project_id": "uuid"
}
```

### Contenido UGC

#### `GET /ugc`
Listar contenido UGC generado
**Headers:** `Authorization: Bearer jwt_token`

#### `POST /ugc/generate`
Generar nuevo contenido UGC
**Headers:** `Authorization: Bearer jwt_token`
```json
{
  "brand_id": "uuid",
  "product_id": "uuid",
  "offer_id": "uuid",
  "audience_id": "uuid",
  "parameters": {
    "style": "moderno",
    "colors": ["#FF0000", "#00FF00"],
    "text": "Texto personalizado"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "ugc": {
    "id": "uuid",
    "image_url": "https://storage.supabase.co/ugc/image.jpg",
    "generated_at": "2024-10-28T00:00:00Z",
    "parameters": {...}
  }
}
```

### Archivos e Imágenes

#### `POST /upload/image`
Subir imagen
**Headers:** `Authorization: Bearer jwt_token`
**Content-Type:** `multipart/form-data`

#### `GET /images/:id`
Obtener imagen específica
**Headers:** `Authorization: Bearer jwt_token`

## 🔒 Autenticación

La API utiliza JWT (JSON Web Tokens) para autenticación. Incluye el token en el header `Authorization`:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📊 Códigos de Estado HTTP

- `200` - OK: Solicitud exitosa
- `201` - Created: Recurso creado exitosamente
- `400` - Bad Request: Datos de entrada inválidos
- `401` - Unauthorized: Token de autenticación inválido o faltante
- `403` - Forbidden: Sin permisos para acceder al recurso
- `404` - Not Found: Recurso no encontrado
- `500` - Internal Server Error: Error interno del servidor

## 🚨 Manejo de Errores

Todas las respuestas de error siguen este formato:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción del error",
    "details": "Detalles adicionales del error"
  }
}
```

## 🔄 Rate Limiting

- **Límite general**: 1000 requests por hora por usuario
- **Generación UGC**: 10 requests por minuto por usuario
- **Subida de archivos**: 50 requests por hora por usuario

## 📝 Ejemplos de Uso

### JavaScript (Fetch API)
```javascript
// Login
const loginResponse = await fetch('/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'usuario@ejemplo.com',
    password: 'contraseña123'
  })
});

const loginData = await loginResponse.json();
const token = loginData.token;

// Obtener marcas
const brandsResponse = await fetch('/brands', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const brandsData = await brandsResponse.json();
```

### cURL
```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@ejemplo.com","password":"contraseña123"}'

# Obtener marcas
curl -X GET http://localhost:3000/brands \
  -H "Authorization: Bearer jwt_token"
```

## 🔧 Configuración de Desarrollo

Para desarrollo local, la API está disponible en:
- **URL Base**: `http://localhost:3000`
- **WebSocket**: `ws://localhost:3000` (para actualizaciones en tiempo real)

## 📈 Monitoreo y Logs

- **Logs de aplicación**: Disponibles en `/logs/app.log`
- **Métricas de API**: Disponibles en `/metrics`
- **Health Check**: `GET /health`
