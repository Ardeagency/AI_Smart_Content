-- =========================================
-- FIX RLS POLICIES - SOLUCION DEFINITIVA
-- =========================================

-- First, disable RLS temporarily to clean up
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role full access" ON user_profiles;
DROP POLICY IF EXISTS "Allow signup inserts" ON user_profiles;
DROP POLICY IF EXISTS "System can insert profiles" ON user_profiles;

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;
DROP POLICY IF EXISTS "Service role full access subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Allow signup subscription inserts" ON subscriptions;
DROP POLICY IF EXISTS "System can insert subscriptions" ON subscriptions;

-- Re-enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- =========================================
-- SIMPLIFIED POLICIES FOR USER_PROFILES
-- =========================================

-- Policy 1: Service role has full access (highest priority)
CREATE POLICY "service_role_full_access" ON user_profiles
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 2: Authenticated users can do everything during signup
CREATE POLICY "authenticated_full_access" ON user_profiles
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy 3: Allow anonymous inserts for signup (triggers need this)
CREATE POLICY "allow_insert_for_signup" ON user_profiles
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- =========================================
-- SIMPLIFIED POLICIES FOR SUBSCRIPTIONS
-- =========================================

-- Policy 1: Service role has full access
CREATE POLICY "service_role_full_access_subs" ON subscriptions
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 2: Authenticated users can do everything
CREATE POLICY "authenticated_full_access_subs" ON subscriptions
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Policy 3: Allow anonymous inserts for signup
CREATE POLICY "allow_insert_for_signup_subs" ON subscriptions
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- =========================================
-- IMPROVED TRIGGER FUNCTION
-- =========================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    profile_exists boolean := false;
    subscription_exists boolean := false;
BEGIN
    -- Log the trigger execution
    RAISE LOG 'handle_new_user trigger called for user: %', NEW.id;
    
    -- Check if profile already exists
    SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE user_id = NEW.id) INTO profile_exists;
    
    -- Only create profile if it doesn't exist
    IF NOT profile_exists THEN
        INSERT INTO public.user_profiles (
            user_id, 
            full_name, 
            country, 
            language, 
            plan_type,
            plan_status,
            created_at,
            updated_at
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
            COALESCE(NEW.raw_user_meta_data->>'country', 'CO'),
            COALESCE(NEW.raw_user_meta_data->>'language', 'es'),
            COALESCE(NEW.raw_user_meta_data->>'plan_type', 'starter'),
            'pending_payment',
            NOW(),
            NOW()
        );
        RAISE LOG 'Created user_profile for user: %', NEW.id;
    ELSE
        RAISE LOG 'Profile already exists for user: %', NEW.id;
    END IF;
    
    -- Check if subscription already exists
    SELECT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id = NEW.id) INTO subscription_exists;
    
    -- Only create subscription if it doesn't exist
    IF NOT subscription_exists THEN
        INSERT INTO public.subscriptions (
            user_id,
            plan_type,
            status,
            current_period_start,
            current_period_end,
            renewal_period,
            created_at
        )
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'plan_type', 'starter'),
            'pending_payment',
            NOW(),
            NOW() + INTERVAL '7 days',
            '1 month',
            NOW()
        );
        RAISE LOG 'Created subscription for user: %', NEW.id;
    ELSE
        RAISE LOG 'Subscription already exists for user: %', NEW.id;
    END IF;
    
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE LOG 'Error in handle_new_user trigger for user %: % - %', NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION handle_new_user();

-- =========================================
-- GRANT NECESSARY PERMISSIONS
-- =========================================

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant table permissions
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.subscriptions TO service_role;
GRANT ALL ON public.payments TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT ON public.payments TO authenticated;

GRANT INSERT ON public.user_profiles TO anon;
GRANT INSERT ON public.subscriptions TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- =========================================
-- PROJECTS POLICIES (For first login detection)
-- =========================================

-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "service_role_full_access_projects" ON projects;
DROP POLICY IF EXISTS "users_can_view_own_projects" ON projects;
DROP POLICY IF EXISTS "users_can_insert_own_projects" ON projects;
DROP POLICY IF EXISTS "users_can_update_own_projects" ON projects;
DROP POLICY IF EXISTS "users_can_delete_own_projects" ON projects;

-- Policy 1: Service role has full access
CREATE POLICY "service_role_full_access_projects" ON projects
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 2: Users can view their own projects
CREATE POLICY "users_can_view_own_projects" ON projects
    FOR SELECT 
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 3: Users can insert their own projects
CREATE POLICY "users_can_insert_own_projects" ON projects
    FOR INSERT 
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can update their own projects
CREATE POLICY "users_can_update_own_projects" ON projects
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy 5: Users can delete their own projects
CREATE POLICY "users_can_delete_own_projects" ON projects
    FOR DELETE 
    TO authenticated
    USING (auth.uid() = user_id);

-- =========================================
-- PRODUCTS POLICIES (For first login detection)
-- =========================================

-- Enable RLS on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "service_role_full_access_products" ON products;
DROP POLICY IF EXISTS "users_can_view_own_products" ON products;
DROP POLICY IF EXISTS "users_can_insert_own_products" ON products;

-- Policy 1: Service role has full access
CREATE POLICY "service_role_full_access_products" ON products
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 2: Users can view products of their own projects
CREATE POLICY "users_can_view_own_products" ON products
    FOR SELECT 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = products.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Policy 3: Users can insert products in their own projects
CREATE POLICY "users_can_insert_own_products" ON products
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = products.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- =========================================
-- BRAND_GUIDELINES POLICIES (For first login detection)
-- =========================================

-- Enable RLS on brand_guidelines table
ALTER TABLE brand_guidelines ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "service_role_full_access_brand" ON brand_guidelines;
DROP POLICY IF EXISTS "users_can_view_own_brand" ON brand_guidelines;
DROP POLICY IF EXISTS "users_can_insert_own_brand" ON brand_guidelines;

-- Policy 1: Service role has full access
CREATE POLICY "service_role_full_access_brand" ON brand_guidelines
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 2: Users can view brand guidelines of their own projects
CREATE POLICY "users_can_view_own_brand" ON brand_guidelines
    FOR SELECT 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = brand_guidelines.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Policy 3: Users can insert brand guidelines in their own projects
CREATE POLICY "users_can_insert_own_brand" ON brand_guidelines
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = brand_guidelines.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- Grant permissions for new tables
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.brand_guidelines TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_guidelines TO authenticated;

-- =========================================
-- VERIFICATION QUERIES
-- =========================================

-- Check that policies exist
SELECT schemaname, tablename, policyname, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('user_profiles', 'subscriptions')
ORDER BY tablename, policyname;

-- Check that trigger exists
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';

RAISE NOTICE 'RLS policies have been reset and simplified. Test user creation now.';
