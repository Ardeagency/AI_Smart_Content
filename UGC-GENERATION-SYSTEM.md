# 🎬 Sistema de Generación UGC - Documentación Técnica

## 📋 Estado Actual del Sistema

### ✅ **Componentes Funcionales:**
- **Interfaz completa** en `studio.html` con todos los campos de configuración
- **Sistema de validación** de datos requeridos
- **Recopilación de datos** estructurada
- **Sistema de notificaciones** visual
- **Estados de carga** en el botón de generación
- **Gestión de datos** en `studio.js` (StudioManager)

### 🔧 **Estructura de Datos Recopilados:**
```javascript
{
  // Información básica
  productUrl: string,
  creativeBrief: string,
  
  // Configuración técnica
  outputFormat: string,
  aspectRatio: string,
  
  // Características del personaje
  characterOptions: {
    gender: string[],
    age: string[],
    ethnicity: string[],
    eyes: string[],
    hair: string[],
    expression: string[],
    style: string[]
  },
  
  // Prompts
  positivePrompt: string,
  negativePrompt: string,
  
  // Imágenes seleccionadas
  selectedImages: array
}
```

## 🚀 **Espacio Preparado para Nueva Implementación**

### **Ubicación del Código:**
- **Función principal:** `generateUGC()` en `studio.html` (líneas 1129-1166)
- **Recopilación de datos:** `collectUGCData()` en `studio.html` (líneas 1168-1199)
- **Validación:** `validateUGCData()` en `studio.html` (líneas 1201-1210)

### **Puntos de Integración:**
1. **Reemplazar el setTimeout** en `generateUGC()` (línea 1150)
2. **Implementar lógica de API** para envío de datos
3. **Manejar respuestas** y actualizar UI
4. **Gestión de errores** y estados de carga

## 🛠️ **Implementación Sugerida**

### **1. Estructura de la Nueva Función:**
```javascript
async function generateUGC() {
    try {
        // 1. Validar datos
        if (!validateUGCData()) {
            showNotification('❌ Faltan datos requeridos', 'error');
            return;
        }
        
        // 2. Preparar UI
        setLoadingState(true);
        
        // 3. Recopilar datos
        const ugcData = collectUGCData();
        
        // 4. Enviar a API
        const response = await sendToUGCAPI(ugcData);
        
        // 5. Procesar respuesta
        handleUGCResponse(response);
        
    } catch (error) {
        handleUGCError(error);
    } finally {
        setLoadingState(false);
    }
}
```

### **2. Funciones de Apoyo Necesarias:**
- `sendToUGCAPI(data)` - Envío a API externa
- `handleUGCResponse(response)` - Procesamiento de respuesta
- `handleUGCError(error)` - Manejo de errores
- `setLoadingState(loading)` - Control de estados UI

### **3. Integración con APIs:**
- **Weavy AI** (ya configurado en el proyecto)
- **Supabase** (para almacenamiento)
- **APIs de generación** de video/imagen

## 📊 **Campos de Configuración Disponibles**

### **Información Básica:**
- URL del producto
- Creative brief
- Formato de salida (video/imagen/ambos)
- Relación de aspecto

### **Características del Personaje:**
- **Género:** Masculino, Femenino, No binario
- **Edad:** 10-17, 18-25, 26-30, 31-35, 36-40, 41-45, 46-50, 51-55, 56-60, 61-65, 66-70
- **Etnia:** Caucásico, Asiático, Árabe, Africano, Latinoamericano
- **Ojos:** Marrón, Azul, Verde, Gris, Miel
- **Cabello:** Muy rizado largo, Liso largo, Rizado corto, Liso corto, Largo en moño, Largo con ondas, Corto con ondas
- **Expresión:** Alegría emocionada, Confianza tranquila, Ira contenida, Duda escéptica, Anticipación ansiosa, Fatiga melancólica
- **Estilo:** Mediterráneo Smart Casual, Preppy Moderno, Ropa de Trabajo, Chic Parisino, Athleisure de Lujo, Neo Rockabilly, Mod de los 60s, Western Contemporáneo, Normcore Minimalista, Vanguardia Japonesa, Pijama, Estilo Bohemio Hippie

### **Prompts:**
- Prompt positivo (descripción detallada)
- Prompt negativo (lo que NO debe aparecer)

### **Imágenes:**
- Selección múltiple de imágenes de producto
- Vista previa de imágenes seleccionadas

## 🎯 **Próximos Pasos para Implementación**

1. **Definir API de destino** (Weavy AI, OpenAI, etc.)
2. **Implementar función de envío** de datos
3. **Configurar manejo de respuestas** asíncronas
4. **Agregar sistema de progreso** para generación larga
5. **Implementar preview** de resultados
6. **Configurar almacenamiento** de resultados en Supabase

## 🔍 **Testing del Sistema Actual**

Para probar el sistema actual:
1. Abrir `http://localhost:3000/studio`
2. Llenar campos requeridos (URL del producto, creative brief)
3. Seleccionar opciones de personaje
4. Hacer clic en "🎬 Generar UGC"
5. Verificar notificaciones y recopilación de datos en consola

## 📝 **Notas Técnicas**

- **Validación:** Solo requiere URL del producto y creative brief
- **Datos opcionales:** Todas las características del personaje son opcionales
- **Estado de carga:** Botón se deshabilita durante generación
- **Notificaciones:** Sistema visual de feedback al usuario
- **Consola:** Logs detallados para debugging

---

**Estado:** ✅ **Sistema limpio y preparado para nueva implementación**
**Última actualización:** 25 de octubre de 2024
