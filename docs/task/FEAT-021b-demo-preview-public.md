# FEAT-021 — Public read-only preview (`/demo`) over IGNIS

**Status**: ✅ Codigo implementado — ⏳ **PENDIENTE: realizar verificacion live post-deploy** (un humano entra a `/demo`, valida que las 6 known limitations se comporten como esperado, prueba conectar Meta/Google/Shopify desde demo y confirma que abre el modal "Solicitar acceso").

## Cambios 2026-05-22

- TODO #3 (data-attribute `data-demo-cta` en OAuth buttons) RESUELTO via guard
  inline en `js/views/brandstorage/InfoPanel.mixin.js`:
  - `startBrandIntegrationOAuth` ahora chequea `DemoGuard.isDemo()` antes del fetch al endpoint de start y abre el modal de signup
  - `disconnectBrandIntegration` mismo guard (tambien usa fetch directo, no estaba interceptado por el monkey-patch de Supabase)
  - No hizo falta agregar atributos HTML — el guard es 100% en JS.

## What was built

Public anonymous-session preview of the AI Smart Content platform, anchored on
the IGNIS demo org. Visitors hit `console.aismartcontent.io/demo`, are signed
in anonymously via Supabase, and are auto-attached to IGNIS with role=`demo`.
All mutations are blocked at three layers (DB RLS, JS interceptor, UI banner).

## Components

| Layer | File | Notes |
|---|---|---|
| **SQL bootstrap** | `SQL/migrations/2026_05_19_demo_mode_bootstrap.sql` | RESTRICTIVE policies on 86 org-scoped tables + sensitive-SELECT blocks + `organizations.is_demo` flag (UNIQUE partial — only 1 demo org allowed) + anon auto-join trigger (resolves demo org dynamically) + developer auto-admin trigger + cron cleanup (TTL 2h, runs every 30 min) + FK CASCADE on org_members.user_id + v_profiles_humans view |
| **Anon auth** | Supabase Dashboard | `external_anonymous_users_enabled=true` applied via Management API |
| **Entry view** | `js/views/DemoEntryView.js` | Splash that calls `supabase.auth.signInAnonymously()` and redirects to `/org/000000000001/ignis/vera` |
| **DemoGuard** | `js/services/DemoGuard.js` | Detects anon session, monkey-patches Supabase client to intercept mutations, owns CTA modal |
| **Banner** | `js/components/Navigation.js` `renderDemoBanner()` | Sticky "Estás viendo IGNIS — Crear cuenta →" |
| **Vera rate limit** | `functions/api-ai-engine-chat.js` | 5 msgs/IP/hour (in-memory) + 100 msgs/hour global cap (`demo_rate_limits` table) |
| **Telemetry** | `functions/api-demo-event.js` + `public.demo_events` | Allowlisted events, IP-hash dedup, 30-day retention |
| **Styles** | `css/modules/demo.css` | Splash, banner, modal — uses `--bg-card` + `--divider` (NOT glass on containers) |

## Known limitations / deferred items

1. **VeraView writes (ai_messages)** — when an anon user sends a message, the
   ai-engine still tries to persist `ai_messages` rows on behalf of the user.
   RLS blocks it silently (UPDATE/INSERT denied), but the message survives
   in-memory in the chat UI for that session. Cleanup happens when the anon
   user expires after 24h via the cron. **Acceptable for now**, but if we
   want a fully persistent chat for demo visitors we need to allow inserts
   into `ai_messages` for anonymous users *only on the IGNIS org*.

2. **Background flows (Production view)** — the production page lists existing
   flows from IGNIS. Some "Run" actions hit Netlify functions directly (not
   Supabase). Those endpoints don't yet check `is_anonymous` — RLS will fail
   the eventual writes silently, but the UX is "the run hangs and returns
   nothing." **Mitigation**: every Run button is wrapped via DemoGuard's
   interceptor when it uses `supabase.functions.invoke`, but direct fetch
   calls bypass. Audit each `/api/*` function for explicit anon check or
   move flow execution behind `supabase.functions.invoke`.

3. ~~**OAuth Connect buttons (Settings, Brand Storage)**~~ — ✅ RESUELTO 2026-05-22.
   `startBrandIntegrationOAuth` y `disconnectBrandIntegration` ahora chequean
   `DemoGuard.isDemo()` al inicio y abren el modal de signup. No hace falta
   atributo HTML — el guard es JS-only.

4. **Anonymous auth enabled globally** — `signup` is open since the demo
   needs it. This means anyone can call `/auth/v1/signup` with `{}` and get
   an anon session, not just visitors who go through `/demo`. Acceptable
   because RLS guards every mutation, but if abuse spikes we should add a
   captcha gate on the `/demo` page before calling signInAnonymously.

5. **Vera chat history is per-session** — every visitor gets their own anon
   user, so they each see an empty chat. They won't see the 16 archived
   `ai_messages` of IGNIS because those rows have a different `user_id`.
   If we want to *show* the historical conversation, we need a global
   shared "demo conversation" pinned in IGNIS that all anon users can SELECT.

6. **Anon JWT TTL is 1h** — when the JWT expires the SPA tries to refresh
   silently. Anon refresh works in supabase-js but if it ever fails the
   user gets logged out mid-session. Acceptable; if visitors complain we
   add a refresh listener.

## Removal procedure

If we ever pull the demo:

```sql
-- Drop all RESTRICTIVE policies in one pass
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT polname, tablename FROM pg_policies
    WHERE polname IN ('demo_block_insert','demo_block_update','demo_block_delete','demo_block_select_sensitive')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.polname, p.tablename);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS demo_attach_anonymous_user_trg ON auth.users;
DROP FUNCTION IF EXISTS public.demo_attach_anonymous_user();
DROP FUNCTION IF EXISTS public.demo_bump_rate_limit(text, timestamptz);
DROP FUNCTION IF EXISTS public.demo_cleanup_anonymous_users();
DROP TABLE IF EXISTS public.demo_rate_limits;
DROP TABLE IF EXISTS public.demo_events;
SELECT cron.unschedule('demo_cleanup_anonymous_users');
SELECT cron.unschedule('demo_cleanup_rate_limits');
```

Then disable anonymous auth in the Supabase dashboard and remove the
`/demo`, `DemoGuard`, banner, and event endpoint from the frontend.
