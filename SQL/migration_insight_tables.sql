-- =============================================================================
-- Migration: Insight My Brands – tablas de memoria contextual
-- Ejecutar en Supabase SQL Editor
-- =============================================================================

-- 1. brand_analytics_snapshots
-- Caché de métricas agregadas por plataforma y período.
-- El dashboard lee aquí; no recalcula en vivo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_analytics_snapshots (
  id                  uuid    NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id  uuid    NOT NULL,
  platform            text    NOT NULL,           -- 'facebook' | 'google' | 'instagram' | 'youtube'
  period_type         text    NOT NULL,           -- '7d' | '30d' | '90d' | 'monthly'
  period_start        date    NOT NULL,
  period_end          date    NOT NULL,
  metrics             jsonb   NOT NULL DEFAULT '{}',
  -- metrics estructura esperada:
  -- {
  --   followers, followers_delta, reach, impressions, posts_count,
  --   avg_engagement_rate, total_likes, total_comments, total_shares,
  --   spend, clicks, ctr, cpm, cpc,           -- solo plataformas con Ads
  --   sessions, active_users, bounce_rate     -- solo Google Analytics
  -- }
  computed_at         timestamptz DEFAULT now(),
  CONSTRAINT brand_analytics_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT brand_analytics_snapshots_container_fkey
    FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS brand_analytics_snapshots_unique
  ON public.brand_analytics_snapshots (brand_container_id, platform, period_type, period_start);

-- RLS
ALTER TABLE public.brand_analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_analytics_snapshots_select" ON public.brand_analytics_snapshots
  FOR SELECT USING (
    brand_container_id IN (
      SELECT id FROM public.brand_containers WHERE user_id = auth.uid()
      UNION
      SELECT bc.id FROM public.brand_containers bc
      JOIN public.organization_members om ON om.organization_id = bc.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "brand_analytics_snapshots_service" ON public.brand_analytics_snapshots
  FOR ALL USING (auth.role() = 'service_role');


-- =============================================================================
-- 2. brand_content_analysis
-- Análisis de OpenAI por post. Se genera una vez y se reutiliza siempre.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_content_analysis (
  id                    uuid    NOT NULL DEFAULT uuid_generate_v4(),
  brand_post_id         uuid    NOT NULL UNIQUE,
  brand_container_id    uuid    NOT NULL,
  tone_detected         text,                     -- 'emocional' | 'técnico' | 'urgente' | 'inspirador' | 'informativo'
  tone_coherence_score  numeric,                  -- 0-100: coincidencia con brand_rules
  dominant_emotion      text,                     -- 'alegría' | 'confianza' | 'sorpresa' | 'ironía' | 'ira' | 'confusión'
  narrative_pillar      text,                     -- 'producto' | 'comunidad' | 'valores' | 'oferta' | 'educación' | 'entretenimiento'
  why_it_worked         jsonb   DEFAULT '{}',
  -- why_it_worked estructura:
  -- { hook: text, first_sentence_quality: 0-100, visual_cue: text, cta_strength: 0-100, audio_relevance: text }
  clarity_score         numeric,                  -- 0-100: ¿el público entiende qué vendemos?
  fatigue_risk          boolean DEFAULT false,    -- señal de fatiga de contenido
  analyzed_at           timestamptz DEFAULT now(),
  CONSTRAINT brand_content_analysis_pkey PRIMARY KEY (id),
  CONSTRAINT brand_content_analysis_post_fkey
    FOREIGN KEY (brand_post_id) REFERENCES public.brand_posts(id) ON DELETE CASCADE,
  CONSTRAINT brand_content_analysis_container_fkey
    FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS brand_content_analysis_container_idx
  ON public.brand_content_analysis (brand_container_id);

CREATE INDEX IF NOT EXISTS brand_content_analysis_pillar_idx
  ON public.brand_content_analysis (brand_container_id, narrative_pillar);

-- RLS
ALTER TABLE public.brand_content_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_content_analysis_select" ON public.brand_content_analysis
  FOR SELECT USING (
    brand_container_id IN (
      SELECT id FROM public.brand_containers WHERE user_id = auth.uid()
      UNION
      SELECT bc.id FROM public.brand_containers bc
      JOIN public.organization_members om ON om.organization_id = bc.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "brand_content_analysis_service" ON public.brand_content_analysis
  FOR ALL USING (auth.role() = 'service_role');


-- =============================================================================
-- 3. brand_narrative_pillars
-- Temas activos y huérfanos detectados por la IA en el contenido de la marca.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_narrative_pillars (
  id                  uuid    NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id  uuid    NOT NULL,
  pillar_name         text    NOT NULL,
  pillar_type         text    NOT NULL DEFAULT 'active', -- 'active' | 'orphan' | 'emerging'
  post_count          integer DEFAULT 0,
  avg_engagement      numeric DEFAULT 0,
  avg_reach           numeric DEFAULT 0,
  description         text,
  last_post_at        timestamptz,
  analyzed_at         timestamptz DEFAULT now(),
  CONSTRAINT brand_narrative_pillars_pkey PRIMARY KEY (id),
  CONSTRAINT brand_narrative_pillars_container_fkey
    FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS brand_narrative_pillars_container_idx
  ON public.brand_narrative_pillars (brand_container_id, pillar_type);

-- RLS
ALTER TABLE public.brand_narrative_pillars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_narrative_pillars_select" ON public.brand_narrative_pillars
  FOR SELECT USING (
    brand_container_id IN (
      SELECT id FROM public.brand_containers WHERE user_id = auth.uid()
      UNION
      SELECT bc.id FROM public.brand_containers bc
      JOIN public.organization_members om ON om.organization_id = bc.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "brand_narrative_pillars_service" ON public.brand_narrative_pillars
  FOR ALL USING (auth.role() = 'service_role');


-- =============================================================================
-- 4. brand_audience_heatmap
-- Mapa de calor hora/día basado en historial de posts y su engagement.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.brand_audience_heatmap (
  id                  uuid    NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id  uuid    NOT NULL,
  platform            text    NOT NULL,
  hour_engagement     jsonb   DEFAULT '{}',
  -- {"0": 0.12, "1": 0.05, ..., "23": 0.78}  — score promedio normalizado 0-1
  day_engagement      jsonb   DEFAULT '{}',
  -- {"0": 0.65, ..., "6": 0.30}  — 0=lunes, 6=domingo
  best_hour           integer,
  best_day            integer,
  computed_at         timestamptz DEFAULT now(),
  CONSTRAINT brand_audience_heatmap_pkey PRIMARY KEY (id),
  CONSTRAINT brand_audience_heatmap_container_fkey
    FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS brand_audience_heatmap_unique
  ON public.brand_audience_heatmap (brand_container_id, platform);

-- RLS
ALTER TABLE public.brand_audience_heatmap ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_audience_heatmap_select" ON public.brand_audience_heatmap
  FOR SELECT USING (
    brand_container_id IN (
      SELECT id FROM public.brand_containers WHERE user_id = auth.uid()
      UNION
      SELECT bc.id FROM public.brand_containers bc
      JOIN public.organization_members om ON om.organization_id = bc.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "brand_audience_heatmap_service" ON public.brand_audience_heatmap
  FOR ALL USING (auth.role() = 'service_role');
