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
  awareness_level text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  entity_id uuid,
  datos_demograficos ARRAY DEFAULT '{}'::text[],
  datos_psicograficos ARRAY DEFAULT '{}'::text[],
  dolores ARRAY DEFAULT '{}'::text[],
  deseos ARRAY DEFAULT '{}'::text[],
  objeciones ARRAY DEFAULT '{}'::text[],
  gatillos_compra ARRAY DEFAULT '{}'::text[],
  estilo_lenguaje ARRAY DEFAULT '{}'::text[],
  CONSTRAINT audiences_pkey PRIMARY KEY (id),
  CONSTRAINT audiences_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id),
  CONSTRAINT audiences_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id)
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
  logo_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization_id uuid,
  idiomas_contenido ARRAY DEFAULT '{}'::text[],
  mercado_objetivo ARRAY DEFAULT '{}'::text[],
  CONSTRAINT brand_containers_pkey PRIMARY KEY (id),
  CONSTRAINT brand_containers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT brand_containers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.brand_entities (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  entity_type text NOT NULL,
  name text NOT NULL,
  description text,
  price numeric,
  currency text DEFAULT 'USD'::text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active_for_automation boolean DEFAULT false,
  CONSTRAINT brand_entities_pkey PRIMARY KEY (id),
  CONSTRAINT brand_entities_brand_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.brand_fonts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_id uuid NOT NULL,
  font_family text NOT NULL,
  font_usage text NOT NULL,
  font_weight text DEFAULT '400'::text,
  font_url text,
  fallback_font text DEFAULT 'sans-serif'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_fonts_pkey PRIMARY KEY (id),
  CONSTRAINT brand_fonts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id)
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
  brand_container_id uuid,
  nombre_lugar text,
  descripcion_lugar text,
  url_lugar text,
  beneficios_principales ARRAY DEFAULT '{}'::text[],
  diferenciadores ARRAY DEFAULT '{}'::text[],
  casos_de_uso ARRAY DEFAULT '{}'::text[],
  caracteristicas_visuales ARRAY DEFAULT '{}'::text[],
  ambiente_y_vibra ARRAY DEFAULT '{}'::text[],
  amenidades ARRAY DEFAULT '{}'::text[],
  CONSTRAINT brand_places_pkey PRIMARY KEY (id),
  CONSTRAINT brand_places_entity_fkey FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id),
  CONSTRAINT brand_places_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id)
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
CREATE TABLE public.brand_social_links (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  platform text NOT NULL,
  url text NOT NULL,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_social_links_pkey PRIMARY KEY (id),
  CONSTRAINT brand_social_links_container_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  nicho_mercado ARRAY DEFAULT '{}'::text[],
  arquetipo_personalidad ARRAY DEFAULT '{}'::text[],
  enfoque_marca ARRAY DEFAULT '{}'::text[],
  estilo_visual ARRAY DEFAULT '{}'::text[],
  estilo_publicidad ARRAY DEFAULT '{}'::text[],
  transmitir_visualmente ARRAY DEFAULT '{}'::text[],
  evitar_visualmente ARRAY DEFAULT '{}'::text[],
  tono_comunicacion ARRAY DEFAULT '{}'::text[],
  estilo_escritura ARRAY DEFAULT '{}'::text[],
  palabras_clave ARRAY DEFAULT '{}'::text[],
  palabras_prohibidas ARRAY DEFAULT '{}'::text[],
  objetivos_marca ARRAY DEFAULT '{}'::text[],
  CONSTRAINT brands_pkey PRIMARY KEY (id),
  CONSTRAINT brands_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.brand_containers(id)
);
CREATE TABLE public.campaign_entities (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  is_hero boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT campaign_entities_pkey PRIMARY KEY (id),
  CONSTRAINT fk_campaign FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id),
  CONSTRAINT fk_entity FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id)
);
CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  cta text NOT NULL,
  cta_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  audience_id uuid,
  nombre_campana text DEFAULT 'Campaña Estratégica'::text,
  descripcion_interna text,
  contexto_temporal ARRAY DEFAULT '{}'::text[],
  objetivos_estrategicos ARRAY DEFAULT '{}'::text[],
  angulos_venta ARRAY DEFAULT '{}'::text[],
  oferta_principal ARRAY DEFAULT '{}'::text[],
  tono_modificador ARRAY DEFAULT '{}'::text[],
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id),
  CONSTRAINT campaigns_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audiences(id)
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
  flow_image_url text,
  description text,
  flow_category_type text DEFAULT 'manual'::text CHECK (flow_category_type = ANY (ARRAY['manual'::text, 'automated'::text])),
  token_cost integer DEFAULT 1,
  owner_id uuid,
  version text DEFAULT '1.0.0'::text,
  status USER-DEFINED DEFAULT 'draft'::flow_lifecycle_status,
  builder_version text DEFAULT 'v1'::text,
  ui_layout_config jsonb DEFAULT '{}'::jsonb,
  likes_count integer DEFAULT 0,
  saves_count integer DEFAULT 0,
  run_count integer DEFAULT 0,
  subcategory_id uuid,
  slug text UNIQUE,
  execution_mode text DEFAULT 'single_step'::text CHECK (execution_mode = ANY (ARRAY['single_step'::text, 'multi_step'::text, 'sequential'::text])),
  CONSTRAINT content_flows_pkey PRIMARY KEY (id),
  CONSTRAINT content_flows_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.content_categories(id),
  CONSTRAINT content_flows_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES public.content_subcategories(id),
  CONSTRAINT fk_flow_owner FOREIGN KEY (owner_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.content_subcategories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  order_index integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT content_subcategories_pkey PRIMARY KEY (id)
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
  CONSTRAINT credit_usage_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT credit_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.developer_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  flow_id uuid NOT NULL,
  run_id uuid,
  environment text DEFAULT 'test'::text CHECK (environment = ANY (ARRAY['test'::text, 'prod'::text])),
  severity USER-DEFINED DEFAULT 'error'::log_severity_level,
  error_message text NOT NULL,
  raw_details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  flow_module_id uuid,
  CONSTRAINT developer_logs_pkey PRIMARY KEY (id),
  CONSTRAINT logs_flow_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id),
  CONSTRAINT fk_logs_module FOREIGN KEY (flow_module_id) REFERENCES public.flow_modules(id)
);
CREATE TABLE public.developer_notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  recipient_user_id uuid NOT NULL,
  flow_id uuid,
  severity USER-DEFINED DEFAULT 'info'::notification_severity_type,
  title text NOT NULL,
  message text,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT developer_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notif_flow_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id)
);
CREATE TABLE public.developer_stats (
  user_id uuid NOT NULL,
  total_flows_created integer DEFAULT 0,
  total_published_flows integer DEFAULT 0,
  total_successful_runs bigint DEFAULT 0,
  avg_flow_rating numeric DEFAULT 0.00,
  current_rank USER-DEFINED DEFAULT 'novice'::developer_rank_type,
  last_promotion_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT developer_stats_pkey PRIMARY KEY (user_id),
  CONSTRAINT developer_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.flow_collaborators (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  flow_id uuid NOT NULL,
  developer_id uuid NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'viewer'::flow_collaborator_role,
  invited_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT flow_collaborators_pkey PRIMARY KEY (id),
  CONSTRAINT collab_flow_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id)
);
CREATE TABLE public.flow_modules (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  content_flow_id uuid NOT NULL,
  name text NOT NULL,
  step_order integer NOT NULL,
  execution_type text DEFAULT 'webhook'::text CHECK (execution_type = ANY (ARRAY['webhook'::text, 'python'::text, 'make'::text, 'internal'::text, 'ai_direct'::text, 'aggregator'::text])),
  webhook_url_test text,
  webhook_url_prod text,
  input_schema jsonb DEFAULT '{}'::jsonb,
  output_schema jsonb DEFAULT '{}'::jsonb,
  is_human_approval_required boolean DEFAULT false,
  next_module_id uuid,
  routing_rules jsonb,
  CONSTRAINT flow_modules_pkey PRIMARY KEY (id),
  CONSTRAINT fk_module_parent FOREIGN KEY (content_flow_id) REFERENCES public.content_flows(id),
  CONSTRAINT fk_module_next FOREIGN KEY (next_module_id) REFERENCES public.flow_modules(id)
);
CREATE TABLE public.flow_runs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  flow_id uuid,
  brand_id uuid,
  user_id uuid,
  status text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  entity_id uuid,
  audience_id uuid,
  tokens_consumed integer DEFAULT 0,
  webhook_response_code integer,
  payment_status USER-DEFINED DEFAULT 'pending'::payment_status_type,
  current_module_order integer DEFAULT 1,
  total_modules_count integer,
  is_paused boolean DEFAULT false,
  step_history jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT flow_runs_pkey PRIMARY KEY (id),
  CONSTRAINT flow_runs_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id),
  CONSTRAINT flow_runs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id),
  CONSTRAINT flow_runs_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id),
  CONSTRAINT flow_runs_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audiences(id)
);
CREATE TABLE public.flow_technical_details (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  platform_name text DEFAULT 'n8n'::text,
  platform_flow_id text,
  platform_flow_name text,
  editor_url text,
  credential_id text,
  is_healthy boolean DEFAULT true,
  last_health_check timestamp with time zone,
  avg_execution_time_ms integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  flow_module_id uuid NOT NULL UNIQUE,
  CONSTRAINT flow_technical_details_pkey PRIMARY KEY (id),
  CONSTRAINT fk_tech_module FOREIGN KEY (flow_module_id) REFERENCES public.flow_modules(id)
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
  CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  owner_user_id uuid,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
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
  precio_producto numeric,
  moneda text DEFAULT 'USD'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  entity_id uuid,
  beneficios_principales ARRAY DEFAULT '{}'::text[],
  diferenciadores ARRAY DEFAULT '{}'::text[],
  casos_de_uso ARRAY DEFAULT '{}'::text[],
  caracteristicas_visuales ARRAY DEFAULT '{}'::text[],
  materiales_composicion ARRAY DEFAULT '{}'::text[],
  variantes ARRAY DEFAULT '{}'::text[],
  url_producto text,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id),
  CONSTRAINT products_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'user'::text CHECK (role = ANY (ARRAY['admin'::text, 'dev'::text, 'user'::text])),
  is_developer boolean DEFAULT false,
  dev_role text,
  dev_rank text,
  default_view_mode text DEFAULT 'user'::text CHECK (default_view_mode = ANY (ARRAY['user'::text, 'developer'::text])),
  plan_type text DEFAULT 'basico'::text,
  form_verified boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.runs_inputs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  run_id uuid NOT NULL,
  input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  flow_module_id uuid,
  CONSTRAINT runs_inputs_pkey PRIMARY KEY (id),
  CONSTRAINT runs_inputs_run_fkey FOREIGN KEY (run_id) REFERENCES public.flow_runs(id),
  CONSTRAINT fk_inputs_module FOREIGN KEY (flow_module_id) REFERENCES public.flow_modules(id)
);
CREATE TABLE public.runs_outputs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  run_id uuid,
  output_type text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  storage_path text,
  prompt_used text,
  generated_copy text,
  generated_hashtags jsonb,
  creative_rationale text,
  technical_params jsonb,
  text_content text,
  storage_object_id uuid,
  flow_module_id uuid,
  CONSTRAINT runs_outputs_pkey PRIMARY KEY (id),
  CONSTRAINT flow_outputs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.flow_runs(id),
  CONSTRAINT fk_outputs_module FOREIGN KEY (flow_module_id) REFERENCES public.flow_modules(id)
);
CREATE TABLE public.services (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  brand_container_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  nombre_servicio text NOT NULL,
  descripcion_servicio text,
  duracion_estimada text,
  precio_base numeric,
  moneda text DEFAULT 'USD'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  beneficios_principales ARRAY DEFAULT '{}'::text[],
  diferenciadores ARRAY DEFAULT '{}'::text[],
  casos_de_uso ARRAY DEFAULT '{}'::text[],
  entregables ARRAY DEFAULT '{}'::text[],
  metodologia_pasos ARRAY DEFAULT '{}'::text[],
  url_servicio text,
  CONSTRAINT services_pkey PRIMARY KEY (id),
  CONSTRAINT services_project_id_fkey FOREIGN KEY (brand_container_id) REFERENCES public.brand_containers(id),
  CONSTRAINT services_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.brand_entities(id)
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
  plan_type USER-DEFINED NOT NULL,
  status USER-DEFINED DEFAULT 'pending'::subscription_status_enum,
  credits_included integer NOT NULL,
  price numeric NOT NULL,
  currency text DEFAULT 'USD'::text,
  started_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organization_id uuid NOT NULL,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.ui_component_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'basic'::text,
  icon_name text,
  base_schema jsonb NOT NULL,
  default_ui_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  order_index integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ui_component_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_flow_favorites (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  flow_id uuid NOT NULL,
  is_favorite boolean DEFAULT true,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  last_used_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_flow_favorites_pkey PRIMARY KEY (id),
  CONSTRAINT favorites_flow_fkey FOREIGN KEY (flow_id) REFERENCES public.content_flows(id),
  CONSTRAINT user_flow_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.visual_references (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  image_url text,
  thumbnail_url text,
  category text NOT NULL,
  visual_type text NOT NULL,
  prompt_details jsonb NOT NULL,
  priority integer DEFAULT 1,
  usable_for_generation boolean DEFAULT true,
  brand_container_id uuid,
  entity_type text,
  entity_subtype text,
  created_at timestamp with time zone DEFAULT now(),
  bucket text DEFAULT 'visual-references'::text,
  object_path text NOT NULL,
  CONSTRAINT visual_references_pkey PRIMARY KEY (id)
);