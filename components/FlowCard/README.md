# FlowCard

Componente UI premium para el catálogo de flujos (`content_flows`). Card minimalista, foto-first, con bordes redondeados grandes, sombra suave y overlay inferior con gradiente. Permite Like, Guardar e Iniciar.

## Estructura del componente

```
FlowCard (article.fc)
├── fc__hero (zona superior ~65%)
│   ├── fc__media → fc__img | fc__placeholder
│   ├── fc__badges (esquina superior izquierda, máx. 2)
│   └── fc__token-pill (esquina superior derecha)
├── fc__overlay (gradiente negro → transparente)
│   └── fc__content
│       ├── fc__title (name, 2 líneas max)
│       ├── fc__desc (description, line-clamp)
│       ├── fc__chips (output_type, execution_mode, flow_category_type)
│       ├── fc__stats (likes, saves, runs o "Nuevo")
│       ├── fc__cta-row (tokens + botón Iniciar)
│       └── fc__actions (Like / Save)
└── fc__meta-tiny (solo variant myFlows: status + version)
```

## Props

| Prop | Tipo | Requerido | Descripción |
|------|------|-----------|-------------|
| `flow` | `Object` | ✅ | Fila de `content_flows`: id, name, description, flow_image_url, output_type, token_cost, flow_category_type, execution_mode, execution_strategy, status, created_at, likes_count, saves_count, run_count, version, show_in_catalog, slug. |
| `userState` | `Object` | No | Estado del usuario. |
| `userState.isLoggedIn` | `boolean` | No | Si está logueado (para Like/Save). |
| `userState.likedFlowIds` | `string[]` | No | IDs de flujos que dio like. |
| `userState.savedFlowIds` | `string[]` | No | IDs de flujos guardados. |
| `userState.isOwner` | `boolean \| (flowId) => boolean` | No | Si el usuario es dueño del flujo (para badge DRAFT). |
| `userState.isAdmin` | `boolean` | No | Para mostrar DRAFT en flujos ajenos. |
| `userState.onRequireLogin` | `() => void` | No | Callback si hace Like/Save sin estar logueado. |
| `variant` | `'catalog' \| 'myFlows'` | No | `catalog`: badges + métricas. `myFlows`: además status + version (tiny). |
| `onRun` | `(flowId: string) => void` | No | Al hacer click en "Iniciar". |
| `onLike` | `(flowId: string, active: boolean) => void` | No | Tras toggle Like (optimistic UI ya aplicado). |
| `onSave` | `(flowId: string, active: boolean) => void` | No | Tras toggle Guardar. |
| `onOpenDetails` | `(flowId: string) => void` | No | Al hacer click en el cuerpo de la card (modal/drawer). |
| `className` | `string` | No | Clases adicionales en el contenedor. |

## Uso

```jsx
import { FlowCard } from './FlowCard';
import './flowCard.css';

<FlowCard
  flow={flow}
  userState={{
    isLoggedIn: !!user,
    likedFlowIds: user?.liked_flow_ids ?? [],
    savedFlowIds: user?.saved_flow_ids ?? [],
    isOwner: (id) => flow.owner_id === user?.id,
    isAdmin: user?.role === 'lead',
    onRequireLogin: () => setShowLogin(true),
  }}
  variant="catalog"
  onRun={(id) => router.navigate(`/studio?flow=${id}`)}
  onLike={handleLike}
  onSave={handleSave}
  onOpenDetails={(id) => openFlowDrawer(id)}
/>
```

## Badges (getFlowCardBadges)

- **NUEVO**: `created_at` &lt; 7 días.
- **TRENDING**: `run_count` ≥ 50 (o lógica custom).
- **DRAFT**: `status === 'draft'` y (`isOwner` o `isAdmin`).

Máximo 2 badges por card. Prioridad: NUEVO → TRENDING → DRAFT.

## Accesibilidad

- Card navegable por teclado (`tabIndex={0}`, Enter/Espacio abren detalles).
- `aria-label` en botones Like, Save e Iniciar.
- `aria-pressed` en Like y Save.
- Contraste alto en textos del overlay (blanco sobre gradiente oscuro).

## CSS

Importar `flowCard.css` después de las variables de tema (`base.css`). Usa `var(--bg-primary)`, `var(--bg-card)`, `var(--accent-warm)` cuando existan.
