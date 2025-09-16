-- Migración para crear la tabla de recursos visuales
-- Fecha: 2024
-- Descripción: Tabla para almacenar recursos y referencias visuales

CREATE TABLE IF NOT EXISTS visual_resources (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    
    -- Información básica del recurso
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    tipo VARCHAR(50) NOT NULL, -- moodboard, carpeta_ejemplos, referencia_estilo, multimedia
    
    -- Contenido del recurso
    archivos JSONB DEFAULT '[]', -- Array de objetos con {nombre, url, tipo, tamaño}
    urls_externas TEXT[], -- Array de URLs externas
    tags TEXT[], -- Array de tags para categorización
    
    -- Metadatos específicos por tipo
    metadata JSONB DEFAULT '{}', -- Metadatos específicos según el tipo
    
    -- Para moodboards
    estilo_grafico VARCHAR(100), -- minimalista, cinematográfico, vibrante, etc.
    colores_principales TEXT[], -- Array de colores principales
    emociones TEXT[], -- Array de emociones que evoca
    
    -- Para referencias de estilo
    marcas_referencia TEXT[], -- Array de marcas de referencia (Nike, Apple, etc.)
    estilos_aplicados TEXT[], -- Array de estilos aplicados
    
    -- Para multimedia
    duracion_segundos INTEGER, -- Para videos/audios
    resolucion VARCHAR(20), -- Para imágenes/videos
    formato_archivo VARCHAR(20), -- mp4, jpg, png, etc.
    
    -- Organización
    carpeta VARCHAR(200), -- Carpeta de organización
    proyecto VARCHAR(200), -- Proyecto asociado
    version VARCHAR(20), -- Versión del recurso
    
    -- Metadatos
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0, -- Contador de uso
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_visual_resources_user_id ON visual_resources(user_id);
CREATE INDEX IF NOT EXISTS idx_visual_resources_brand_id ON visual_resources(brand_id);
CREATE INDEX IF NOT EXISTS idx_visual_resources_tipo ON visual_resources(tipo);
CREATE INDEX IF NOT EXISTS idx_visual_resources_estilo_grafico ON visual_resources(estilo_grafico);
CREATE INDEX IF NOT EXISTS idx_visual_resources_estado ON visual_resources(estado);
CREATE INDEX IF NOT EXISTS idx_visual_resources_activo ON visual_resources(activo);
CREATE INDEX IF NOT EXISTS idx_visual_resources_favorito ON visual_resources(favorito);
CREATE INDEX IF NOT EXISTS idx_visual_resources_carpeta ON visual_resources(carpeta);
CREATE INDEX IF NOT EXISTS idx_visual_resources_proyecto ON visual_resources(proyecto);
CREATE INDEX IF NOT EXISTS idx_visual_resources_creado_en ON visual_resources(creado_en);

-- Índices GIN para búsqueda en arrays
CREATE INDEX IF NOT EXISTS idx_visual_resources_tags_gin ON visual_resources USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_visual_resources_colores_gin ON visual_resources USING GIN(colores_principales);
CREATE INDEX IF NOT EXISTS idx_visual_resources_emociones_gin ON visual_resources USING GIN(emociones);
CREATE INDEX IF NOT EXISTS idx_visual_resources_marcas_gin ON visual_resources USING GIN(marcas_referencia);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE TRIGGER update_visual_resources_updated_at 
    BEFORE UPDATE ON visual_resources 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE visual_resources IS 'Tabla para almacenar recursos y referencias visuales';
COMMENT ON COLUMN visual_resources.user_id IS 'ID del usuario propietario del recurso';
COMMENT ON COLUMN visual_resources.brand_id IS 'ID de la marca asociada al recurso';
COMMENT ON COLUMN visual_resources.tipo IS 'Tipo de recurso (moodboard, carpeta_ejemplos, referencia_estilo, multimedia)';
COMMENT ON COLUMN visual_resources.archivos IS 'Array de archivos del recurso';
COMMENT ON COLUMN visual_resources.estilo_grafico IS 'Estilo gráfico del recurso';
COMMENT ON COLUMN visual_resources.colores_principales IS 'Array de colores principales del recurso';
COMMENT ON COLUMN visual_resources.emociones IS 'Array de emociones que evoca el recurso';
COMMENT ON COLUMN visual_resources.marcas_referencia IS 'Array de marcas de referencia';
COMMENT ON COLUMN visual_resources.uso_frecuente IS 'Contador de veces que se ha usado este recurso';
