-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.brand_files (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT brand_files_pkey PRIMARY KEY (id),
  CONSTRAINT brand_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
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
  CONSTRAINT brands_pkey PRIMARY KEY (id),
  CONSTRAINT brands_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  oferta_desc text,
  audiencia_desc text NOT NULL,
  intenciones text,
  objetivo_principal text NOT NULL,
  cta text NOT NULL,
  cta_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.credit_usage (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  credits_used integer NOT NULL,
  operation_type text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT credit_usage_pkey PRIMARY KEY (id),
  CONSTRAINT credit_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
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
  project_id uuid NOT NULL,
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
  CONSTRAINT products_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);
CREATE TABLE public.projects (
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
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
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