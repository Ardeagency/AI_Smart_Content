# 🚀 Guía de Migración a Supabase

Esta guía explica cómo migrar completamente de PostgreSQL local a Supabase.

## 📋 Resumen del Proceso

1. **Limpiar PostgreSQL local** - Eliminar todas las tablas y datos
2. **Configurar Supabase** - Establecer conexión y credenciales
3. **Migrar estructura** - Crear tablas en Supabase
4. **Verificar migración** - Asegurar que todo funciona

## 🧹 Paso 1: Limpiar PostgreSQL Local

### Verificar estado actual
```bash
npm run cleanup:check
```

### Limpiar PostgreSQL completamente
```bash
npm run cleanup:postgres
```

**⚠️ ADVERTENCIA**: Este comando eliminará TODOS los datos de PostgreSQL local.

## ⚙️ Paso 2: Configurar Supabase

### 1. Instalar dependencias
```bash
npm install @supabase/supabase-js
```

### 2. Configurar variables de entorno
Crea un archivo `.env` con:
```env
USE_SUPABASE=true
SUPABASE_URL=https://wxrptuuhmumgikpbfbcn.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Verificar conexión
```bash
npm run supabase:test
```

## 🏗️ Paso 3: Migrar Estructura a Supabase

### Opción A: Migración automática (recomendada)
```bash
# Ejecutar migración completa
npm run migrate:supabase

# Verificar estado
npm run migrate:check
```

### Opción B: Migración manual
1. Ve a tu proyecto en Supabase
2. Abre el SQL Editor
3. Copia y pega el contenido de `supabase-schema.sql`
4. Ejecuta el script

## ✅ Paso 4: Verificar Migración

### Verificar conexión
```bash
npm run supabase:test
```

### Verificar migración
```bash
npm run migrate:check
```

### Iniciar aplicación
```bash
npm start
```

## 📊 Comandos Disponibles

### Migración
```bash
# Migrar a Supabase
npm run migrate:supabase

# Verificar estado de migración
npm run migrate:check

# Migración tradicional (PostgreSQL)
npm run migrate
```

### Limpieza
```bash
# Limpiar PostgreSQL local
npm run cleanup:postgres

# Verificar limpieza
npm run cleanup:check
```

### Pruebas
```bash
# Probar conexión a Supabase
npm run supabase:test

# Probar conexión general
npm run db:test
```

## 🔄 Flujo de Migración Completo

```bash
# 1. Verificar estado actual
npm run cleanup:check

# 2. Limpiar PostgreSQL local
npm run cleanup:postgres

# 3. Verificar limpieza
npm run cleanup:check

# 4. Probar conexión a Supabase
npm run supabase:test

# 5. Migrar estructura a Supabase
npm run migrate:supabase

# 6. Verificar migración
npm run migrate:check

# 7. Iniciar aplicación
npm start
```

## 🛠️ Solución de Problemas

### Error de conexión a Supabase
```bash
# Verificar variables de entorno
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Probar conexión
npm run supabase:test
```

### Error en migración
```bash
# Verificar estado
npm run migrate:check

# Reintentar migración
npm run migrate:supabase
```

### Error de limpieza
```bash
# Verificar estado de limpieza
npm run cleanup:check

# Reintentar limpieza
npm run cleanup:postgres
```

## 📁 Archivos de Migración

### Estructura de archivos
```
migrations/
├── migrate.js                 # Migración principal (PostgreSQL + Supabase)
├── migrate-supabase.js        # Migración específica para Supabase
├── 001_create_users_table.sql
├── 002_update_users_table.sql
├── 003_create_brands_table.sql
├── 004_create_products_table.sql
├── 005_create_avatars_table.sql
├── 006_create_visual_resources_table.sql
├── 007_create_generation_configs_table.sql
├── 008_create_generation_results_table.sql
└── 009_remove_gender_birthdate_from_users.sql

scripts/
├── cleanup-postgresql.js      # Limpieza de PostgreSQL
├── cleanup-postgresql.sql     # SQL de limpieza
├── migrate-to-supabase.js     # Migración a Supabase
└── test-supabase-connection.js # Pruebas de Supabase

supabase-schema.sql            # Esquema completo para Supabase
```

## 🔒 Seguridad

### Row Level Security (RLS)
- Todas las tablas tienen RLS habilitado
- Los usuarios solo pueden ver/editar sus propios datos
- Autenticación integrada con Supabase Auth

### Políticas de acceso
```sql
-- Ejemplo de política
CREATE POLICY "Users can view own brands" ON brands
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));
```

## 📊 Monitoreo

### Dashboard de Supabase
- **URL**: https://supabase.com/dashboard/project/wxrptuuhmumgikpbfbcn
- **Tablas**: Ver todas las tablas creadas
- **Autenticación**: Gestionar usuarios
- **API**: Documentación automática
- **Logs**: Monitorear consultas

### Métricas disponibles
- Número de consultas por minuto
- Tiempo de respuesta promedio
- Uso de almacenamiento
- Errores y alertas

## 🎯 Próximos Pasos

Después de completar la migración:

1. **Configurar autenticación** en tu frontend
2. **Implementar suscripciones** en tiempo real
3. **Configurar monitoreo** y alertas
4. **Optimizar consultas** según el uso
5. **Configurar backups** automáticos

## 📚 Recursos Adicionales

- [Documentación de Supabase](https://supabase.com/docs)
- [Guía de migración](https://supabase.com/docs/guides/migrations)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [API REST](https://supabase.com/docs/guides/api)

---

¡La migración a Supabase está completa! 🎉
