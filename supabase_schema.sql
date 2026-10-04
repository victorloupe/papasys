-- ==============================================================================
-- SCHEMA SUPABASE: SISTEMA DE ORÇAMENTOS iGUi + PLUGIN SKETCHUP
-- Divisões: iGUi Sob Medida | iGUi Incorporadora | iGUi Internacional
-- Fluxo por Páginas: Prévia -> Galga (pré-venda) -> Desenho Técnico (venda)
-- ==============================================================================

-- 1. TABELA DE USUÁRIOS E PERMISSÕES (Seção 3)
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    -- Divisões permitidas: 'sob_medida', 'incorporadora', 'internacional'
    allowed_divisions JSONB NOT NULL DEFAULT '["sob_medida"]'::jsonb,
    -- Páginas/etapas permitidas: 'previa', 'galga', 'desenho_tecnico'
    allowed_stages JSONB NOT NULL DEFAULT '["previa", "galga", "desenho_tecnico"]'::jsonb,
    avatar_color TEXT DEFAULT '#f97316',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA DE CONFIGURAÇÕES DE PREÇO E PARÂMETROS GERAIS (Seção 9)
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA PRINCIPAL DE ORÇAMENTOS (Seções 1, 2, 5)
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_code TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT 'Cliente Geral',
    project_name TEXT NOT NULL DEFAULT 'Novo Empreendimento',
    division TEXT NOT NULL CHECK (division IN ('sob_medida', 'incorporadora', 'internacional')),
    stage TEXT NOT NULL CHECK (stage IN ('previa', 'galga', 'desenho_tecnico')),
    status TEXT NOT NULL DEFAULT 'em_aberto' CHECK (status IN ('em_aberto', 'em_analise', 'aprovado', 'finalizado', 'arquivado')),
    assigned_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    assigned_user_name TEXT DEFAULT 'Não atribuído',
    total_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_base_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    total_area_revestimento NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_area_laminacao NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_volume_m3 NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_volume_liters NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA DE MODELOS DE PISCINAS DO ORÇAMENTO (Seções 5, 6, 7, 8, 10, 11)
CREATE TABLE IF NOT EXISTS budget_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    units_count INT NOT NULL DEFAULT 1 CHECK (units_count >= 1),
    pool_type TEXT NOT NULL DEFAULT 'convencional' CHECK (pool_type IN ('convencional', 'especial')),
    structure_type TEXT NOT NULL DEFAULT 'nao_autoportante' CHECK (structure_type IN ('autoportante', 'nao_autoportante')),
    coating_type TEXT NOT NULL CHECK (coating_type IN (
        'pastilha_5x5',
        'pastilha_7_5x7_5',
        'pastilha_10x10',
        'pastilha_15x15',
        'porcelanato_villagres',
        'personalizado'
    )),
    has_mold BOOLEAN NOT NULL DEFAULT false,
    mold_auto BOOLEAN NOT NULL DEFAULT true,
    
    -- Quantitativos obtidos do SketchUp (Seções 7 e 8)
    internal_area_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Área faces 'Revestimento'
    lamination_area_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Área faces 'Laminação'
    internal_volume_m3 NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    internal_volume_liters NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    linear_corners_m NUMERIC(10, 2) NOT NULL DEFAULT 0.00, -- Cantos lineares
    alive_corners_count INT NOT NULL DEFAULT 0, -- Quinas vivas
    
    -- Detalhamento das peças de acabamento calculadas (BP11, C3, boleadas, quebra-cantos)
    finishes_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_custom_coating BOOLEAN NOT NULL DEFAULT false,
    
    -- Dimensões da piscina
    pool_length_m NUMERIC(8, 2) DEFAULT 0.00,
    pool_width_m NUMERIC(8, 2) DEFAULT 0.00,
    pool_depth_m NUMERIC(8, 2) DEFAULT 0.00,
    
    -- Precificação unitária e total do modelo (Seção 11)
    unit_base_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_autoportante_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_stage_margin_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_final_value NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_model_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABELA DE ITENS EXTRAS / DOCUMENTAÇÃO TÉCNICA (Desenho Técnico - Venda)
CREATE TABLE IF NOT EXISTS budget_technical_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('equipamento', 'hidraulica', 'eletrica', 'acessorio', 'servico', 'desenho_doc')),
    title TEXT NOT NULL,
    description TEXT,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1.00,
    unit TEXT NOT NULL DEFAULT 'un',
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    technical_specs JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABELA DE ATUALIZAÇÕES DO PLUGIN SKETCHUP
CREATE TABLE IF NOT EXISTS plugin_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,
    download_url TEXT NOT NULL,
    changelog TEXT,
    mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- HABILITAR RLS COM ACESSO COMPLETO ANÔNIMO / APLICAÇÃO
-- ==============================================================================
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_technical_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read/write on app_users" ON app_users;
CREATE POLICY "Allow public read/write on app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on system_settings" ON system_settings;
CREATE POLICY "Allow public read/write on system_settings" ON system_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on budgets" ON budgets;
CREATE POLICY "Allow public read/write on budgets" ON budgets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on budget_pools" ON budget_pools;
CREATE POLICY "Allow public read/write on budget_pools" ON budget_pools FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on budget_technical_items" ON budget_technical_items;
CREATE POLICY "Allow public read/write on budget_technical_items" ON budget_technical_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read/write on plugin_releases" ON plugin_releases;
CREATE POLICY "Allow public read/write on plugin_releases" ON plugin_releases FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- INSERÇÃO DE DADOS PADRÃO (SEEDS)
-- ==============================================================================

-- 1. Usuários Padrão (Seção 3) - Vinculados aos UIDs do Supabase Auth
INSERT INTO app_users (id, name, email, role, allowed_divisions, allowed_stages, avatar_color)
VALUES
    (
        '77b65d92-3aa2-47a6-9dbb-033fd48f7b30'::uuid,
        'Administrador (PapaSys)',
        'admin@papa.com',
        'admin',
        '["sob_medida", "incorporadora", "internacional"]'::jsonb,
        '["previa", "galga", "desenho_tecnico"]'::jsonb,
        '#0284c7'
    ),
    (
        'a0f528a8-ce32-4f4e-85b1-6c15612fda18'::uuid,
        'Victor Lourenço',
        'usuario@papa.com',
        'user',
        '["sob_medida"]'::jsonb,
        '["previa", "galga", "desenho_tecnico"]'::jsonb,
        '#f97316'
    ),
    (
        '00000000-0000-0000-0000-000000000001'::uuid,
        'Administrador / Diretor',
        'diretoria@igui.com',
        'admin',
        '["sob_medida", "incorporadora", "internacional"]'::jsonb,
        '["previa", "galga", "desenho_tecnico"]'::jsonb,
        '#0284c7'
    ),
    (
        '00000000-0000-0000-0000-000000000002'::uuid,
        'Victor Lourenço (iGUi)',
        'victor@igui.com',
        'user',
        '["sob_medida"]'::jsonb,
        '["previa", "galga", "desenho_tecnico"]'::jsonb,
        '#f97316'
    )
ON CONFLICT (email) DO UPDATE SET
    id = EXCLUDED.id,
    allowed_divisions = EXCLUDED.allowed_divisions,
    allowed_stages = EXCLUDED.allowed_stages,
    role = EXCLUDED.role,
    name = EXCLUDED.name;

-- 2. Configurações de Preço e Parâmetros (Seção 9 e Seção 11)
INSERT INTO system_settings (key, value, description)
VALUES
    (
        'precos_revestimento',
        '{
            "pastilha_5x5": 85.00,
            "pastilha_7_5x7_5": 90.00,
            "pastilha_10x10": 85.00,
            "pastilha_15x15": 98.00,
            "porcelanato_villagres": 120.00,
            "personalizado": 0.00
        }'::jsonb,
        'Preço do m² de cada tipo de revestimento'
    ),
    (
        'precos_acabamento',
        '{
            "bp11": 18.50,
            "c3": 14.00,
            "boleada_7_5": 8.50,
            "boleada_15": 12.00,
            "quebra_canto": 15.00
        }'::jsonb,
        'Preço unitário de cada peça de acabamento de cantos e quinas'
    ),
    (
        'precos_laminacao',
        '{
            "sem_molde": 110.00,
            "com_molde": 80.00
        }'::jsonb,
        'Preço do m² de laminação (com molde e sem molde)'
    ),
    (
        'regras_precificacao',
        '{
            "min_unidades_molde": 10,
            "acrescimo_autoportante_pct": 50.0,
            "margem_previa_pct": 5.0,
            "margem_galga_pct": 0.0,
            "margem_desenho_tecnico_pct": 0.0
        }'::jsonb,
        'Percentuais de acréscimo autoportante, margens de etapa e gatilho de molde'
    )
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description;

-- 3. Release do Plugin SketchUp
INSERT INTO plugin_releases (version, download_url, changelog, mandatory)
VALUES
    ('2.0.0', 'plugin/papasys_paginacao.rbz', 'Reestruturação iGUi: Login de usuários, 3 divisões independentes, etapas Prévia/Galga, detecção de cantos BP11/C3 e boleadas, materiais Revestimento/Laminação e cálculo de volume.', false)
ON CONFLICT (version) DO NOTHING;
