-- =========================================
-- ADD MISSING RLS POLICIES FOR PRODUCTS AND AVATARS
-- =========================================

-- Enable RLS on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Enable RLS on avatars table  
ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;

-- Enable RLS on brand_guidelines table
ALTER TABLE brand_guidelines ENABLE ROW LEVEL SECURITY;

-- Enable RLS on projects table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- =========================================
-- POLICIES FOR PRODUCTS TABLE
-- =========================================

-- Service role full access
CREATE POLICY "service_role_full_access_products" ON products
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can do everything
CREATE POLICY "authenticated_full_access_products" ON products
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Anonymous can insert (for triggers)
CREATE POLICY "allow_insert_products" ON products
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- =========================================
-- POLICIES FOR AVATARS TABLE
-- =========================================

-- Service role full access
CREATE POLICY "service_role_full_access_avatars" ON avatars
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can do everything
CREATE POLICY "authenticated_full_access_avatars" ON avatars
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Anonymous can insert (for triggers)
CREATE POLICY "allow_insert_avatars" ON avatars
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- =========================================
-- POLICIES FOR BRAND_GUIDELINES TABLE
-- =========================================

-- Service role full access
CREATE POLICY "service_role_full_access_brand_guidelines" ON brand_guidelines
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can do everything
CREATE POLICY "authenticated_full_access_brand_guidelines" ON brand_guidelines
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Anonymous can insert (for triggers)
CREATE POLICY "allow_insert_brand_guidelines" ON brand_guidelines
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- =========================================
-- POLICIES FOR PROJECTS TABLE
-- =========================================

-- Service role full access
CREATE POLICY "service_role_full_access_projects" ON projects
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can do everything
CREATE POLICY "authenticated_full_access_projects" ON projects
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Anonymous can insert (for triggers)
CREATE POLICY "allow_insert_projects" ON projects
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- =========================================
-- GRANT PERMISSIONS
-- =========================================

-- Grant table permissions
GRANT ALL ON products TO anon, authenticated, service_role;
GRANT ALL ON avatars TO anon, authenticated, service_role;
GRANT ALL ON brand_guidelines TO anon, authenticated, service_role;
GRANT ALL ON projects TO anon, authenticated, service_role;

-- Grant sequence permissions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

