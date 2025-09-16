-- Migración para crear la tabla de productos/servicios
-- Fecha: 2024
-- Descripción: Tabla para almacenar biblioteca de productos y servicios

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    
    -- Información básica del producto
    nombre VARCHAR(200) NOT NULL,
    descripcion_corta TEXT,
    descripcion_larga TEXT,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('producto', 'servicio')),
    categoria VARCHAR(100) NOT NULL, -- alimentación, moda, tecnología, etc.
    
    -- Imágenes y archivos
    imagen_principal_url VARCHAR(500),
    galeria_imagenes JSONB DEFAULT '[]', -- Array de URLs de imágenes
    archivos_asociados JSONB DEFAULT '[]', -- Array de objetos con {nombre, url, tipo}
    
    -- Atributos del producto
    atributos_clave JSONB DEFAULT '{}', -- {ingredientes: [], materiales: [], beneficios: [], precio: 0}
    precio DECIMAL(10,2),
    moneda VARCHAR(3) DEFAULT 'MXN',
    stock INTEGER,
    sku VARCHAR(100),
    
    -- Metadatos
    tags TEXT[], -- Array de tags para búsqueda
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    destacado BOOLEAN DEFAULT false,
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_tipo ON products(tipo);
CREATE INDEX IF NOT EXISTS idx_products_categoria ON products(categoria);
CREATE INDEX IF NOT EXISTS idx_products_estado ON products(estado);
CREATE INDEX IF NOT EXISTS idx_products_activo ON products(activo);
CREATE INDEX IF NOT EXISTS idx_products_destacado ON products(destacado);
CREATE INDEX IF NOT EXISTS idx_products_creado_en ON products(creado_en);

-- Índice GIN para búsqueda en arrays
CREATE INDEX IF NOT EXISTS idx_products_tags_gin ON products USING GIN(tags);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE products IS 'Tabla para almacenar biblioteca de productos y servicios';
COMMENT ON COLUMN products.user_id IS 'ID del usuario propietario del producto';
COMMENT ON COLUMN products.brand_id IS 'ID de la marca asociada al producto';
COMMENT ON COLUMN products.nombre IS 'Nombre del producto o servicio';
COMMENT ON COLUMN products.tipo IS 'Tipo: producto o servicio';
COMMENT ON COLUMN products.categoria IS 'Categoría del producto (alimentación, moda, tecnología, etc.)';
COMMENT ON COLUMN products.galeria_imagenes IS 'Array de URLs de imágenes del producto';
COMMENT ON COLUMN products.archivos_asociados IS 'Array de archivos asociados (PDF, fichas técnicas, etc.)';
COMMENT ON COLUMN products.atributos_clave IS 'Atributos clave del producto en formato JSON';
COMMENT ON COLUMN products.tags IS 'Array de tags para búsqueda y filtrado';
