# FEAT-030 — Limpiar semantica del output del flow IGNIS en n8n

**Estado**: pendiente (tocar n8n)
**Owner**: equipo n8n
**Prioridad**: media

## Contexto

El flow IGNIS (`content_flow_id = 31696086-1981-4f4d-9cd7-4d5f58cfc6ed`,
`flow_module_id = 5f6802dc-3de6-478b-804e-97f44d80ff90`) tenia confusion de
semantica:

- El output llamado `copys` realmente contenia el JSON de typography/
  direccion creativa `{headline, subline, typography_notes}` — eso ES PROMPT,
  no copy.
- El output `scene_prompt` declarado en el `output_schema` nunca era enviado
  por n8n — el flow no lo generaba.
- No habia output con caption + hashtags listos para publicacion.

Resultado: la columna `runs_outputs.prompt_used` quedaba SIEMPRE NULL y la
columna `generated_copy` se llenaba con el prompt JSON (que no es lo que
deberia ir ahi).

## Fix aplicado en BD (2026-05-23)

Cambiado `output_schema.outputs.copys.field` de `'generated_copy'` a
`'prompt_used'` en flow_modules id `5f6802dc-...`. Ahora el contenido del
output `copys` cae al campo correcto. `generated_copy` queda libre para
copy publicable real (caption + descripcion).

Tambien backfill: 6 rows existentes movidas `generated_copy → prompt_used`.

Esto es solucion B (en BD). Resta hacer A y C en n8n cuando haya tiempo.

## Pendiente en n8n

### A) Renombrar output `copys` → `scene_prompt` (limpieza semantica)

El nodo final del flow IGNIS emite un objeto JSON con esta forma actualmente:

```json
{
  "copys": "{\"headline\":\"CIERRAS. TERMINAS.\",\"subline\":\"...\",...}",
  "creative_plan": {...},
  "image_metadata": {...},
  "image_storage_path": "production-outputs/...",
  "tokens_cost": 0
}
```

Renombrar `copys` → `scene_prompt` para que matchee semantica:

```json
{
  "scene_prompt": "{\"headline\":...}",
  "creative_plan": {...},
  ...
}
```

Tambien actualizar el `output_schema` en BD para eliminar el alias `copys`:

```sql
UPDATE flow_modules
SET output_schema = jsonb_set(
  output_schema,
  '{outputs}',
  (output_schema->'outputs') - 'copys'
)
WHERE id = '5f6802dc-3de6-478b-804e-97f44d80ff90';
```

(El field `scene_prompt` ya esta declarado correctamente apuntando a
`prompt_used`.)

### C) Agregar output `post_copy` y `post_hashtags` (feature nueva)

Para poder publicar las producciones a Meta/IG/etc., el flow IGNIS debe
generar tambien el copy real del post:

- `post_copy` (text): caption para acompañar la imagen
- `post_hashtags` (array): hashtags relevantes

Y declarar en el `output_schema`:

```json
{
  "post_copy": {
    "field": "generated_copy",
    "target_table": "runs_outputs"
  },
  "post_hashtags": {
    "field": "generated_hashtags",
    "target_table": "runs_outputs"
  }
}
```

Tipicamente esta es una etapa LLM nueva al final del flow que toma:
- El `scene_prompt` (que tipo de pieza es)
- El `creative_plan` (tone of voice, audiencia, campaign angle)
- El brand voice (de brand_containers)

Y genera el caption + 5-10 hashtags listos para publicar.

## Validacion post-fix

Una vez aplicado A + C, una row nueva de runs_outputs deberia tener:

```
prompt_used:        "{headline, subline, ...}"  ← typography del prompt
generated_copy:     "Texto del caption listo..."  ← copy publicable
generated_hashtags: ["#ignis", "#energia", ...]   ← hashtags publicables
metadata:           {creative_plan: {...}, image_meta: {...}}
storage_path:       "production-outputs/..."
```

Con eso, la accion "Publish to Meta" del modal de Production puede
funcionar end-to-end sin que el usuario tenga que escribir caption a mano.
