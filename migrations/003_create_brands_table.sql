-- Migración para crear la tabla de marcas
-- Fecha: 2024
-- Descripción: Tabla para almacenar información completa de marcas

CREATE TABLE IF NOT EXISTS brands (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Información básica de la marca
    nombre_marca VARCHAR(200) NOT NULL,
    nicho_principal VARCHAR(100) NOT NULL,
    subnicho VARCHAR(100),
    categorias_asociadas TEXT[], -- Array de categorías
    publico_objetivo TEXT,
    mercado_sector VARCHAR(100),
    
    -- Identidad visual
    logo_url VARCHAR(500),
    eslogan TEXT,
    paleta_colores JSONB, -- {primary: "#FF0000", secondary: "#00FF00", etc.}
    tipografias JSONB, -- {primary: "Arial", secondary: "Helvetica", archivos: []}
    
    -- Identidad y personalidad
    identidad_proposito TEXT,
    personalidad_atributos TEXT[], -- Array de adjetivos
    tono_comunicacion VARCHAR(50),
    storytelling_filosofia TEXT,
    
    -- Archivos adicionales
    archivos_adicionales JSONB DEFAULT '[]', -- Array de objetos con {nombre, url, tipo}
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN DEFAULT true
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_brands_nicho ON brands(nicho_principal);
CREATE INDEX IF NOT EXISTS idx_brands_mercado ON brands(mercado_sector);
CREATE INDEX IF NOT EXISTS idx_brands_activo ON brands(activo);
CREATE INDEX IF NOT EXISTS idx_brands_creado_en ON brands(creado_en);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE TRIGGER update_brands_updated_at 
    BEFORE UPDATE ON brands 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE brands IS 'Tabla para almacenar información completa de marcas del sistema UGC';
COMMENT ON COLUMN brands.user_id IS 'ID del usuario propietario de la marca';
COMMENT ON COLUMN brands.nombre_marca IS 'Nombre de la marca';
COMMENT ON COLUMN brands.nicho_principal IS 'Nicho principal de la marca (salud, fitness, moda, etc.)';
COMMENT ON COLUMN brands.subnicho IS 'Subnicho o vertical específico';
COMMENT ON COLUMN brands.categorias_asociadas IS 'Array de categorías asociadas (B2C, B2B, retail, etc.)';
COMMENT ON COLUMN brands.publico_objetivo IS 'Descripción del público objetivo';
COMMENT ON COLUMN brands.mercado_sector IS 'Mercado o sector (lujo, masivo, nicho especializado)';
COMMENT ON COLUMN brands.paleta_colores IS 'Paleta de colores en formato JSON';
COMMENT ON COLUMN brands.tipografias IS 'Tipografías oficiales en formato JSON';
COMMENT ON COLUMN brands.personalidad_atributos IS 'Array de atributos de personalidad de la marca';
COMMENT ON COLUMN brands.archivos_adicionales IS 'Array de archivos adicionales (manuales, guidelines, etc.)';
