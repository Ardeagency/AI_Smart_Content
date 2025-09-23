-- =========================================
-- EXTENSIONES
-- =========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================
-- USER PROFILES
-- =========================================
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'free', -- free, basic, pro, enterprise
  plan_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- SUBSCRIPTIONS
-- =========================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, past_due, cancelled, expired
  current_period_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  current_period_end TIMESTAMP WITH TIME ZONE,
  renewal_period INTERVAL DEFAULT interval '1 month',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- PAYMENTS
-- =========================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL, -- paid, pending, failed, refunded
  provider TEXT,
  provider_payment_id TEXT,
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- PROJECTS
-- =========================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  country TEXT NOT NULL,
  languages TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- FILES (Supabase Storage references)
-- =========================================
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  bucket TEXT DEFAULT 'ugc-assets',
  file_type TEXT,
  category TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX files_project_id_idx ON files(project_id);
CREATE INDEX files_category_idx ON files(category);

-- =========================================
-- BRAND GUIDELINES
-- =========================================
CREATE TABLE brand_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tone_of_voice TEXT,
  keywords_yes TEXT[],
  keywords_no TEXT[],
  dos_donts TEXT,
  logo_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  brand_file_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- PRODUCTS
-- =========================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL,
  short_desc TEXT NOT NULL,
  benefits TEXT[] NOT NULL,
  differentiators TEXT[],
  usage_steps TEXT[] NOT NULL,
  ingredients TEXT[],
  price NUMERIC NOT NULL,
  variants TEXT[],
  main_image_id UUID REFERENCES files(id) ON DELETE SET NULL,
  gallery_file_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- AVATARS
-- =========================================
CREATE TABLE avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  avatar_type TEXT, -- IA, Humano
  traits JSONB,
  energy TEXT,
  gender TEXT,
  voice JSONB,
  languages TEXT[],
  values TEXT[],
  avatar_image_id UUID REFERENCES files(id) ON DELETE SET NULL,
  avatar_video_id UUID REFERENCES files(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- ASSETS EXTRA (para agrupar file_ids no clasificados)
-- =========================================
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_image_ids UUID[] DEFAULT '{}',
  logo_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  packaging_ids UUID[] DEFAULT '{}',
  manual_ids UUID[] DEFAULT '{}',
  screenshot_ids UUID[] DEFAULT '{}',
  review_ids UUID[] DEFAULT '{}',
  extra_file_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- PROJECT HISTORY (snapshots)
-- =========================================
CREATE TABLE project_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- PROJECT TEMPLATES
-- =========================================
CREATE TABLE project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =========================================
-- STYLE CATALOG
-- =========================================
CREATE TABLE style_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt TEXT,
  video_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  name TEXT,
  label TEXT,
  category TEXT,
  filters TEXT[],
  config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
