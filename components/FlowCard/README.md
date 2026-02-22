# FlowCard (referencia minimalista)

Card minimalista al estilo de la referencia: **imagen protagonista sin overlays**, **zona inferior con fondo sólido**, chips + título (dos niveles) + descripción. Acciones (Like, Save, Iniciar) en la barra inferior, más visibles en hover.

## Estructura

- **Contenedor**: Bordes redondeados 28px, borde claro, sombra suave.
- **Zona superior (~60%)**: Solo imagen full-bleed. Sin badges ni token sobre la imagen.
- **Zona inferior (~40%)**: Fondo sólido. Chips → Título → Subtítulo → Descripción (line-clamp 2). Fila de acciones (tokens + Like + Save + Iniciar) al final, con mayor opacidad en hover.

## Props

| Prop | Tipo | Descripción |
|------|------|-------------|
| `flow` | `Object` | Fila `content_flows`: id, name, description, flow_image_url, output_type, token_cost, flow_category_type, execution_mode, … |
| `userState` | `Object` | isLoggedIn, likedFlowIds, savedFlowIds, onRequireLogin |
| `onRun` | `(flowId) => void` | Al hacer click en Iniciar |
| `onLike` | `(flowId, active) => void` | Toggle like |
| `onSave` | `(flowId, active) => void` | Toggle guardar |
| `onOpenDetails` | `(flowId) => void` | Al hacer click en la card (modal/drawer) |
| `className` | `string` | Clases adicionales |

## Uso

```jsx
import { FlowCard } from './FlowCard';
import './flowCard.css';

<FlowCard
  flow={flow}
  userState={{ isLoggedIn: !!user, likedFlowIds: [], savedFlowIds: [] }}
  onRun={handleRun}
  onLike={handleLike}
  onSave={handleSave}
  onOpenDetails={openDrawer}
/>
```
