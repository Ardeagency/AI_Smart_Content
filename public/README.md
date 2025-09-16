# UGC STUDIO - Frontend

Interfaz web moderna para la plataforma UGC STUDIO con diseño dinámico y experiencia de usuario optimizada.

## 🎨 Diseño Visual

### Esquema de Colores
- **Negro Primario**: `#000000` - Fondo principal
- **Negro Secundario**: `#1a1a1a` - Tarjetas y elementos
- **Gris Oscuro**: `#2a2a2a` - Bordes y separadores
- **Gris Medio**: `#404040` - Texto secundario
- **Gris Claro**: `#666666` - Texto deshabilitado
- **Blanco**: `#ffffff` - Texto principal
- **Acento**: `#FD624F` - Color secundario destacado

### Tipografía
- **Fuente Principal**: Helvetica
- **Pesos**: 300, 400, 500, 600, 700
- **Jerarquía**: Títulos, subtítulos, cuerpo, etiquetas

### Efectos Visuales
- **Gradientes Eléctricos**: Combinación de negro y #FD624F
- **Animaciones Suaves**: Transiciones de 0.3s
- **Efectos Hover**: Elevación y brillo
- **Sombras Glow**: Efectos de resplandor con color acento

## 🏗️ Estructura de Archivos

```
public/
├── index.html          # Página principal
├── css/
│   └── styles.css      # Estilos principales
├── js/
│   └── main.js         # Funcionalidad JavaScript
└── README.md           # Documentación del frontend
```

## 🚀 Características

### 1. Header Dinámico
- Logo con animación shimmer
- Navegación principal con iconos
- Botón destacado "Crear UGC"
- Diseño responsive

### 2. Dashboard de Bienvenida
- Saludo personalizado al usuario
- Estado del plan activo
- Contador de créditos disponibles
- Gradientes eléctricos de fondo

### 3. Accesos Rápidos
- 4 acciones principales con iconos
- Efectos hover dinámicos
- Animaciones de entrada
- Modales informativos

### 4. Biblioteca del Usuario
- Sistema de pestañas (Marcas, Productos, Avatares, Recursos)
- Tarjetas interactivas con acciones
- Botones de agregar nuevo elemento
- Animaciones de transición

### 5. Explorador de UGCs
- Grid responsive de resultados
- Filtros por tipo de contenido
- Previews con overlay de reproducción
- Acciones de favorito, descarga y compartir

### 6. Panel de Solicitudes
- Lista de requests recientes
- Estados visuales (Completado, Procesando)
- Información de tiempo y tipo
- Diseño de lista compacta

### 7. Bloque de Planes
- Información del plan actual
- Contador de créditos
- Botones de actualización
- Gradiente eléctrico de fondo

### 8. Footer Informativo
- Enlaces de soporte
- Información legal
- Descripción de la plataforma
- Diseño en columnas responsive

## 🎯 Funcionalidades JavaScript

### UGCStudio Object
```javascript
UGCStudio = {
    state: {},           // Estado de la aplicación
    init(),              // Inicialización
    setupEventListeners(), // Configurar eventos
    showModal(),         // Mostrar modales
    animateButton(),     // Animar botones
    filterUGCs(),        // Filtrar contenido
    toggleFavorite(),    // Toggle favoritos
    // ... más métodos
}
```

### Características Interactivas
- **Navegación de Pestañas**: Cambio dinámico de contenido
- **Modales**: Sistema de ventanas emergentes
- **Animaciones**: Efectos de entrada y hover
- **Filtros**: Búsqueda y filtrado de contenido
- **Acciones**: Botones interactivos con feedback visual

## 📱 Responsive Design

### Breakpoints
- **Desktop**: > 768px - Layout completo
- **Tablet**: 768px - Layout adaptado
- **Mobile**: < 480px - Layout vertical

### Adaptaciones Mobile
- Navegación simplificada
- Grid de una columna
- Botones de tamaño táctil
- Modales fullscreen

## 🎨 Animaciones

### CSS Animations
- `fadeInUp`: Entrada desde abajo
- `slideInRight`: Entrada desde la derecha
- `shimmer`: Efecto de brillo
- `pulse`: Efecto de pulsación

### JavaScript Animations
- Hover effects en tarjetas
- Button press feedback
- Modal transitions
- Tab content switching

## 🔧 Configuración

### Variables CSS
```css
:root {
    --primary-black: #000000;
    --accent-color: #FD624F;
    --font-family: 'Helvetica', Arial, sans-serif;
    --gradient-electric: linear-gradient(45deg, #000000 0%, #FD624F 50%, #000000 100%);
    /* ... más variables */
}
```

### Configuración JavaScript
```javascript
// Estado inicial
state: {
    currentUser: {
        name: 'Juan Pérez',
        plan: 'Pro',
        credits: 47,
        active: true
    }
}
```

## 🚀 Uso

1. **Iniciar servidor**:
   ```bash
   npm run dev
   ```

2. **Abrir navegador**:
   ```
   http://localhost:3000
   ```

3. **Interactuar**:
   - Navegar entre pestañas
   - Usar accesos rápidos
   - Filtrar UGCs
   - Explorar biblioteca

## 🎯 Próximas Funcionalidades

- [ ] Integración con API backend
- [ ] Drag & drop para archivos
- [ ] Notificaciones en tiempo real
- [ ] Modo oscuro/claro
- [ ] Temas personalizables
- [ ] PWA (Progressive Web App)

## 📝 Notas de Desarrollo

- **Compatibilidad**: Chrome 90+, Firefox 88+, Safari 14+
- **Performance**: Optimizado para 60fps
- **Accesibilidad**: Contraste WCAG AA
- **SEO**: Meta tags optimizados
