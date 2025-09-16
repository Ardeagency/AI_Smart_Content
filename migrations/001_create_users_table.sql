-- Migración para crear la tabla de usuarios
-- Fecha: 2024
-- Descripción: Tabla principal para almacenar perfiles de usuario

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) UNIQUE NOT NULL, -- ID único del usuario (puede ser UUID o string personalizado)
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100),
    correo VARCHAR(255) UNIQUE NOT NULL,
    contrasena VARCHAR(255) NOT NULL, -- Hash de la contraseña
    telefono VARCHAR(20),
    fecha_nacimiento DATE,
    genero VARCHAR(10) CHECK (genero IN ('masculino', 'femenino', 'otro', 'prefiero_no_decir')),
    
    -- Campos de acceso y permisos
    acceso VARCHAR(20) DEFAULT 'usuario' CHECK (acceso IN ('admin', 'moderador', 'usuario', 'invitado')),
    activo BOOLEAN DEFAULT true,
    email_verificado BOOLEAN DEFAULT false,
    ultimo_acceso TIMESTAMP,
    
    -- Campos de marca y personalización
    marca VARCHAR(100), -- Marca asociada al usuario
    avatar_url VARCHAR(500),
    biografia TEXT,
    sitio_web VARCHAR(255),
    
    -- Campos de ubicación
    pais VARCHAR(100),
    ciudad VARCHAR(100),
    zona_horaria VARCHAR(50) DEFAULT 'UTC',
    
    -- Campos de configuración
    idioma VARCHAR(10) DEFAULT 'es',
    tema VARCHAR(10) DEFAULT 'claro' CHECK (tema IN ('claro', 'oscuro', 'auto')),
    notificaciones_email BOOLEAN DEFAULT true,
    notificaciones_push BOOLEAN DEFAULT true,
    
    -- Campos de auditoría
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    creado_por VARCHAR(50),
    actualizado_por VARCHAR(50)
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_users_correo ON users(correo);
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_acceso ON users(acceso);
CREATE INDEX IF NOT EXISTS idx_users_activo ON users(activo);
CREATE INDEX IF NOT EXISTS idx_users_marca ON users(marca);
CREATE INDEX IF NOT EXISTS idx_users_creado_en ON users(creado_en);

-- Trigger para actualizar automáticamente el campo actualizado_en
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Comentarios en la tabla y columnas
COMMENT ON TABLE users IS 'Tabla principal para almacenar perfiles de usuario del sistema UGC';
COMMENT ON COLUMN users.user_id IS 'Identificador único del usuario (UUID o string personalizado)';
COMMENT ON COLUMN users.nombre IS 'Nombre del usuario';
COMMENT ON COLUMN users.correo IS 'Correo electrónico único del usuario';
COMMENT ON COLUMN users.contrasena IS 'Hash de la contraseña del usuario';
COMMENT ON COLUMN users.acceso IS 'Nivel de acceso del usuario en el sistema';
COMMENT ON COLUMN users.marca IS 'Marca asociada al usuario';
COMMENT ON COLUMN users.ultimo_acceso IS 'Timestamp del último acceso del usuario';
