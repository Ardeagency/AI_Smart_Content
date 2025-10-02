-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.aesthetics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  mood text,
  palette ARRAY,
  lighting text,
  camera text,
  pace text,
  music jsonb,
  overlays ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  reference_file_ids ARRAY DEFAULT '{}'::uuid[],
  CONSTRAINT aesthetics_pkey PRIMARY KEY (id),
  CONSTRAINT aesthetics_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.assets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  product_image_ids ARRAY DEFAULT '{}'::uuid[],
  logo_file_id uuid,
  packaging_ids ARRAY DEFAULT '{}'::uuid[],
  manual_ids ARRAY DEFAULT '{}'::uuid[],
  screenshot_ids ARRAY DEFAULT '{}'::uuid[],
  review_ids ARRAY DEFAULT '{}'::uuid[],
  created_at timestamp with time zone DEFAULT now(),
  extra_file_ids ARRAY DEFAULT '{}'::uuid[],
  CONSTRAINT assets_pkey PRIMARY KEY (id),
  CONSTRAINT assets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT fk_logo_file FOREIGN KEY (logo_file_id) REFERENCES public.files(id)
);
CREATE TABLE public.audience (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  buyer_persona jsonb NOT NULL,
  interests ARRAY,
  pains ARRAY,
  contexts ARRAY,
  language_codes ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audience_pkey PRIMARY KEY (id),
  CONSTRAINT audience_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.avatars (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  avatar_type text,
  traits jsonb,
  energy text,
  gender text,
  voice jsonb,
  languages ARRAY,
  values ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  avatar_image_id uuid,
  avatar_video_id uuid,
  CONSTRAINT avatars_pkey PRIMARY KEY (id),
  CONSTRAINT avatars_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT avatars_avatar_image_id_fkey FOREIGN KEY (avatar_image_id) REFERENCES public.files(id),
  CONSTRAINT avatars_avatar_video_id_fkey FOREIGN KEY (avatar_video_id) REFERENCES public.files(id)
);
CREATE TABLE public.brand_guidelines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  tone_of_voice text,
  keywords_yes ARRAY,
  keywords_no ARRAY,
  dos_donts text,
  brand_assets jsonb,
  reference_links ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  logo_file_id uuid,
  brand_file_ids ARRAY DEFAULT '{}'::uuid[],
  name text NOT NULL DEFAULT 'Nueva Marca'::text,
  CONSTRAINT brand_guidelines_pkey PRIMARY KEY (id),
  CONSTRAINT brand_guidelines_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT brand_guidelines_logo_file_id_fkey FOREIGN KEY (logo_file_id) REFERENCES public.files(id)
);
CREATE TABLE public.compliance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  claims_allowed ARRAY,
  claims_forbidden ARRAY,
  platform_restrictions ARRAY,
  advertising_labels ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT compliance_pkey PRIMARY KEY (id),
  CONSTRAINT compliance_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.distribution (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  platforms ARRAY NOT NULL,
  formats ARRAY,
  durations ARRAY,
  utm_params jsonb,
  ab_variables jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT distribution_pkey PRIMARY KEY (id),
  CONSTRAINT distribution_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  path text NOT NULL,
  bucket text DEFAULT 'ugc-assets'::text,
  file_type text,
  category text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT files_pkey PRIMARY KEY (id),
  CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);

-- Habilitar RLS en la tabla files
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para la tabla files
-- Permitir a usuarios autenticados insertar archivos
CREATE POLICY "Allow authenticated users to insert files" ON public.files
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' 
  AND auth.uid() = user_id
);

-- Permitir a usuarios ver sus propios archivos
CREATE POLICY "Allow users to view their own files" ON public.files
FOR SELECT USING (
  auth.role() = 'authenticated' 
  AND auth.uid() = user_id
);

-- Permitir a usuarios actualizar sus propios archivos
CREATE POLICY "Allow users to update their own files" ON public.files
FOR UPDATE USING (
  auth.role() = 'authenticated' 
  AND auth.uid() = user_id
);

-- Permitir a usuarios eliminar sus propios archivos
CREATE POLICY "Allow users to delete their own files" ON public.files
FOR DELETE USING (
  auth.role() = 'authenticated' 
  AND auth.uid() = user_id
);
CREATE TABLE public.notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  restrictions text,
  founder_prefs text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notes_pkey PRIMARY KEY (id),
  CONSTRAINT notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  main_objective text NOT NULL,
  offer_desc text,
  offer_valid_until date,
  cta text NOT NULL,
  cta_url text NOT NULL,
  kpis ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT offers_pkey PRIMARY KEY (id),
  CONSTRAINT offers_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  provider text,
  provider_payment_id text,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id),
  CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  product_type text NOT NULL,
  short_desc text NOT NULL,
  benefits ARRAY NOT NULL,
  differentiators ARRAY,
  usage_steps ARRAY NOT NULL,
  ingredients ARRAY,
  price numeric,
  variants ARRAY,
  availability text,
  created_at timestamp with time zone DEFAULT now(),
  main_image_id uuid,
  gallery_file_ids ARRAY DEFAULT '{}'::uuid[],
  name text NOT NULL DEFAULT 'Nuevo Producto'::text,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT products_main_image_id_fkey FOREIGN KEY (main_image_id) REFERENCES public.files(id)
);
CREATE TABLE public.project_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  snapshot jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_history_pkey PRIMARY KEY (id),
  CONSTRAINT project_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.project_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text,
  config jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_templates_pkey PRIMARY KEY (id),
  CONSTRAINT project_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  website text,
  country text NOT NULL,
  languages ARRAY DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.scenarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  main_location text NOT NULL,
  ambience text,
  hygiene text,
  backdrop text,
  created_at timestamp with time zone DEFAULT now(),
  scenario_file_ids ARRAY DEFAULT '{}'::uuid[],
  CONSTRAINT scenarios_pkey PRIMARY KEY (id),
  CONSTRAINT scenarios_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.style_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  prompt text,
  video_file_id uuid,
  name text,
  label text,
  category text,
  filters ARRAY,
  config jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT style_catalog_pkey PRIMARY KEY (id),
  CONSTRAINT style_catalog_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT style_catalog_video_file_id_fkey FOREIGN KEY (video_file_id) REFERENCES public.files(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_type text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  start_date timestamp with time zone NOT NULL DEFAULT now(),
  current_period_start timestamp with time zone NOT NULL DEFAULT now(),
  current_period_end timestamp with time zone NOT NULL,
  cancel_at timestamp with time zone,
  canceled_at timestamp with time zone,
  renewal_period interval DEFAULT '1 mon'::interval,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  action text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT usage_logs_pkey PRIMARY KEY (id),
  CONSTRAINT usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT usage_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  country text,
  language text DEFAULT 'es'::text,
  access_level text DEFAULT 'user'::text,
  plan_type text NOT NULL DEFAULT 'free'::text,
  plan_status text NOT NULL DEFAULT 'active'::text,
  plan_started_at timestamp with time zone DEFAULT now(),
  plan_expires_at timestamp with time zone,
  renewal_period interval DEFAULT '1 mon'::interval,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id)
);