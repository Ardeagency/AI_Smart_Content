# 🚀 Migración a Supabase

Este documento explica cómo migrar el sistema UGC de PostgreSQL local a Supabase.

## 📋 Prerrequisitos

1. **Cuenta de Supabase**: Asegúrate de tener una cuenta en [supabase.com](https://supabase.com)
2. **Proyecto creado**: Crea un nuevo proyecto en Supabase
3. **Credenciales**: Obtén las credenciales de tu proyecto

## 🔧 Configuración

### 1. Instalar dependencias

```bash
npm install @supabase/supabase-js
```

### 2. Configurar variables de entorno

Crea un archivo `.env` con la siguiente configuración:

```env
# Configuración de la base de datos
USE_SUPABASE=true

# Configuración de Supabase
SUPABASE_URL=https://wxrptuuhmumgikpbfbcn.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cnB0dXVobXVtZ2lrcGJmYmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMzIzMTAsImV4cCI6MjA3MzcwODMxMH0.l_D-HRA4h5VUbY_I7f2l9sN0-wH6dQD_mA2UUMqhPpU
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4cnB0dXVobXVtZ2lrcGJmYmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODEzMjMxMCwiZXhwIjoyMDczNzA4MzEwfQ.rDNuuKv94JJDMLdDFG1GLLuR1qNeYuWAFu_W8NgDmqU

# Configuración del servidor
PORT=3000
NODE_ENV=development
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui
```

### 3. Ejecutar migración

```bash
# Migrar estructura completa a Supabase
npm run migrate:supabase

# Verificar estado de Supabase
npm run supabase:check
```

## 📊 Estructura migrada

La migración incluye:

- ✅ **7 tablas principales** con todas las columnas
- ✅ **50+ índices** optimizados
- ✅ **Relaciones de claves foráneas** con CASCADE
- ✅ **Triggers automáticos** para timestamps
- ✅ **Row Level Security (RLS)** habilitado
- ✅ **Políticas de acceso** por usuario
- ✅ **Funciones auxiliares** para estadísticas
- ✅ **Vistas precalculadas** para dashboard

## 🔒 Seguridad

### Row Level Security (RLS)

Todas las tablas tienen RLS habilitado con políticas que permiten:
- Los usuarios solo pueden ver/editar sus propios datos
- Autenticación integrada con Supabase Auth
- Acceso seguro a través de `auth.uid()`

### Políticas de acceso

```sql
-- Ejemplo de política para brands
CREATE POLICY "Users can view own brands" ON brands
    FOR SELECT USING (user_id IN (
        SELECT id FROM users WHERE user_id = auth.uid()::text
    ));
```

## 🚀 Funcionalidades adicionales

### 1. Autenticación integrada

```javascript
const { authenticateUser, registerUser } = require('./config/supabase');

// Registrar usuario
const user = await registerUser({
  correo: 'usuario@ejemplo.com',
  contrasena: 'password123',
  nombre: 'Juan',
  apellido: 'Pérez'
});

// Autenticar usuario
const authData = await authenticateUser('usuario@ejemplo.com', 'password123');
```

### 2. Suscripciones en tiempo real

```javascript
const { subscribeToChanges } = require('./config/supabase');

// Suscribirse a cambios en la tabla products
const subscription = subscribeToChanges('products', (payload) => {
  console.log('Cambio detectado:', payload);
});
```

### 3. Estadísticas de usuario

```javascript
const { getUserStats } = require('./config/supabase');

// Obtener estadísticas del usuario
const stats = await getUserStats('user_001');
console.log(stats);
// {
//   total_brands: 5,
//   total_products: 12,
//   total_avatars: 3,
//   ...
// }
```

### 4. Búsqueda por tags

```javascript
const { searchProductsByTags } = require('./config/supabase');

// Buscar productos por tags
const products = await searchProductsByTags(['tecnología', 'smartphone'], 'user_001');
```

## 📱 API REST automática

Supabase genera automáticamente una API REST para todas las tablas:

```bash
# Obtener todos los usuarios
GET https://wxrptuuhmumgikpbfbcn.supabase.co/rest/v1/users

# Obtener marcas de un usuario
GET https://wxrptuuhmumgikpbfbcn.supabase.co/rest/v1/brands?user_id=eq.1

# Insertar nuevo producto
POST https://wxrptuuhmumgikpbfbcn.supabase.co/rest/v1/products
Content-Type: application/json
Authorization: Bearer <token>

{
  "nombre": "iPhone 15",
  "tipo": "producto",
  "categoria": "Tecnología",
  "user_id": 1
}
```

## 🔄 Migración de datos

Para migrar datos existentes de PostgreSQL a Supabase:

1. **Exportar datos** de PostgreSQL local
2. **Transformar datos** al formato de Supabase
3. **Importar datos** usando la API de Supabase

```javascript
// Ejemplo de migración de datos
const { insertData } = require('./config/supabase');

// Migrar usuarios
const users = await getPostgreSQLUsers();
for (const user of users) {
  await insertData('users', user);
}
```

## 🛠️ Comandos útiles

```bash
# Verificar conexión
npm run db:test

# Migrar a Supabase
npm run migrate:supabase

# Verificar estado de Supabase
npm run supabase:check

# Iniciar servidor
npm start

# Modo desarrollo
npm run dev
```

## 📊 Dashboard de Supabase

Accede al dashboard de Supabase en:
- **URL**: https://supabase.com/dashboard/project/wxrptuuhmumgikpbfbcn
- **Tablas**: Ver todas las tablas creadas
- **Autenticación**: Gestionar usuarios
- **API**: Documentación automática
- **Logs**: Monitorear consultas

## 🔍 Monitoreo

### Logs de consultas
- Todas las consultas se registran en el dashboard
- Métricas de rendimiento disponibles
- Alertas de errores automáticas

### Métricas de uso
- Número de consultas por minuto
- Tiempo de respuesta promedio
- Uso de almacenamiento

## 🚨 Solución de problemas

### Error de conexión
```bash
# Verificar configuración
npm run supabase:check

# Verificar variables de entorno
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY
```

### Error de permisos
- Verificar que las políticas RLS estén configuradas
- Comprobar que el usuario esté autenticado
- Revisar los logs en el dashboard

### Error de migración
```bash
# Verificar estado
npm run supabase:check

# Reintentar migración
npm run migrate:supabase
```

## 📚 Recursos adicionales

- [Documentación de Supabase](https://supabase.com/docs)
- [Guía de migración](https://supabase.com/docs/guides/migrations)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [API REST](https://supabase.com/docs/guides/api)

## ✅ Checklist de migración

- [ ] Instalar dependencias de Supabase
- [ ] Configurar variables de entorno
- [ ] Ejecutar migración de estructura
- [ ] Verificar que todas las tablas se crearon
- [ ] Probar conexión
- [ ] Migrar datos (si es necesario)
- [ ] Probar funcionalidades
- [ ] Configurar monitoreo
- [ ] Actualizar documentación

---

¡La migración a Supabase está completa! 🎉
