-- ==============================================================================
-- MIGRATION: RLS, AUTH & REALTIME (PAPASYS / iGUi)
-- Execute no SQL Editor do Supabase Dashboard
-- ==============================================================================

-- 1. Garante que app_users use o ID de auth.users
CREATE TABLE IF NOT EXISTS public.app_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    allowed_divisions JSONB NOT NULL DEFAULT '["sob_medida"]'::jsonb,
    allowed_stages JSONB NOT NULL DEFAULT '["previa", "galga", "desenho_tecnico"]'::jsonb,
    avatar_color TEXT DEFAULT '#f97316',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Garante coluna created_by na tabela budgets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'budgets' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.budgets ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Funções de Apoio RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.app_users
        WHERE id = auth.uid() AND role = 'admin' AND active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.user_allowed_divisions()
RETURNS jsonb AS $$
DECLARE
    divs jsonb;
BEGIN
    SELECT allowed_divisions INTO divs
    FROM public.app_users
    WHERE id = auth.uid() AND active = true;
    RETURN COALESCE(divs, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Trigger de Criação Automática de Perfil em app_users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.app_users (
        id,
        name,
        email,
        role,
        allowed_divisions,
        allowed_stages,
        avatar_color,
        active
    )
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email,
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        COALESCE((new.raw_user_meta_data->>'allowed_divisions')::jsonb, '["sob_medida"]'::jsonb),
        COALESCE((new.raw_user_meta_data->>'allowed_stages')::jsonb, '["previa", "galga", "desenho_tecnico"]'::jsonb),
        COALESCE(new.raw_user_meta_data->>'avatar_color', '#f97316'),
        COALESCE((new.raw_user_meta_data->>'active')::boolean, true)
    )
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, public.app_users.name),
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 5. Ativação de RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_technical_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plugin_releases ENABLE ROW LEVEL SECURITY;

-- 6. Políticas de RLS
-- app_users
DROP POLICY IF EXISTS "Allow authenticated read app_users" ON public.app_users;
CREATE POLICY "Allow authenticated read app_users" ON public.app_users
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin full access on app_users" ON public.app_users;
CREATE POLICY "Allow admin full access on app_users" ON public.app_users
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow user update self in app_users" ON public.app_users;
CREATE POLICY "Allow user update self in app_users" ON public.app_users
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- system_settings (Preços - Leitura por todos, edição por Admin)
DROP POLICY IF EXISTS "Allow authenticated read system_settings" ON public.system_settings;
CREATE POLICY "Allow authenticated read system_settings" ON public.system_settings
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow admin write system_settings" ON public.system_settings;
CREATE POLICY "Allow admin write system_settings" ON public.system_settings
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- budgets (Admin vê tudo / Usuário vê apenas seus orçamentos nas divisões permitidas)
DROP POLICY IF EXISTS "Budgets admin full access" ON public.budgets;
CREATE POLICY "Budgets admin full access" ON public.budgets
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Budgets user select own in allowed divisions" ON public.budgets;
CREATE POLICY "Budgets user select own in allowed divisions" ON public.budgets
    FOR SELECT TO authenticated
    USING (
        (created_by = auth.uid() OR assigned_user_id = auth.uid())
        AND (public.user_allowed_divisions() ? division)
    );

DROP POLICY IF EXISTS "Budgets user insert own in allowed divisions" ON public.budgets;
CREATE POLICY "Budgets user insert own in allowed divisions" ON public.budgets
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        AND (public.user_allowed_divisions() ? division)
    );

DROP POLICY IF EXISTS "Budgets user update own in allowed divisions" ON public.budgets;
CREATE POLICY "Budgets user update own in allowed divisions" ON public.budgets
    FOR UPDATE TO authenticated
    USING (
        (created_by = auth.uid() OR assigned_user_id = auth.uid())
        AND (public.user_allowed_divisions() ? division)
    )
    WITH CHECK (
        (created_by = auth.uid() OR assigned_user_id = auth.uid())
        AND (public.user_allowed_divisions() ? division)
    );

DROP POLICY IF EXISTS "Budgets user delete own" ON public.budgets;
CREATE POLICY "Budgets user delete own" ON public.budgets
    FOR DELETE TO authenticated
    USING (created_by = auth.uid());

-- budget_pools
DROP POLICY IF EXISTS "Budget pools admin full access" ON public.budget_pools;
CREATE POLICY "Budget pools admin full access" ON public.budget_pools
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Budget pools user access via budget" ON public.budget_pools;
CREATE POLICY "Budget pools user access via budget" ON public.budget_pools
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.budgets b
            WHERE b.id = budget_pools.budget_id
              AND (b.created_by = auth.uid() OR b.assigned_user_id = auth.uid() OR public.is_admin())
              AND (public.user_allowed_divisions() ? b.division OR public.is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.budgets b
            WHERE b.id = budget_pools.budget_id
              AND (b.created_by = auth.uid() OR b.assigned_user_id = auth.uid() OR public.is_admin())
              AND (public.user_allowed_divisions() ? b.division OR public.is_admin())
        )
    );

-- budget_technical_items
DROP POLICY IF EXISTS "Budget technical items access" ON public.budget_technical_items;
CREATE POLICY "Budget technical items access" ON public.budget_technical_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.budgets b
            WHERE b.id = budget_technical_items.budget_id
              AND (b.created_by = auth.uid() OR b.assigned_user_id = auth.uid() OR public.is_admin())
              AND (public.user_allowed_divisions() ? b.division OR public.is_admin())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.budgets b
            WHERE b.id = budget_technical_items.budget_id
              AND (b.created_by = auth.uid() OR b.assigned_user_id = auth.uid() OR public.is_admin())
              AND (public.user_allowed_divisions() ? b.division OR public.is_admin())
        )
    );

-- plugin_releases
DROP POLICY IF EXISTS "Plugin releases public read" ON public.plugin_releases;
CREATE POLICY "Plugin releases public read" ON public.plugin_releases
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Plugin releases admin write" ON public.plugin_releases;
CREATE POLICY "Plugin releases admin write" ON public.plugin_releases
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 7. Realtime na tabela budgets
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'budgets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.budgets;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- ==============================================================================
-- 8. CRIAÇÃO DOS USUÁRIOS PADRÃO EM auth.users (Senha padrão: 123456)
-- Permite login imediato no sistema web e plugin SketchUp
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    pwd_hash TEXT := crypt('123456', gen_salt('bf'));
    admin_id UUID := '77b65d92-3aa2-47a6-9dbb-033fd48f7b30';
    user_id UUID  := 'a0f528a8-ce32-4f4e-85b1-6c15612fda18';
    inc_id UUID   := 'b1f528a8-ce32-4f4e-85b1-6c15612fda19';
    int_id UUID   := 'c2f528a8-ce32-4f4e-85b1-6c15612fda20';
BEGIN
    -- 1. Administrador (Acesso Total)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
        'admin@papa.com', pwd_hash, now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Administrador (PapaSys)","role":"admin"}'::jsonb,
        now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE SET
        encrypted_password = pwd_hash,
        email_confirmed_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"name":"Administrador (PapaSys)","role":"admin"}'::jsonb,
        updated_at = now();

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (admin_id, admin_id, jsonb_build_object('sub', admin_id, 'email', 'admin@papa.com'), 'email', admin_id, now(), now(), now())
    ON CONFLICT DO NOTHING;

    -- 2. Victor Lourenço (Sob Medida)
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', user_id, 'authenticated', 'authenticated',
        'usuario@papa.com', pwd_hash, now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Victor Lourenço","role":"user","allowed_divisions":["sob_medida"]}'::jsonb,
        now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE SET
        encrypted_password = pwd_hash,
        email_confirmed_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"name":"Victor Lourenço","role":"user","allowed_divisions":["sob_medida"]}'::jsonb,
        updated_at = now();

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (user_id, user_id, jsonb_build_object('sub', user_id, 'email', 'usuario@papa.com'), 'email', user_id, now(), now(), now())
    ON CONFLICT DO NOTHING;

    -- 3. Engenharia Incorporadora
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', inc_id, 'authenticated', 'authenticated',
        'incorporadora@papa.com', pwd_hash, now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Engenharia Incorporadora","role":"user","allowed_divisions":["incorporadora"]}'::jsonb,
        now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE SET
        encrypted_password = pwd_hash,
        email_confirmed_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"name":"Engenharia Incorporadora","role":"user","allowed_divisions":["incorporadora"]}'::jsonb,
        updated_at = now();

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (inc_id, inc_id, jsonb_build_object('sub', inc_id, 'email', 'incorporadora@papa.com'), 'email', inc_id, now(), now(), now())
    ON CONFLICT DO NOTHING;

    -- 4. Comercial Internacional
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000', int_id, 'authenticated', 'authenticated',
        'internacional@papa.com', pwd_hash, now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"name":"Comercial Internacional","role":"user","allowed_divisions":["internacional"]}'::jsonb,
        now(), now(), '', '', '', ''
    )
    ON CONFLICT (id) DO UPDATE SET
        encrypted_password = pwd_hash,
        email_confirmed_at = now(),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        raw_user_meta_data = '{"name":"Comercial Internacional","role":"user","allowed_divisions":["internacional"]}'::jsonb,
        updated_at = now();

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (int_id, int_id, jsonb_build_object('sub', int_id, 'email', 'internacional@papa.com'), 'email', int_id, now(), now(), now())
    ON CONFLICT DO NOTHING;

    -- 5. Atualiza tabela public.app_users
    INSERT INTO public.app_users (id, name, email, role, allowed_divisions, allowed_stages, avatar_color, active)
    VALUES
        (admin_id, 'Administrador (PapaSys)', 'admin@papa.com', 'admin', '["sob_medida", "incorporadora", "internacional"]'::jsonb, '["previa", "galga", "desenho_tecnico"]'::jsonb, '#0284c7', true),
        (user_id, 'Victor Lourenço', 'usuario@papa.com', 'user', '["sob_medida"]'::jsonb, '["previa", "galga", "desenho_tecnico"]'::jsonb, '#ea580c', true),
        (inc_id, 'Engenharia Incorporadora', 'incorporadora@papa.com', 'user', '["incorporadora"]'::jsonb, '["previa", "galga", "desenho_tecnico"]'::jsonb, '#10b981', true),
        (int_id, 'Comercial Internacional', 'internacional@papa.com', 'user', '["internacional"]'::jsonb, '["previa", "galga", "desenho_tecnico"]'::jsonb, '#8b5cf6', true)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        allowed_divisions = EXCLUDED.allowed_divisions,
        allowed_stages = EXCLUDED.allowed_stages,
        avatar_color = EXCLUDED.avatar_color,
        active = EXCLUDED.active;

    -- 6. Atualiza orçamentos existentes para vincular created_by = assigned_user_id
    UPDATE public.budgets
    SET created_by = assigned_user_id
    WHERE created_by IS NULL AND assigned_user_id IS NOT NULL;

END $$;
