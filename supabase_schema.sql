-- ==============================================================================
-- SCHEMA SUPABASE: PAPASYS
-- Sistema de Paginação Inteligente e Orçamento de Piscinas
-- ==============================================================================

-- 1. Tabela de Preços Unitários e Insumos Padrão
CREATE TABLE IF NOT EXISTS price_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN ('material', 'insumo', 'borda', 'mao_de_obra', 'servico')),
    name TEXT NOT NULL,
    unit TEXT NOT NULL, -- 'm²', 'm', 'saco 20kg', 'balde 5kg', 'un'
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    default_waste_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    coverage_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 1.00, -- Ex: 1 saco cobre 4 m²
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Projetos / Orçamentos recebidos do SketchUp
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    client_name TEXT DEFAULT 'Cliente Geral',
    tile_spec TEXT DEFAULT '15x15',
    tile_width_cm NUMERIC(8, 2) DEFAULT 15.00,
    tile_height_cm NUMERIC(8, 2) DEFAULT 15.00,
    grout_cm NUMERIC(8, 2) DEFAULT 0.20,
    internal_area_m2 NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    border_perimeter_linear_m NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    pool_length_m NUMERIC(8, 2) DEFAULT 0.00,
    pool_width_m NUMERIC(8, 2) DEFAULT 0.00,
    pool_depth_m NUMERIC(8, 2) DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_analise', 'enviado', 'aprovado', 'rejeitado')),
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    margin_percent NUMERIC(5, 2) NOT NULL DEFAULT 25.00,
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    plugin_version TEXT DEFAULT '1.0.0',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Itens Analíticos do Orçamento do Projeto
CREATE TABLE IF NOT EXISTS project_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('material', 'insumo', 'borda', 'mao_de_obra', 'extra')),
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    waste_percent NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Versões e Atualizações do Plugin SketchUp (.rbz)
CREATE TABLE IF NOT EXISTS plugin_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,
    download_url TEXT NOT NULL,
    changelog TEXT,
    mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilita Políticas RLS (Row Level Security) liberadas para acesso anônimo/autenticado da aplicação
ALTER TABLE price_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write on price_table" ON price_table FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on project_items" ON project_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write on plugin_releases" ON plugin_releases FOR ALL USING (true) WITH CHECK (true);

-- Inserção de Preços Padrão Iniciais (Seeds)
INSERT INTO price_table (category, name, unit, unit_cost, default_waste_percent, coverage_per_unit)
VALUES
    ('material', 'Pastilha de Porcelana Especial Piscina 10x10 cm', 'm²', 85.00, 5.0, 1.0),
    ('material', 'Pastilha Cerâmica Esmaltada 15x15 cm', 'm²', 98.00, 5.0, 1.0),
    ('material', 'Porcelanato Bold 20x20 cm', 'm²', 78.00, 7.0, 1.0),
    ('insumo', 'Argamassa Colante AC-III Piscina (Saco 20kg)', 'saco 20kg', 42.00, 5.0, 4.0),
    ('insumo', 'Rejunte Especial para Piscina (Balde 5kg)', 'balde 5kg', 68.00, 5.0, 10.0),
    ('borda', 'Pedra Atérmica Boleada para Borda', 'm', 130.00, 3.0, 1.0),
    ('mao_de_obra', 'Mão de Obra de Assentamento de Revestimento', 'm²', 75.00, 0.0, 1.0),
    ('mao_de_obra', 'Mão de Obra de Assentamento de Borda Atérmica', 'm', 45.00, 0.0, 1.0),
    ('mao_de_obra', 'Impermeabilização e Regularização Técnica', 'm²', 55.00, 0.0, 1.0)
ON CONFLICT DO NOTHING;

-- Registro da Versão Inicial do Plugin PapaSys para Auto-Update
INSERT INTO plugin_releases (version, download_url, changelog, mandatory)
VALUES
    ('1.0.0', 'plugin/papasys_paginacao.rbz', 'Versão inicial PapaSys: snap de centro sem recortes, cálculo de m² e borda linear, e auto-atualização integrada.', false)
ON CONFLICT (version) DO NOTHING;
