-- Migración para crear la tabla de configuración de generación
-- Fecha: 2024
-- Descripción: Tabla para almacenar configuraciones de generación automática de UGC

CREATE TABLE IF NOT EXISTS generation_configs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    
    -- Información básica de la configuración
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    
    -- Tipos de UGC a generar
    tipos_ugc TEXT[] NOT NULL, -- Array: videos, imagenes, copies, guiones, etc.
    
    -- Estilos preferidos
    estilos_preferidos TEXT[], -- Array: Nike, Apple, Vicio, etc.
    estilos_personalizados JSONB DEFAULT '{}', -- Estilos personalizados definidos por el usuario
    
    -- Formatos de salida
    formatos_salida JSONB NOT NULL DEFAULT '{}', -- {videos: [{nombre: "Instagram Reels", resolucion: "1080x1920", ratio: "9:16"}], imagenes: [...]}
    
    -- Idiomas y localización
    idiomas TEXT[] DEFAULT '{"es"}', -- Array de idiomas
    region VARCHAR(50) DEFAULT 'MX', -- Región/país
    
    -- Plataformas objetivo
    plataformas_objetivo TEXT[] NOT NULL, -- Array: Instagram, TikTok, Ads, Web, etc.
    
    -- Configuraciones específicas por tipo
    config_videos JSONB DEFAULT '{}', -- {duracion_max: 60, duracion_min: 15, incluir_audio: true}
    config_imagenes JSONB DEFAULT '{}', -- {calidad: "alta", formato: "jpg", incluir_texto: true}
    config_copies JSONB DEFAULT '{}', -- {longitud_max: 280, tono: "profesional", incluir_hashtags: true}
    config_guiones JSONB DEFAULT '{}', -- {duracion_objetivo: 30, incluir_transiciones: true}
    
    -- Configuraciones de IA
    modelo_ia VARCHAR(100) DEFAULT 'gpt-4', -- Modelo de IA a usar
    prompts_base TEXT[], -- Array de prompts base
    configuracion_ia JSONB DEFAULT '{}', -- Configuraciones específicas del modelo de IA
    
    -- Filtros y restricciones
    filtros_contenido JSONB DEFAULT '{}', -- Filtros de contenido apropiado
    restricciones_etica JSONB DEFAULT '{}', -- Restricciones éticas
    palabras_clave_evitar TEXT[], -- Array de palabras a evitar
    
    -- Configuraciones de marca
    aplicar_identidad_marca BOOLEAN DEFAULT true,
    incluir_logo BOOLEAN DEFAULT true,
    usar_paleta_colores BOOLEAN DEFAULT true,
    usar_tipografias BOOLEAN DEFAULT true,
    
    -- Metadatos
    estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'borrador')),
    es_plantilla BOOLEAN DEFAULT false, -- Si es una plantilla reutilizable
    favorito BOOLEAN DEFAULT false,
    uso_frecuente INTEGER DEFAULT 0, -- Contador de uso
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_generation_configs_user_id ON generation_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_configs_brand_id ON generation_configs(brand_id);
CREATE INDEX IF NOT EXISTS idx_generation_configs_estado ON generation_configs(estado);
CREATE INDEX IF NOT EXISTS idx_generation_configs_activo ON generation_configs(activo);
CREATE INDEX IF NOT EXISTS idx_generation_configs_es_plantilla ON generation_configs(es_plantilla);
CREATE INDEX IF NOT EXISTS idx_generation_configs_favorito ON generation_configs(favorito);
CREATE INDEX IF NOT EXISTS idx_generation_configs_creado_en ON generation_configs(creado_en);

-- Índices GIN para búsqueda en arrays
CREATE INDEX IF NOT EXISTS idx_generation_configs_tipos_ugc_gin ON generation_configs USING GIN(tipos_ugc);
CREATE INDEX IF NOT EXISTS idx_generation_configs_estilos_gin ON generation_configs USING GIN(estilos_preferidos);
CREATE INDEX IF NOT EXISTS idx_generation_configs_idiomas_gin ON generation_configs USING GIN(idiomas);
CREATE INDEX IF NOT EXISTS idx_generation_configs_plataformas_gin ON generation_configs USING GIN(plataformas_objetivo);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE TRIGGER update_generation_configs_updated_at 
    BEFORE UPDATE ON generation_configs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE generation_configs IS 'Tabla para configuraciones de generación automática de UGC';
COMMENT ON COLUMN generation_configs.user_id IS 'ID del usuario propietario de la configuración';
COMMENT ON COLUMN generation_configs.brand_id IS 'ID de la marca asociada a la configuración';
COMMENT ON COLUMN generation_configs.tipos_ugc IS 'Array de tipos de UGC a generar';
COMMENT ON COLUMN generation_configs.estilos_preferidos IS 'Array de estilos preferidos (Nike, Apple, etc.)';
COMMENT ON COLUMN generation_configs.formatos_salida IS 'Formatos de salida en formato JSON';
COMMENT ON COLUMN generation_configs.plataformas_objetivo IS 'Array de plataformas objetivo';
COMMENT ON COLUMN generation_configs.config_videos IS 'Configuraciones específicas para videos';
COMMENT ON COLUMN generation_configs.config_imagenes IS 'Configuraciones específicas para imágenes';
COMMENT ON COLUMN generation_configs.config_copies IS 'Configuraciones específicas para copies';
COMMENT ON COLUMN generation_configs.config_guiones IS 'Configuraciones específicas para guiones';
COMMENT ON COLUMN generation_configs.es_plantilla IS 'Indica si es una plantilla reutilizable';
