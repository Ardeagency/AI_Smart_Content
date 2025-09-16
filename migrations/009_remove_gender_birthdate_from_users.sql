-- Migración para eliminar campos género y fecha_nacimiento de la tabla users
-- Fecha: 2024
-- Descripción: Eliminar campos innecesarios de la tabla de usuarios

-- Eliminar los campos género y fecha_nacimiento
ALTER TABLE users 
DROP COLUMN IF EXISTS genero,
DROP COLUMN IF EXISTS fecha_nacimiento;

-- Eliminar el índice de género si existe
DROP INDEX IF EXISTS idx_users_genero;

-- Comentarios actualizados
COMMENT ON TABLE users IS 'Tabla principal para almacenar perfiles de usuario del sistema UGC (sin género ni fecha de nacimiento)';
