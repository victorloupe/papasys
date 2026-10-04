-- ==============================================================================
-- iGUi SISTEMA DE ORÇAMENTOS - SCRIPT DE CRIAÇÃO E CARGA INICIAL (SEED)
-- Banco de Dados: PostgreSQL / Supabase
-- ==============================================================================

-- 1. CRIAÇÃO DAS TABELAS SE NÃO EXISTIREM
-- ------------------------------------------------------------------------------

-- Tabela de Usuários da Equipe e Permissões
CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', -- 'admin' ou 'user'
    allowed_divisions JSONB NOT NULL DEFAULT '["sob_medida"]'::jsonb,
    allowed_stages JSONB NOT NULL DEFAULT '["previa", "galga", "desenho_tecnico"]'::jsonb,
    avatar_color TEXT DEFAULT '#0284c7',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela Principal de Orçamentos
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    budget_code TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    division TEXT NOT NULL, -- 'sob_medida', 'incorporadora', 'internacional'
    stage TEXT NOT NULL,    -- 'previa', 'galga', 'desenho_tecnico'
    status TEXT NOT NULL DEFAULT 'em_aberto', -- 'em_aberto', 'em_analise', 'aprovado'
    assigned_user_id TEXT,
    assigned_user_name TEXT,
    total_base_cost NUMERIC(12, 2) DEFAULT 0.00,
    total_price NUMERIC(12, 2) DEFAULT 0.00,
    total_area_revestimento NUMERIC(10, 2) DEFAULT 0.00,
    total_area_laminacao NUMERIC(10, 2) DEFAULT 0.00,
    total_volume_m3 NUMERIC(10, 2) DEFAULT 0.00,
    total_volume_liters NUMERIC(12, 2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Modelos de Piscinas Vinculados ao Orçamento
CREATE TABLE IF NOT EXISTS budget_pools (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    units_count INTEGER NOT NULL DEFAULT 1,
    pool_type TEXT NOT NULL DEFAULT 'convencional', -- 'convencional' ou 'especial'
    structure_type TEXT NOT NULL DEFAULT 'nao_autoportante', -- 'nao_autoportante' ou 'autoportante'
    coating_type TEXT NOT NULL DEFAULT 'pastilha_15x15', -- 'pastilha_5x5', 'pastilha_7_5x7_5', 'pastilha_10x10', 'pastilha_15x15', 'porcelanato_villagres', 'personalizado'
    has_mold BOOLEAN DEFAULT false,
    mold_auto BOOLEAN DEFAULT true,
    internal_area_m2 NUMERIC(10, 2) DEFAULT 0.00,
    lamination_area_m2 NUMERIC(10, 2) DEFAULT 0.00,
    internal_volume_m3 NUMERIC(10, 2) DEFAULT 0.00,
    internal_volume_liters NUMERIC(12, 2) DEFAULT 0.00,
    linear_corners_m NUMERIC(10, 2) DEFAULT 0.00,
    alive_corners_count INTEGER DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Parâmetros de Precificação (Configurações Admin - Seção 9, 10 e 11)
CREATE TABLE IF NOT EXISTS system_pricing_configs (
    id TEXT PRIMARY KEY DEFAULT 'default_config',
    revestimentos_config JSONB DEFAULT '[
      {"id": "pastilha_5x5", "nome": "Pastilha 5x5 cm", "acabamento": "bp11_c3", "preco_sem_molde": 85.00, "preco_com_molde": 68.00},
      {"id": "pastilha_7_5x7_5", "nome": "Pastilha 7,5x7,5 cm", "acabamento": "boleada_7_5", "preco_sem_molde": 90.00, "preco_com_molde": 72.00},
      {"id": "pastilha_10x10", "nome": "Pastilha 10x10 cm", "acabamento": "bp11_c3", "preco_sem_molde": 85.00, "preco_com_molde": 68.00},
      {"id": "pastilha_15x15", "nome": "Pastilha 15x15 cm", "acabamento": "boleada_15", "preco_sem_molde": 98.00, "preco_com_molde": 78.00},
      {"id": "porcelanato_villagres", "nome": "Porcelanato Villagres", "acabamento": "personalizado", "preco_sem_molde": 120.00, "preco_com_molde": 98.00},
      {"id": "personalizado", "nome": "Revestimento Personalizado", "acabamento": "personalizado", "preco_sem_molde": 0.00, "preco_com_molde": 0.00}
    ]'::jsonb,
    acab_bp11 NUMERIC(10, 2) DEFAULT 18.50,
    acab_c3 NUMERIC(10, 2) DEFAULT 14.00,
    acab_boleada_7_5 NUMERIC(10, 2) DEFAULT 8.50,
    acab_boleada_15 NUMERIC(10, 2) DEFAULT 12.00,
    acab_quebra_canto NUMERIC(10, 2) DEFAULT 15.00,
    lamina_preco_m2 NUMERIC(10, 2) DEFAULT 95.00,
    min_units_mold INTEGER DEFAULT 10,
    acrescimo_autoportante_pct NUMERIC(5, 2) DEFAULT 50.00,
    margem_previa_pct NUMERIC(5, 2) DEFAULT 5.00,
    margem_galga_pct NUMERIC(5, 2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- 2. LIMPEZA PREVENTIVA PARA REINSERÇÃO LIMPA
-- ------------------------------------------------------------------------------
DELETE FROM budget_pools;
DELETE FROM budgets;
DELETE FROM app_users;
DELETE FROM system_pricing_configs;


-- 3. INSERÇÃO DOS USUÁRIOS DO SISTEMA (SEÇÃO 3)
-- ------------------------------------------------------------------------------
INSERT INTO app_users (id, name, email, role, allowed_divisions, allowed_stages, avatar_color, active)
VALUES 
(
    '77b65d92-3aa2-47a6-9dbb-033fd48f7b30',
    'Administrador (PapaSys)',
    'admin@papa.com',
    'admin',
    '["sob_medida", "incorporadora", "internacional"]'::jsonb,
    '["previa", "galga", "desenho_tecnico"]'::jsonb,
    '#0284c7',
    true
),
(
    'a0f528a8-ce32-4f4e-85b1-6c15612fda18',
    'Victor Lourenço',
    'usuario@papa.com',
    'user',
    '["sob_medida"]'::jsonb,
    '["previa", "galga", "desenho_tecnico"]'::jsonb,
    '#ea580c',
    true
),
(
    'b1f528a8-ce32-4f4e-85b1-6c15612fda19',
    'Engenharia Incorporadora',
    'incorporadora@papa.com',
    'user',
    '["incorporadora"]'::jsonb,
    '["previa", "galga", "desenho_tecnico"]'::jsonb,
    '#10b981',
    true
),
(
    'c2f528a8-ce32-4f4e-85b1-6c15612fda20',
    'Comercial Internacional',
    'internacional@papa.com',
    'user',
    '["internacional"]'::jsonb,
    '["previa", "galga", "desenho_tecnico"]'::jsonb,
    '#8b5cf6',
    true
);


-- 4. INSERÇÃO DOS PARÂMETROS DE PREÇO (CONFIGURAÇÃO DE FÁBRICA)
-- ------------------------------------------------------------------------------
INSERT INTO system_pricing_configs (id, min_units_mold, acrescimo_autoportante_pct, margem_previa_pct, margem_galga_pct, lamina_preco_m2)
VALUES ('default_config', 10, 50.00, 5.00, 0.00, 95.00);


-- 5. INSERÇÃO DE ORÇAMENTOS E PISCINAS REALISTAS
-- ------------------------------------------------------------------------------

-- ORÇAMENTO 1: SOB MEDIDA • PRÉVIA (1 piscina personalizada, pastilha 15x15, autoportante +50%, margem Prévia +5%)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0001-4000-8000-000000000001', 'ORC-2610-1001', 'Residencial Alphaville Mansão 42', 'Carlos Eduardo Silveira', 
    'sob_medida', 'previa', 'em_aberto', 
    'a0f528a8-ce32-4f4e-85b1-6c15612fda18', 'Victor Lourenço', 
    7620.00, 12001.50, 
    28.00, 38.99, 21.00, 21000.00, 
    'Piscina sob medida com prainha e spa integrado. Exportada via SketchUp 3D.', NOW() - INTERVAL '3 hours'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES (
    '22222222-0001-4000-8000-000000000001', '11111111-0001-4000-8000-000000000001', 'Piscina Infinity 7x3.5m com Prainha', 1, 
    'convencional', 'autoportante', 'pastilha_15x15', 
    false, true, 28.00, 38.99, 21.00, 21000.00, 24.50, 4
);


-- ORÇAMENTO 2: SOB MEDIDA • GALGA (PRÉ-VENDA) (1 piscina, pastilha 5x5, peças BP11 e C3)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0002-4000-8000-000000000002', 'ORC-2610-1002', 'Casa Jardim Paulistano', 'Dra. Mariana Vasconcelos', 
    'sob_medida', 'galga', 'em_analise', 
    'a0f528a8-ce32-4f4e-85b1-6c15612fda18', 'Victor Lourenço', 
    11050.00, 11050.00, 
    34.50, 42.00, 26.50, 26500.00, 
    'Quadro de galga técnica validado. Cantos lineares com cantoneiras BP11 e cantos vivos com C3.', NOW() - INTERVAL '1 day'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES (
    '22222222-0002-4000-8000-000000000002', '11111111-0002-4000-8000-000000000002', 'Piscina Retangular Prime 8x4m', 1, 
    'convencional', 'nao_autoportante', 'pastilha_5x5', 
    false, true, 34.50, 42.00, 26.50, 26500.00, 28.00, 4
);


-- ORÇAMENTO 3: SOB MEDIDA • DESENHO TÉCNICO (VENDA) (Executivo concluído no sistema)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0003-4000-8000-000000000003', 'ORC-2610-1003', 'Chácara Vale Verde', 'Eng. Roberto Mendonça', 
    'sob_medida', 'desenho_tecnico', 'aprovado', 
    'a0f528a8-ce32-4f4e-85b1-6c15612fda18', 'Victor Lourenço', 
    15820.00, 15820.00, 
    45.00, 56.00, 38.00, 38000.00, 
    'Venda aprovada com desenho técnico executivo validado (hidráulica, filtro Pro 50 e quadro elétrico DR).', NOW() - INTERVAL '2 days'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES (
    '22222222-0003-4000-8000-000000000003', '11111111-0003-4000-8000-000000000003', 'Piscina Acqua Resort 10x4.5m', 1, 
    'convencional', 'nao_autoportante', 'pastilha_10x10', 
    false, true, 45.00, 56.00, 38.00, 38000.00, 33.00, 4
);


-- ORÇAMENTO 4: INCORPORADORA • PRÉVIA (Múltiplos modelos, lote de 14 un ativa MOLDE para todo o orçamento)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0004-4000-8000-000000000004', 'ORC-2610-2001', 'Condomínio Residencial Terras do Sul (Etapa 1)', 'Cyrela Incorporações', 
    'incorporadora', 'previa', 'em_aberto', 
    'b1f528a8-ce32-4f4e-85b1-6c15612fda19', 'Engenharia Incorporadora', 
    92400.00, 97020.00, 
    360.00, 456.00, 240.00, 240000.00, 
    'Modelo B possui 14 unidades (>=10), ativando automaticamente o preço com molde (R$ 68/m² de laminação) para todas as piscinas do orçamento.', NOW() - INTERVAL '5 hours'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES 
(
    '22222222-0004-4000-8000-000000000004', '11111111-0004-4000-8000-000000000004', 'Modelo A - Compact Village 5x2.8m', 4, 
    'convencional', 'nao_autoportante', 'pastilha_15x15', 
    true, true, 18.00, 23.00, 12.00, 12000.00, 16.50, 4
),
(
    '22222222-0004-4000-8000-000000000005', '11111111-0004-4000-8000-000000000004', 'Modelo B - Standard Townhouse 6x3m', 14, 
    'convencional', 'nao_autoportante', 'pastilha_15x15', 
    true, true, 22.00, 28.00, 15.00, 15000.00, 19.00, 4
);


-- ORÇAMENTO 5: INCORPORADORA • GALGA (PRÉ-VENDA) (Villagres Porcelanato, 6 un sem molde)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0005-4000-8000-000000000005', 'ORC-2610-2002', 'Villas do Bosque Condomínio Fechado', 'MRV Engenharia', 
    'incorporadora', 'galga', 'em_analise', 
    'b1f528a8-ce32-4f4e-85b1-6c15612fda19', 'Engenharia Incorporadora', 
    58900.00, 58900.00, 
    168.00, 216.00, 114.00, 114000.00, 
    'Porcelanato Villagres selecionado. Metragens lineares levantadas e orçamento em processo de galga técnica.', NOW() - INTERVAL '1 day'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES (
    '22222222-0005-4000-8000-000000000006', '11111111-0005-4000-8000-000000000005', 'Modelo Riviera Villagres 7x3.2m', 6, 
    'convencional', 'nao_autoportante', 'porcelanato_villagres', 
    false, true, 28.00, 36.00, 19.00, 19000.00, 23.50, 4
);


-- ORÇAMENTO 6: INTERNACIONAL • PRÉVIA (Exportação América Latina, Pastilha 7.5x7.5 boleada, Autoportante)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0006-4000-8000-000000000006', 'ORC-2610-3001', 'Punta del Este Beach Club', 'Inversiones del Plata S.A.', 
    'internacional', 'previa', 'em_aberto', 
    'c2f528a8-ce32-4f4e-85b1-6c15612fda20', 'Comercial Internacional', 
    24300.00, 38272.50, 
    62.00, 78.00, 52.00, 52000.00, 
    'Projeto de exportação para o Uruguai. Estrutura autoportante reforçada para terreno arenoso (+50%) com margem de prévia (+5%).', NOW() - INTERVAL '4 hours'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES (
    '22222222-0006-4000-8000-000000000007', '11111111-0006-4000-8000-000000000006', 'Modelo Oceanic Export 12x4.5m', 1, 
    'convencional', 'autoportante', 'pastilha_7_5x7_5', 
    false, true, 62.00, 78.00, 52.00, 52000.00, 42.00, 4
);


-- ORÇAMENTO 7: INTERNACIONAL • DESENHO TÉCNICO (VENDA) (Exportação Miami/EUA)
INSERT INTO budgets (
    id, budget_code, project_name, client_name, division, stage, status, 
    assigned_user_id, assigned_user_name, total_base_cost, total_price, 
    total_area_revestimento, total_area_laminacao, total_volume_m3, total_volume_liters, 
    notes, created_at
) VALUES (
    '11111111-0007-4000-8000-000000000007', 'ORC-2610-3002', 'Biscayne Bay Residences #12', 'Miami Horizon LLC', 
    'internacional', 'desenho_tecnico', 'aprovado', 
    'c2f528a8-ce32-4f4e-85b1-6c15612fda20', 'Comercial Internacional', 
    18450.00, 18450.00, 
    48.00, 60.00, 40.00, 40000.00, 
    'Aprovado para exportação internacional. Memorial executivo completo e certificação de laminação estrutural.', NOW() - INTERVAL '3 days'
);

INSERT INTO budget_pools (
    id, budget_id, model_name, units_count, pool_type, structure_type, coating_type, 
    has_mold, mold_auto, internal_area_m2, lamination_area_m2, internal_volume_m3, 
    internal_volume_liters, linear_corners_m, alive_corners_count
) VALUES (
    '22222222-0007-4000-8000-000000000008', '11111111-0007-4000-8000-000000000007', 'Modelo Florida Dream 9x4m', 1, 
    'convencional', 'nao_autoportante', 'pastilha_10x10', 
    false, true, 48.00, 60.00, 40.00, 40000.00, 31.00, 4
);
