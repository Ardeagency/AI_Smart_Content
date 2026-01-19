# Diagnóstico de Errores - Consola

## 🔴 Error 1: "Elementos del DOM no encontrados" en products.js:280

### Ubicación
- **Archivo**: `js/products.js`
- **Línea**: 280
- **Función**: `loadProducts()`

### Causa Raíz
El método `loadProducts()` está intentando acceder a elementos del DOM (`emptyState` y `productsGrid`) antes de que el template `products.html` se haya renderizado completamente en el DOM.

### Flujo del Problema
1. `ProductsView.render()` llama a `super.render()` (BaseView)
2. `BaseView.render()` inyecta el HTML del template en `app-container`
3. `ProductsView.init()` se ejecuta inmediatamente después
4. `ProductsView.init()` crea `new ProductsManager()` y llama a `productsManager.init()`
5. `ProductsManager.init()` llama a `loadProducts()` en la línea 85
6. `loadProducts()` busca `getElementById('emptyState')` y `getElementById('productsGrid')` en la línea 276-277
7. **PROBLEMA**: Aunque el HTML se inyectó, puede haber un delay en el renderizado del navegador, o el template no se cargó correctamente

### Solución Propuesta
1. **Opción A (Recomendada)**: Agregar un pequeño delay o usar `requestAnimationFrame` antes de buscar elementos del DOM
2. **Opción B**: Verificar que los elementos existan antes de continuar, y si no existen, esperar y reintentar
3. **Opción C**: Usar `querySelector` dentro del container en lugar de `getElementById` global

### Código Problemático
```javascript
// js/products.js:274-282
async loadProducts() {
    const emptyState = document.getElementById('emptyState');
    const productsGrid = document.getElementById('productsGrid');

    if (!emptyState || !productsGrid) {
        console.error('❌ Elementos del DOM no encontrados'); // ← ERROR AQUÍ
        return;
    }
    // ...
}
```

---

## 🔴 Error 2: Supabase 400 Bad Request

### Ubicación
- **Archivo**: `supabase.js:19`
- **Tipo**: Múltiples errores `GET` con status `400 (Bad Request)`

### Causa Raíz Posible
Los errores 400 de Supabase generalmente indican:
1. **Query mal formada**: Parámetros incorrectos en la consulta
2. **Autenticación**: Token inválido o expirado
3. **RLS (Row Level Security)**: Políticas que bloquean el acceso
4. **URL mal formada**: Endpoint incorrecto o parámetros en la URL

### Posibles Orígenes
Basado en el código revisado, los errores podrían venir de:
- `session-utils.js`: Consultas a `user_profiles` (línea 91-95)
- `products.js`: Consultas a `products` o `product_images`
- `living.js`: Consultas a múltiples tablas (`flow_runs`, `flow_outputs`, etc.)
- `BrandsView.js`: Consultas a `brands` o `brand_containers`

### Solución Propuesta
1. **Agregar logging detallado**: Capturar la URL completa y los parámetros de cada request
2. **Verificar autenticación**: Asegurar que el token de sesión sea válido
3. **Revisar RLS policies**: Verificar que las políticas permitan el acceso
4. **Usar `.maybeSingle()`**: Para consultas que pueden no retornar resultados (evita 400 cuando no hay datos)

### Código de Referencia
```javascript
// js/session-utils.js:90-95 (ejemplo de buena práctica)
const { data, error } = await supabaseClient
  .from('user_profiles')
  .select('id, email, phone_number, email_verified')
  .eq('id', session.userId)
  .maybeSingle(); // ← Usa maybeSingle para evitar 400 si no existe
```

---

## 📋 Resumen de Acciones Necesarias

### Prioridad Alta
1. ✅ **Arreglar error de DOM en products.js**: Agregar verificación y retry para elementos del DOM
2. 🔍 **Investigar errores 400 de Supabase**: Agregar logging para identificar qué queries fallan

### Prioridad Media
3. 🔄 **Mejorar manejo de errores**: Agregar try-catch más específicos
4. 📝 **Documentar flujo de renderizado**: Clarificar el orden de ejecución entre BaseView y Managers

### Prioridad Baja
5. 🧪 **Agregar tests**: Para prevenir regresiones en el futuro

---

## 🔧 Solución Inmediata Recomendada

### Para Error 1 (DOM):
Modificar `loadProducts()` para esperar a que los elementos estén disponibles:

```javascript
async loadProducts() {
    // Esperar a que el DOM esté listo
    await new Promise(resolve => {
        const checkElements = () => {
            const emptyState = document.getElementById('emptyState');
            const productsGrid = document.getElementById('productsGrid');
            if (emptyState && productsGrid) {
                resolve();
            } else {
                requestAnimationFrame(checkElements);
            }
        };
        checkElements();
    });
    
    const emptyState = document.getElementById('emptyState');
    const productsGrid = document.getElementById('productsGrid');
    // ... resto del código
}
```

### Para Error 2 (Supabase):
Agregar logging temporal para identificar las queries problemáticas:

```javascript
// Interceptar requests de Supabase (temporal para debugging)
const originalFrom = window.supabase?.from;
if (originalFrom) {
    window.supabase.from = function(table) {
        console.log('🔍 Supabase query:', table);
        const query = originalFrom.call(this, table);
        // Logging adicional...
        return query;
    };
}
```
