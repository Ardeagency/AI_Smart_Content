# AI Smart Content - Database Schema

Este directorio contiene los archivos SQL para configurar la base de datos de Supabase.

## Archivos

### `schema.sql`
Esquema principal de la base de datos que incluye:
- **Enums**: Tipos de datos personalizados (tipo_producto, tono_voz, planes, etc.)
- **Tablas principales**:
  - `users`: Usuarios de la plataforma
  - `projects`: Proyectos/Marcas
  - `project_markets`: Mercados objetivo (relación muchos a muchos)
  - `project_languages`: Idiomas (relación muchos a muchos)
  - `brand_guidelines`: Lineamientos de marca
  - `brand_words_to_avoid`: Palabras a evitar
  - `brand_files`: Archivos de identidad de marca
  - `products`: Productos principales
  - `product_images`: Imágenes de productos
  - `campaigns`: Campañas de marketing
  - `subscriptions`: Suscripciones y planes
  - `credit_usage`: Registro de uso de créditos
- **Funciones**: Triggers y funciones auxiliares
- **Políticas RLS**: Row Level Security para seguridad de datos

### `storage_buckets.sql`
Configuración de buckets de almacenamiento:
- `brand-logos`: Logos de marca (5MB, imágenes)
- `brand-files`: Archivos de identidad (10MB, PDF, ZIP, DOC, imágenes)
- `product-images`: Imágenes de productos (5MB, imágenes)

## Instalación

1. Accede al SQL Editor en tu proyecto de Supabase
2. Ejecuta primero `schema.sql`
3. Luego ejecuta `storage_buckets.sql`

## Estructura de Datos

### Flujo de Datos

```
users (auth.users)
  └── projects (marcas/proyectos)
       ├── project_markets (mercados objetivo)
       ├── project_languages (idiomas)
       ├── brand_guidelines (lineamientos)
       │    └── brand_words_to_avoid (palabras a evitar)
       ├── brand_files (archivos de identidad)
       ├── products (productos)
       │    └── product_images (imágenes)
       └── campaigns (campañas)
```

### Relaciones

- Un usuario puede tener múltiples proyectos
- Un proyecto tiene un conjunto de mercados objetivo
- Un proyecto tiene un conjunto de idiomas
- Un proyecto tiene lineamientos de marca
- Un proyecto puede tener múltiples archivos de identidad
- Un proyecto puede tener múltiples productos
- Cada producto puede tener hasta 4 imágenes
- Un proyecto puede tener múltiples campañas

## Seguridad

Todas las tablas tienen Row Level Security (RLS) habilitado:
- Los usuarios solo pueden ver/modificar sus propios datos
- Las políticas están configuradas para permitir operaciones CRUD solo al propietario

## Créditos

El sistema de créditos funciona así:
- Cada usuario tiene `credits_available` y `credits_total`
- Las suscripciones otorgan créditos según el plan
- La función `use_credits()` verifica y descuenta créditos
- Todos los usos se registran en `credit_usage`

