-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_brand_vectors (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  brand_container_id uuid NOT NULL,
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  source_type text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding USER-DEFINED,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_brand_vectors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_global_vectors (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  source_type text NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding USER-DEFINED,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_global_vectors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.audiences (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  demographics jsonb,
  psychographics jsonb,
  pains jsonb,
  desires jsonb,
  objections jsonb,
  awareness_level text,
  language_style text,
  triggers jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audiences_pkey PRIMARY KEY (id),
  CONSTRAINT audiences_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.brand_assets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamp with time zone DEFAULT now(),
  asset_type text,
  metadata jsonb,
  CONSTRAINT brand_assets_pkey PRIMARY KEY (id),
  CONSTRAINT brand_files_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.brand_colors (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_id uuid NOT NULL,
  color_role text NOT NULL,
  hex_value text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_colors_pkey PRIMARY KEY (id),
  CONSTRAINT brand_colors_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.brand_containers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  nombre_marca text NOT NULL,
  sitio_web text,
  instagram_url text,
  tiktok_url text,
  logo_url text,
  idiomas_contenido jsonb DEFAULT '[]'::jsonb,
  mercado_objetivo jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  facebook_url text CHECK (facebook_url IS NULL OR facebook_url ~* '^https?://(www\.)?(facebook|fb)\.com/.*$'::text),
  organization_id uuid,
  CONSTRAINT brand_containers_pkey PRIMARY KEY (id),
  CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT brand_containers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.brand_entities (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  entity_type text NOT NULL,
  name text NOT NULL,
  description text,
  core_benefits jsonb DEFAULT '[]'::jsonb,
  differentiation text,
  usage_context text,
  price numeric,
  currency text DEFAULT 'USD'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_entities_pkey PRIMARY KEY (id),
  CONSTRAINT brand_entities_brand_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.brand_places (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  entity_id uuid NOT NULL,
  address text,
  city text,
  country text,
  latitude numeric,
  longitude numeric,
  place_type text,
  opening_hours jsonb,
  contact_info jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_places_pkey PRIMARY KEY (id),
  CONSTRAINT brand_places_entity_fkey FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id)
);
CREATE TABLE public.brand_profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_id uuid NOT NULL,
  section text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT brand_profiles_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.brand_rules (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_id uuid NOT NULL,
  rule_type text NOT NULL,
  rule_value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_rules_pkey PRIMARY KEY (id),
  CONSTRAINT brand_rules_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL UNIQUE,
  tono_voz USER-DEFINED NOT NULL,
  palabras_usar text,
  palabras_evitar jsonb DEFAULT '[]'::jsonb,
  reglas_creativas text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  personalidad_marca text,
  quienes_somos text,
  objetivos_marca jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT brands_pkey PRIMARY KEY (id),
  CONSTRAINT brands_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  oferta_desc text,
  audiencia_desc text NOT NULL,
  intenciones text,
  objetivo_principal text NOT NULL,
  cta text NOT NULL,
  cta_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  audience_id uuid,
  brand_id uuid,
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id),
  CONSTRAINT campaigns_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audiences(id),
  CONSTRAINT campaigns_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
);
CREATE TABLE public.content_categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  order_index integer,
  CONSTRAINT content_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.content_flows (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  category_id uuid,
  name text NOT NULL,
  output_type text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT content_flows_pkey PRIMARY KEY (id),
  CONSTRAINT content_flows_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.content_categories(id)
);
CREATE TABLE public.credit_usage (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  credits_used integer NOT NULL,
  operation_type text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  organization_id uuid,
  CONSTRAINT credit_usage_pkey PRIMARY KEY (id),
  CONSTRAINT credit_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT credit_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.flow_inputs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  flow_id uuid,
  input_key text NOT NULL,
  label text NOT NULL,
  input_type text NOT NULL,
  required boolean DEFAULT false,
  options jsonb,
  order_index integer,
  CONSTRAINT flow_inputs_pkey PRIMARY KEY (id),
  CONSTRAINT flow_inputs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id)
);
CREATE TABLE public.flow_outputs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  run_id uuid,
  output_type text NOT NULL,
  file_url text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT flow_outputs_pkey PRIMARY KEY (id),
  CONSTRAINT flow_outputs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.flow_runs(id)
);
CREATE TABLE public.flow_runs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  flow_id uuid,
  brand_id uuid,
  user_id uuid,
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT flow_runs_pkey PRIMARY KEY (id),
  CONSTRAINT flow_runs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id),
  CONSTRAINT flow_runs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id),
  CONSTRAINT flow_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.organization_credits (
  organization_id uuid NOT NULL,
  credits_available integer NOT NULL DEFAULT 0,
  credits_total integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organization_credits_pkey PRIMARY KEY (organization_id),
  CONSTRAINT organization_credits_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.organization_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  user_id uuid,
  role text NOT NULL DEFAULT 'admin'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organization_members_pkey PRIMARY KEY (id),
  CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  owner_user_id uuid,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organizations_pkey PRIMARY KEY (id),
  CONSTRAINT organizations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.product_images (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL,
  image_url text NOT NULL,
  image_type text NOT NULL,
  image_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT product_images_pkey PRIMARY KEY (id),
  CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  tipo_producto USER-DEFINED NOT NULL,
  nombre_producto text NOT NULL,
  descripcion_producto text NOT NULL,
  beneficio_1 text,
  beneficio_2 text,
  beneficio_3 text,
  diferenciacion text,
  modo_uso text,
  ingredientes text,
  precio_producto numeric,
  moneda text DEFAULT 'USD'::text,
  variantes_producto text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.storage_usage (
  organization_id uuid NOT NULL,
  used_mb numeric DEFAULT 0,
  max_mb numeric NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT storage_usage_pkey PRIMARY KEY (organization_id),
  CONSTRAINT storage_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  plan_type USER-DEFINED NOT NULL,
  status USER-DEFINED DEFAULT 'pending'::subscription_status_enum,
  credits_included integer NOT NULL,
  price numeric NOT NULL,
  currency text DEFAULT 'USD'::text,
  started_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text,
  phone_number text,
  role text NOT NULL DEFAULT 'user'::text,
  email_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  plan_type USER-DEFINED DEFAULT 'basico'::plan_tipo_enum,
  credits_available integer DEFAULT 0,
  credits_total integer DEFAULT 0,
  form_verified boolean NOT NULL DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);