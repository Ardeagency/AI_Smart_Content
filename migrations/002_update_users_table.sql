-- Migración para actualizar la tabla de usuarios con nuevos campos
-- Fecha: 2024
-- Descripción: Agregar campos adicionales para el sistema UGC

-- Agregar nuevos campos a la tabla users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS rol VARCHAR(20) DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario_normal')),
ADD COLUMN IF NOT EXISTS idioma_preferido VARCHAR(10) DEFAULT 'es',
ADD COLUMN IF NOT EXISTS sector VARCHAR(100),
ADD COLUMN IF NOT EXISTS preferencias_generales JSONB DEFAULT '{}';

-- Crear índices para los nuevos campos
CREATE INDEX IF NOT EXISTS idx_users_rol ON users(rol);
CREATE INDEX IF NOT EXISTS idx_users_sector ON users(sector);

-- Comentarios para los nuevos campos
COMMENT ON COLUMN users.rol IS 'Rol del usuario en el sistema (admin o usuario_normal)';
COMMENT ON COLUMN users.idioma_preferido IS 'Idioma preferido del usuario';
COMMENT ON COLUMN users.sector IS 'Sector o industria del usuario';
COMMENT ON COLUMN users.preferencias_generales IS 'Preferencias generales del usuario en formato JSON';
