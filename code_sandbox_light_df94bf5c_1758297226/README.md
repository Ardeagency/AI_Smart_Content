# UGC Studio - Landing Page

Una landing page futurista y minimalista para UGC Studio, una plataforma de generación de contenido UGC (User Generated Content) realista con control avanzado de prompts y sistema automatizado complejo.

## 🚀 Características Implementadas

### Páginas Completadas
1. **Landing Page (index.html)** - Página principal con presentación completa
2. **Página de Planes (planes.html)** - Tres planes detallados con comparación y FAQ

### Diseño Visual
- **Fondo negro (#000000)** como base principal
- **Color dominante #FD624F** (rojo-naranja vibrante) para elementos destacados
- **Estilo futurista y minimalista** inspirado en ardeagency.com/blog
- **Gradientes dinámicos** y efectos de iluminación
- **Tipografía Inter** para máxima legibilidad
- **Grid animado** de fondo con movimiento perpetuo

### Secciones Principales
1. **Hero Section** - Presentación principal con animaciones llamativas
2. **Navigation** - Navbar fijo con efecto blur y transparencia conectado entre páginas
3. **Features** - Tarjetas interactivas con las características principales
4. **Demo Section** - Interfaz de terminal simulada con animación de tipeo
5. **Planes Section** - Tres planes (Starter, Pro, Enterprise) con modelos de IA incluidos
6. **Comparación de Planes** - Tabla detallada de características y entregables
7. **FAQ Interactiva** - Acordeón con preguntas frecuentes sobre los planes
8. **CTA Section** - Llamadas a la acción conectadas a planes
9. **Footer** - Enlaces organizados y redes sociales

### Efectos y Animaciones
- **Partículas flotantes** con movimiento continuo
- **Animaciones de entrada** activadas por scroll
- **Efectos hover avanzados** en tarjetas y botones
- **Ripple effect** en todos los botones
- **Parallax suave** en elementos decorativos
- **Terminal animado** con efecto de escritura en tiempo real
- **Elementos magnéticos** en CTAs principales

### Características Técnicas
- **Totalmente responsive** - Optimizado para móviles y desktop
- **Navegación suave** entre secciones
- **Menú hamburguesa** funcional en dispositivos móviles
- **Performance optimizada** con debouncing en eventos de scroll
- **CSS Grid y Flexbox** para layouts modernos
- **Intersection Observer** para animaciones eficientes

## 🎨 Paleta de Colores

```css
--primary-color: #FD624F    /* Rojo-naranja principal */
--primary-dark: #e5553d     /* Variante oscura */
--primary-light: #ff7a65    /* Variante clara */
--bg-black: #000000         /* Fondo principal */
--bg-dark: #0a0a0a          /* Fondo secundario */
--bg-card: #111111          /* Fondo de tarjetas */
--text-primary: #ffffff     /* Texto principal */
--text-secondary: #a3a3a3   /* Texto secundario */
--accent-glow: rgba(253, 98, 79, 0.3) /* Brillo de acento */
```

## 📁 Estructura del Proyecto

```
├── index.html                  # Página principal (landing)
├── planes.html                 # Página de planes y precios  
├── onboarding-complete.html   # Formulario completo (25 pasos)
├── dashboard.html             # Dashboard básico (placeholder)
├── css/
│   ├── style.css             # Estilos principales con efectos futuristas
│   ├── planes.css            # Estilos específicos para página de planes
│   ├── payment-modal.css     # Estilos para modal de pago
│   └── onboarding.css        # Estilos para formularios de onboarding
├── js/
│   ├── main.js               # JavaScript para interactividad y animaciones
│   ├── planes.js             # JavaScript específico para página de planes
│   ├── payment-modal.js      # JavaScript para modal de pago
│   └── onboarding-complete.js # JavaScript para formulario completo
└── README.md                 # Documentación del proyecto
```

## 💼 Planes Implementados

### Plan Starter ($0/mes)
- **Modelos IA**: Veo 3 + NanoBanana + Seedream
- **Generación**: 1 UGC por ejecución
- **Entregables**: 1 video, 1 imagen, 1 avatar + control de guiones y copies

### Plan Pro ($0/mes) - Más Popular
- **Modelos IA**: Veo 3 + NanoBanana + Seedream
- **Generación**: 3 UGC por ejecución
- **Entregables**: 3 videos, 3 imágenes, 1 avatar + control de guiones y copies

### Plan Enterprise ($0/mes)
- **Modelos IA**: Veo 3 + NanoBanana + Seedream
- **Generación**: 6 UGC por ejecución
- **Entregables**: 6 videos, 6 imágenes, 1 avatar + control de guiones y copies

## 🌟 Funcionalidades Destacadas

### Hero Section
- Título con gradiente animado
- Botones con efectos hover y ripple
- Dashboard preview con simulación de carga
- Elementos flotantes con animación continua

### Features Section
- 4 tarjetas principales con iconos FontAwesome
- Efectos hover con transformaciones y brillos
- Animaciones de entrada desde el scroll
- Diseño de grid adaptativo

### Demo Terminal
- Simulación de terminal de comandos
- Animación de tipeo realista
- Efectos de cursor parpadeante
- Bucle infinito de demostración

### Interactividad Avanzada
- Efectos magnéticos en botones CTA
- Partículas generativas en tiempo real
- Parallax sutil en elementos decorativos
- Navegación suave entre secciones

## 🔧 Tecnologías Utilizadas

- **HTML5** semántico con estructura moderna
- **CSS3** con custom properties y animaciones avanzadas
- **JavaScript ES6+** para interactividad
- **FontAwesome 6** para iconografía
- **Google Fonts (Inter)** para tipografía
- **CSS Grid y Flexbox** para layouts responsivos

## 📱 Responsive Design

La landing page está completamente optimizada para:
- **Desktop** (1200px+)
- **Tablet** (768px - 1199px)
- **Mobile** (320px - 767px)

Características responsive:
- Menú hamburguesa en dispositivos móviles
- Grids adaptativos que se colapsan a una columna
- Botones y espaciado optimizado para touch
- Tipografía escalable con clamp()

## 🚀 Características de UGC Studio (Plataforma)

La landing page presenta una plataforma ficticia con:

1. **Generación de UGC Realistas** - IA avanzada para contenido auténtico
2. **Control Avanzado de Prompts** - Sistema sofisticado de manejo de instrucciones
3. **Automatización Compleja** - Workflows sin intervención manual
4. **Analytics Profundos** - Métricas de rendimiento y conversión

## ✨ Funcionalidades Avanzadas de la Página de Planes

### Interactividad
- **Modal de selección de planes** con confirmación visual
- **Acordeón FAQ** completamente funcional
- **Animaciones de hover** específicas por tipo de plan
- **Tabla de comparación** responsiva y detallada
- **Notificaciones de éxito** al seleccionar planes
- **Navegación conectada** entre landing y planes

### Efectos Visuales
- **Colores diferenciados** por plan (Verde/Starter, Rojo/Pro, Morado/Enterprise)
- **Badge "Más Popular"** en el plan Pro
- **Animaciones escalonadas** en la entrada de tarjetas
- **Efectos magnéticos** en botones de selección
- **Modales glassmorphism** con blur effects

## 💳 Modal de Pago Implementado

### Características del Modal
- **Diseño completamente estético** - Solo visual, funcionalidad desactivada
- **Múltiples métodos de pago** - Tarjeta, PayPal, Apple Pay, Google Pay
- **Formulario completo** con validaciones visuales
- **Animaciones suaves** y efectos de transición
- **Responsive design** adaptado a móviles
- **Badges de seguridad** para generar confianza

### Funcionalidades Visuales
- **Selección de método de pago** con efectos radio animados
- **Formateo automático** de números de tarjeta y fecha
- **Estados de procesamiento** con spinners animados
- **Modal de éxito** tras completar el flujo
- **Notificación de prueba gratuita** destacada
- **Resumen de pago** con desglose detallado

### Integración
- Se abre desde todos los botones "Comenzar Gratis" de los planes
- También desde el botón CTA principal (defaultea a Plan Pro)
- Cierre con ESC, click fuera del modal o botones de cancelar
- Transiciones fluidas y efectos de profundidad
- **Flujo conectado**: Pago → Modal de éxito → Modal de registro automáticamente

## 📝 Formulario de Onboarding Tipo Typeform

### Navegación Intuitiva
- **Estilo Typeform** - Una pregunta a la vez con navegación fluida
- **Progreso visual** con barra animada y contador de pasos
- **Navegación por teclado** - Enter, flechas, ESC para cerrar
- **Auto-avance** en selecciones de opciones
- **Animaciones suaves** entre preguntas

### Formulario Completo Implementado - 25 Pasos ✅

**📦 SECCIÓN 1: PRODUCTO (Steps 1-7) - ✅ COMPLETA**
1. **Nombre del Producto** - Campo texto (validación 2+ caracteres)
2. **Tipo de Producto** - 6 opciones: físico, digital, servicio, curso, software, evento  
3. **Categoría** - Campo texto libre (validación 2+ caracteres)
4. **Subcategoría** - Campo texto opcional
5. **Descripción** - Textarea 1000 caracteres (validación 30+ caracteres)
6. **Características Principales** - 4 campos (2 mínimo requeridos)
7. **📸 Subida de Fotos** - 4 imágenes del producto (2 mínimo requeridas)

**🎨 SECCIÓN 2: PREFERENCIAS UGC (Steps 8-20) - ✅ COMPLETA**
8. **Plataforma Principal** - Instagram, TikTok, YouTube, Facebook, LinkedIn, Twitter
9. **Tipo de Contenido UGC** - Múltiple selección: videos, fotos, reseñas, unboxing, tutoriales, comparaciones
10. **Presupuesto Mensual** - Slider de rango ($100 - $10,000+)
11. **Número de Creadores** - Slider de rango (1 - 50+ creadores)
12. **Frecuencia de Contenido** - Diario, semanal, quincenal, mensual
13. **Duración Preferida** - 15-30s, 30-60s, 1-3min, 3min+ con descripciones de uso
14. **Tono de Comunicación** - Múltiple selección: profesional, casual, divertido, educativo, inspiracional
15. **Audiencia Objetivo** - Descripción detallada (validación 20+ caracteres)
16. **Ubicación Geográfica** - Múltiple selección: México, USA, Latinoamérica, Global
17. **Hashtags Relevantes** - Input de texto con temas del nicho (validación 5+ caracteres)
18. **Experiencia Previa** - Nunca, poca, moderada, experto con descripciones
19. **Métricas de Éxito** - Múltiple selección: engagement, alcance, conversiones, awareness, credibilidad
20. **Otras Preferencias** - Campo opcional para detalles especiales

**🏷️ SECCIÓN 3: MARCA (Steps 21-25) - ✅ COMPLETA**
21. **Nombre de la Marca** - Campo requerido (validación 2+ caracteres)
22. **Sitio Web** - URL opcional del website de la marca
23. **Redes Sociales** - Enlaces a Instagram, TikTok, Facebook, YouTube (opcional)
24. **Industria** - Selección del sector: belleza, moda, tecnología, fitness, hogar, comida, otro
25. **Descripción de Marca** - Textarea detallada (validación 50+ caracteres)

**🎉 PANTALLA DE ÉXITO**
- Animación de confirmación con iconos pulsantes
- Mensaje de bienvenida personalizado
- Botón para acceder al dashboard
- Efectos visuales futuristas

### Características Técnicas Avanzadas
- **Validación en tiempo real** para todos los 25 pasos
- **Componentes UI especializados**: range sliders, multi-select cards, upload de imágenes
- **Manejo de archivos**: drag & drop, preview, validación de formato y tamaño
- **Contadores de caracteres** dinámicos para campos de texto
- **Auto-navegación** inteligente entre pasos
- **Almacenamiento completo** de datos del esquema SQL
- **Ripple effects** y animaciones suaves
- **Skip option** con preservación de datos
- **Pantalla de éxito** con transiciones animadas
- **Navegación por teclado** (Enter, flechas, ESC)
- **Responsive design** optimizado para móviles

### Flujo de Usuario Actualizado
1. Usuario selecciona plan → **Modal de Pago**
2. Completa información de pago → **Modal de éxito breve**
3. Redirección automática → **Página de Onboarding**
4. Completa configuración → **Dashboard** (en construcción)

## 💾 Schema de Base de Datos (Implementado en Onboarding)

El formulario recolecta datos basados en la vista SQL `ugc_preferences_complete`:

### Campos Capturados

**Información del Producto:**
- **nombre_producto** - Nombre del producto o servicio
- **tipo_producto** - Físico, Digital, Servicio, Experiencia
- **categoria** - Tecnología, Belleza, Moda, Hogar, etc.
- **descripcion** - Descripción detallada del producto
- **caracteristica_1/2/3** - Tres características principales
- **beneficio_1/2/3** - Beneficios clave para el usuario

**Información de Marca:**
- **nombre_marca** - Nombre comercial o personal de la marca
- **nicho_principal** - Lifestyle, Tech, Fashion, Fitness, Food, Travel, Business, etc.

**Preferencias de Contenido:**
- **plataforma_principal** - Instagram, TikTok, YouTube, etc.
- **estilo_contenido** - Casual, Profesional, Trendy, Elegante
- **filtros_preferidos** - Natural, Warm, Cool, Vintage, etc.
- **iluminacion** - Natural, Studio, Golden Hour, Dramatic
- **tipo_avatar** - Influencer, Profesional, Amigable, Experto

### Nuevas Características de la Sección Marca
- **12 Nichos Especializados**: Lifestyle, Tech, Fashion, Fitness, Food, Travel, Business, Education, Entertainment, Home Decor, Automotive, Pets
- **Descripciones Detalladas**: Cada nicho incluye explicación de su enfoque
- **Hint Contextual**: Ayuda para marcas personales vs comerciales
- **Validación Inteligente**: Nombre de marca mínimo 2 caracteres

### Campos Pendientes (Para Futuras Expansiones)
- subcategoria, imagenes_producto 
- genero_avatar, edad_avatar, etnia_avatar
- caracteristicas_avatar, tipos_escenarios
- tono_copy, longitud_texto, idioma_contenido
- mensaje_clave, call_to_action, aspect_ratio

## 🎯 Próximos Pasos Sugeridos

1. **✅ COMPLETADO: Formulario onboarding de 25 pasos** - Implementado con esquema SQL completo
2. **Backend API integration** para procesar registros y preferencias capturadas
3. **Dashboard completo** con generador de UGC funcional
4. **Integración real con IA** (Veo 3, NanoBanana, Seedream APIs)
5. **Sistema de autenticación** y gestión de sesiones de usuario
6. **Base de datos** para persistir usuarios, preferencias e imágenes subidas
7. **Generador de UGC** inteligente basado en las preferencias detalladas capturadas
8. **Sistema de facturación** real y gestión de suscripciones por plan
9. **Analytics de uso** y métricas de conversión del onboarding
10. **Testing A/B** y optimización de la experiencia de usuario completa

## 💡 Inspiración de Diseño

La página está inspirada en la estética moderna de ardeagency.com/blog, incorporando:
- Minimalismo sofisticado
- Uso estratégico del espacio en blanco
- Tipografía como elemento visual
- Efectos sutiles pero impactantes
- Navegación intuitiva y limpia

---

**Nota**: Esta es una landing page de demostración que muestra las capacidades de diseño web moderno. Para implementar funcionalidad completa, se requerirá integración con backend y servicios de terceros.