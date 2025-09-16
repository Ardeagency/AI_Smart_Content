-- Migración para crear la tabla de avatares
-- Fecha: 2024
-- Descripción: Tabla para almacenar avatares digitales/modelos IA

CREATE TABLE IF NOT EXISTS avatars (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    
    -- Información básica del avatar
    nombre VARCHAR(200) NOT NULL,
    descripcion_personalidad TEXT,
    descripcion_estilo TEXT,
    
    -- Imagen y referencia visual
    imagen_referencia_url VARCHAR(500),
    imagen_referencia_alt TEXT,
    
    -- Estilo visual
    estilo_visual VARCHAR(50) NOT NULL, -- realista, cartoon, 3D, anime, etc.
    genero VARCHAR(20) CHECK (genero IN ('masculino', 'femenino', 'no_binario', 'otro')),
    edad_aparente INTEGER CHECK (edad_aparente > 0 AND edad_aparente < 100),
    etnia VARCHAR(50),
    
    -- Roles y especialización
    roles TEXT[], -- Array de roles: modelo_fitness, chef, ejecutivo, etc.
    especializaciones TEXT[], -- Array de especializaciones
    personalidad_atributos TEXT[], -- Array de atributos de personalidad
    
    -- Configuración de generación
    configuracion_generacion JSONB DEFAULT '{}', -- Configuraciones específicas para IA
    prompts_sugeridos TEXT[], -- Array de prompts sugeridos para este avatar
    
    -- Metadatos
    tags TEXT[], -- Array de tags para búsqueda
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0, -- Contador de uso
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_avatars_user_id ON avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_avatars_brand_id ON avatars(brand_id);
CREATE INDEX IF NOT EXISTS idx_avatars_estilo_visual ON avatars(estilo_visual);
CREATE INDEX IF NOT EXISTS idx_avatars_genero ON avatars(genero);
CREATE INDEX IF NOT EXISTS idx_avatars_estado ON avatars(estado);
CREATE INDEX IF NOT EXISTS idx_avatars_activo ON avatars(activo);
CREATE INDEX IF NOT EXISTS idx_avatars_favorito ON avatars(favorito);
CREATE INDEX IF NOT EXISTS idx_avatars_uso_frecuente ON avatars(uso_frecuente);
CREATE INDEX IF NOT EXISTS idx_avatars_creado_en ON avatars(creado_en);

-- Índices GIN para búsqueda en arrays
CREATE INDEX IF NOT EXISTS idx_avatars_roles_gin ON avatars USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_avatars_tags_gin ON avatars USING GIN(tags);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE TRIGGER update_avatars_updated_at 
    BEFORE UPDATE ON avatars 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE avatars IS 'Tabla para almacenar avatares digitales y modelos IA';
COMMENT ON COLUMN avatars.user_id IS 'ID del usuario propietario del avatar';
COMMENT ON COLUMN avatars.brand_id IS 'ID de la marca asociada al avatar';
COMMENT ON COLUMN avatars.nombre IS 'Nombre del avatar';
COMMENT ON COLUMN avatars.descripcion_personalidad IS 'Descripción de la personalidad del avatar';
COMMENT ON COLUMN avatars.estilo_visual IS 'Estilo visual del avatar (realista, cartoon, 3D, etc.)';
COMMENT ON COLUMN avatars.roles IS 'Array de roles que puede representar el avatar';
COMMENT ON COLUMN avatars.especializaciones IS 'Array de especializaciones del avatar';
COMMENT ON COLUMN avatars.configuracion_generacion IS 'Configuraciones específicas para generación con IA';
COMMENT ON COLUMN avatars.prompts_sugeridos IS 'Array de prompts sugeridos para este avatar';
COMMENT ON COLUMN avatars.uso_frecuente IS 'Contador de veces que se ha usado este avatar';
