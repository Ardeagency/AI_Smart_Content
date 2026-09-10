---
id: SEC-002
severity: high
type: SEC
status: open
created: 2026-07-28
owner: ARDE
programado: esta semana, al terminar el dashboard
---

# Barrido de RLS y grants en toda la base (no sólo las tablas del panel)

## Contexto

El audit del 2026-07-28 miró **sólo las 22 tablas que toca el panel `/dev`** y
encontró dos fallos. Los dos resultaron **sistémicos, no puntuales**:

1. **`profiles` tenía GRANT UPDATE sobre columnas de privilegio.** RLS estaba
   activo y la policy era razonable, pero `authenticated` podía escribir
   `dev_role`, `is_developer`, `role` y `plan_type` de su propia fila. Con la
   policy de UPDATE sin `WITH CHECK`, Postgres reusa el `USING` — que la fila
   nueva también cumple. Cualquiera se promovía a lead desde la consola del
   navegador.

2. **24 policies `demo_block_*` escritas PERMISSIVE.** Las permisivas se suman con
   **OR**, así que una policy pensada para *bloquear* cuentas demo **concedía**:
   escritura y borrado cruzado entre organizaciones en 8 tablas.

Ambos se arreglaron donde se miró. **La base tiene ~150 tablas y sólo se
revisaron 22.** Hay que asumir que el mismo patrón está en otras.

## Qué hacer

**A. Policies "de bloqueo" que en realidad conceden.** Buscar toda policy cuyo
nombre o intención sea restrictiva pero esté creada PERMISSIVE:

```sql
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND permissive='PERMISSIVE'
  AND (policyname ILIKE '%block%' OR policyname ILIKE '%deny%'
       OR policyname ILIKE '%demo%' OR qual ILIKE '%is_anonymous%');
```

**Cuidado al convertir:** si esa policy es la ÚNICA de ese comando en la tabla,
pasarla a RESTRICTIVE deja la tabla sin ninguna permisiva y **bloquea toda
escritura**. Comprobar antes si el frontend escribe esa tabla; si sólo la escribe
el backend con `service_role` (que ignora RLS), bloquear al cliente es lo correcto.

**B. Grants por columna sobre columnas de privilegio.** Cualquier columna que
decida permisos, plan, rol o cuota no debe tener GRANT UPDATE para `authenticated`:

```sql
SELECT table_name, column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND grantee IN ('authenticated','anon')
  AND privilege_type='UPDATE'
  AND (column_name ~* 'role|admin|developer|lead|plan|tier|credit|quota|permission|is_');
```

**C. Policies de UPDATE sin `WITH CHECK`.** Silenciosamente reusan el `USING`, que
casi nunca es la comprobación que se quería sobre la fila nueva:

```sql
SELECT tablename, policyname FROM pg_policies
WHERE schemaname='public' AND cmd='UPDATE' AND with_check IS NULL;
```

**D. Policies con `USING (true)` o `WITH CHECK (true)`** en tablas con datos de
tenant. Ya apareció una así: `platform_insights_daily.pid_insert` permitía a
cualquier autenticado insertar filas atribuidas a cualquier organización.

## Método

No leer `SQL/` del repo — deriva de producción. Verificar **simulando el rol**,
que es como se encontraron los dos fallos de hoy:

```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims TO '{"sub":"<uid>","role":"authenticated"}';
  -- intentar la operación, contar filas afectadas
ROLLBACK;
```

Herramienta: `~/.claude/arde-tools/supabase/runsql.sh`.

## Por qué no se hizo ya

Parado a propósito para no arriesgar el perfil `info@ardeagency.com` (cuenta lead
de desarrollo) mientras se termina el dashboard.

---

## Estado real medido 2026-09-10 (ejecutando, no leyendo)

**Lo que estaba abierto no eran las tablas: eran las FUNCIONES.**

Cerrar `anon` por tablas (09/09) no lo cerró por funciones. El barrido del
catálogo encontró **33 funciones `SECURITY DEFINER` que escriben, sin ninguna
guarda de autorización en el cuerpo, ejecutables con la sola llave pública**.
Entre ellas `refund_credits_for_run`, `use_credits`, `use_credits_numeric` y
`deduct_credits_*` (créditos = plata), `fn_vpa_approve`/`fn_vpa_reject`
(aprobar acciones de Vera a nombre de otro), `demo_cleanup_anonymous_users` y
`purge_studied_followers` (borran), y `bind_comfy_flow`.

### La trampa que costó una pasada

El primer intento (`REVOKE EXECUTE ... FROM anon`) **no cambió nada y no falló**.
El permiso no lo tenía `anon`: lo tenía **`PUBLIC`** — la entrada `=X/postgres`
del ACL. Revocarle a un rol lo que hereda de `PUBLIC` es un no-op mudo.
El contador sólo bajó de 33 a 32 porque a `bind_comfy_flow` se le puso guarda.

### Aplicado y verificado

| Qué | Antes | Después |
|---|---|---|
| Funciones definer sin guarda ejecutables sin sesión | 33 | **0** |
| `EXECUTE` para `PUBLIC` en funciones de la app | 288 | **0** (quedan 59, todas de extensiones: `pg_trgm`, `plpgsql_check`, `unaccent`) |
| Policies de escritura con `true` | 3 | **0** |
| `TRUNCATE` para `anon` / `authenticated` | 215 / 218 | **0 / 0** |
| Tablas sin RLS | 0 | 0 (ya cerrado 09/09) |

Seguro porque se verificó antes: las 288 funciones tenían **grant propio** de
`authenticated` y de `service_role`, el navegador entra como `authenticated`,
los Netlify functions usan `service_role`, y **ninguna RPC se llama antes del
login**.

### Lo que queda abierto

1. **La raíz tiene DOS dueños y sólo se pudo cerrar uno.**
   `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` se aplicó. El de
   `supabase_admin` (59 funciones) responde `42501: permission denied to change
   default privileges` — no se puede desde el acceso actual. Requiere soporte de
   Supabase o un rol superusuario. **Mientras tanto, todo objeto nuevo creado
   por `supabase_admin` nace con `EXECUTE` para `anon`.**
2. **Grants de escritura de `anon` sobre 215 relaciones.** Es la postura por
   defecto de Supabase y **con RLS activo en las 206 tablas no expone nada**.
   Es defensa en profundidad pendiente, no una fuga. Decir eso con precisión.
3. Falta la prueba **ejecutando** del cruce entre organizaciones para un usuario
   `authenticated` (el intento se hizo; lo bloqueó el clasificador de permisos
   de la sesión). El agujero de policy ya se cerró igual.
