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
