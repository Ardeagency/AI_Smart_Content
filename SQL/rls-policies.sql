-- =========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================

-- First, drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role full access" ON user_profiles;

-- Enable RLS on tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- =========================================
-- USER_PROFILES POLICIES
-- =========================================

-- Allow users to read their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own profile during signup
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow service role to bypass RLS for user_profiles (most important)
CREATE POLICY "Service role full access" ON user_profiles
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to insert during signup (for triggers)
CREATE POLICY "Allow signup inserts" ON user_profiles
    FOR INSERT WITH CHECK (true);

-- Allow system to insert profiles (for triggers and functions)
CREATE POLICY "System can insert profiles" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');

-- =========================================
-- SUBSCRIPTIONS POLICIES
-- =========================================

-- Allow users to read their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own subscription during signup
CREATE POLICY "Users can insert own subscription" ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own subscription
CREATE POLICY "Users can update own subscription" ON subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow service role to bypass RLS for subscriptions
CREATE POLICY "Service role full access subscriptions" ON subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to insert during signup (for triggers)
CREATE POLICY "Allow signup subscription inserts" ON subscriptions
    FOR INSERT WITH CHECK (true);

-- Allow system to insert subscriptions (for triggers and functions)
CREATE POLICY "System can insert subscriptions" ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');

-- =========================================
-- PAYMENTS POLICIES
-- =========================================

-- Allow users to read their own payments
CREATE POLICY "Users can view own payments" ON payments
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own payments
CREATE POLICY "Users can insert own payments" ON payments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow service role to bypass RLS for payments
CREATE POLICY "Service role full access payments" ON payments
    FOR ALL USING (current_setting('role') = 'service_role');

-- =========================================
-- PROJECTS POLICIES
-- =========================================

-- Allow users to read their own projects
CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

-- Allow users to insert their own projects
CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own projects
CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

-- Allow users to delete their own projects
CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- =========================================
-- FUNCTIONS FOR SIGNUP SUPPORT
-- =========================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
    -- Insert into user_profiles with data from auth metadata
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
    
    -- Also create initial subscription
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
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the user creation
        RAISE LOG 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =========================================
-- GRANT PERMISSIONS
-- =========================================

-- Grant usage on schema to authenticated and anon users
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant table permissions
GRANT ALL ON user_profiles TO anon, authenticated;
GRANT ALL ON subscriptions TO anon, authenticated;
GRANT ALL ON payments TO anon, authenticated;
GRANT ALL ON projects TO anon, authenticated;

-- Grant sequence permissions if any
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
