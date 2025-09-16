-- Migración para crear la tabla de historial de resultados
-- Fecha: 2024
-- Descripción: Tabla para almacenar historial de resultados generados

CREATE TABLE IF NOT EXISTS generation_results (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    avatar_id INTEGER REFERENCES avatars(id) ON DELETE SET NULL,
    generation_config_id INTEGER REFERENCES generation_configs(id) ON DELETE SET NULL,
    
    -- Identificación única del request
    request_id VARCHAR(100) UNIQUE NOT NULL, -- ID único del request de generación
    
    -- Información del resultado
    tipo_resultado VARCHAR(50) NOT NULL, -- video, imagen, copy, guion, etc.
    subtipo VARCHAR(50), -- reels, story, post, etc.
    
    -- Contenido generado
    titulo VARCHAR(200),
    descripcion TEXT,
    contenido_texto TEXT, -- Para copies y guiones
    contenido_metadata JSONB DEFAULT '{}', -- Metadatos del contenido
    
    -- Archivos generados
    archivos_generados JSONB DEFAULT '[]', -- Array de objetos con {nombre, url, tipo, tamaño}
    archivos_originales JSONB DEFAULT '[]', -- Archivos originales si aplica
    archivos_procesados JSONB DEFAULT '[]', -- Archivos procesados/optimizados
    
    -- Metadatos técnicos
    resolucion VARCHAR(20), -- 1080x1920, 1080x1080, etc.
    duracion_segundos INTEGER, -- Para videos
    tamaño_archivo BIGINT, -- Tamaño en bytes
    formato VARCHAR(20), -- mp4, jpg, png, etc.
    calidad VARCHAR(20), -- alta, media, baja
    
    -- Estilo aplicado
    estilo_aplicado VARCHAR(100),
    configuracion_usada JSONB DEFAULT '{}', -- Configuración específica usada
    prompts_usados TEXT[], -- Array de prompts utilizados
    
    -- Plataformas y distribución
    plataformas_destino TEXT[], -- Array de plataformas donde se usará
    idioma VARCHAR(10) DEFAULT 'es',
    region VARCHAR(50),
    
    -- Estado y calificación
    estado VARCHAR(20) DEFAULT 'generado' CHECK (estado IN ('generando', 'generado', 'error', 'procesando')),
    calificacion INTEGER CHECK (calificacion >= 1 AND calificacion <= 5), -- 1-5 estrellas
    favorito BOOLEAN DEFAULT false,
    descartado BOOLEAN DEFAULT false,
    feedback TEXT, -- Feedback del usuario
    
    -- Métricas de uso
    veces_usado INTEGER DEFAULT 0,
    veces_compartido INTEGER DEFAULT 0,
    veces_descargado INTEGER DEFAULT 0,
    
    -- Metadatos de generación
    modelo_ia_usado VARCHAR(100),
    tiempo_generacion_segundos INTEGER,
    costo_generacion DECIMAL(10,4), -- Costo en la moneda correspondiente
    tokens_usados INTEGER, -- Tokens de IA utilizados
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_uso TIMESTAMP, -- Fecha del último uso
    activo BOOLEAN DEFAULT true
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_generation_results_user_id ON generation_results(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_brand_id ON generation_results(brand_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_product_id ON generation_results(product_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_avatar_id ON generation_results(avatar_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_config_id ON generation_results(generation_config_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_request_id ON generation_results(request_id);
CREATE INDEX IF NOT EXISTS idx_generation_results_tipo ON generation_results(tipo_resultado);
CREATE INDEX IF NOT EXISTS idx_generation_results_estado ON generation_results(estado);
CREATE INDEX IF NOT EXISTS idx_generation_results_activo ON generation_results(activo);
CREATE INDEX IF NOT EXISTS idx_generation_results_favorito ON generation_results(favorito);
CREATE INDEX IF NOT EXISTS idx_generation_results_descartado ON generation_results(descartado);
CREATE INDEX IF NOT EXISTS idx_generation_results_calificacion ON generation_results(calificacion);
CREATE INDEX IF NOT EXISTS idx_generation_results_creado_en ON generation_results(creado_en);

-- Índices GIN para búsqueda en arrays
CREATE INDEX IF NOT EXISTS idx_generation_results_plataformas_gin ON generation_results USING GIN(plataformas_destino);
CREATE INDEX IF NOT EXISTS idx_generation_results_prompts_gin ON generation_results USING GIN(prompts_usados);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE TRIGGER update_generation_results_updated_at 
    BEFORE UPDATE ON generation_results 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE generation_results IS 'Tabla para almacenar historial de resultados generados';
COMMENT ON COLUMN generation_results.user_id IS 'ID del usuario propietario del resultado';
COMMENT ON COLUMN generation_results.brand_id IS 'ID de la marca asociada al resultado';
COMMENT ON COLUMN generation_results.product_id IS 'ID del producto/servicio asociado';
COMMENT ON COLUMN generation_results.avatar_id IS 'ID del avatar utilizado';
COMMENT ON COLUMN generation_results.generation_config_id IS 'ID de la configuración utilizada';
COMMENT ON COLUMN generation_results.request_id IS 'ID único del request de generación';
COMMENT ON COLUMN generation_results.tipo_resultado IS 'Tipo de resultado generado';
COMMENT ON COLUMN generation_results.archivos_generados IS 'Array de archivos generados';
COMMENT ON COLUMN generation_results.estilo_aplicado IS 'Estilo aplicado en la generación';
COMMENT ON COLUMN generation_results.configuracion_usada IS 'Configuración específica utilizada';
COMMENT ON COLUMN generation_results.prompts_usados IS 'Array de prompts utilizados';
COMMENT ON COLUMN generation_results.calificacion IS 'Calificación del usuario (1-5 estrellas)';
COMMENT ON COLUMN generation_results.veces_usado IS 'Contador de veces que se ha usado';
COMMENT ON COLUMN generation_results.costo_generacion IS 'Costo de la generación';
COMMENT ON COLUMN generation_results.tokens_usados IS 'Número de tokens de IA utilizados';
