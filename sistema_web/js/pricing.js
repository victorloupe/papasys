// ==============================================================================
// MOTOR DE PRECIFICAÇÃO E REGRAS FINANCEIRAS iGUi (SEÇÕES 7, 9, 10, 11)
// ==============================================================================

const PricingEngine = {
  STORAGE_KEY_SETTINGS: "igui_pricing_settings",

  // Configurações e preços padrão do sistema (Seção 9)
  DEFAULT_SETTINGS: {
    // Lista de Revestimentos / Pastilhas com preços Sem Molde e Com Molde
    revestimentos: [
      { id: "pastilha_5x5", nome: "Pastilha 5x5 cm", acabamento: "bp11_c3", preco_sem_molde: 85.00, preco_com_molde: 68.00, is_default: true },
      { id: "pastilha_7_5x7_5", nome: "Pastilha 7,5x7,5 cm", acabamento: "boleada_7_5", preco_sem_molde: 90.00, preco_com_molde: 72.00, is_default: true },
      { id: "pastilha_10x10", nome: "Pastilha 10x10 cm", acabamento: "bp11_c3", preco_sem_molde: 85.00, preco_com_molde: 68.00, is_default: true },
      { id: "pastilha_15x15", nome: "Pastilha 15x15 cm", acabamento: "boleada_15", preco_sem_molde: 98.00, preco_com_molde: 78.00, is_default: true },
      { id: "porcelanato_villagres", nome: "Porcelanato Villagres", acabamento: "personalizado", preco_sem_molde: 120.00, preco_com_molde: 98.00, is_default: true },
      { id: "personalizado", nome: "Revestimento Personalizado", acabamento: "personalizado", preco_sem_molde: 0.00, preco_com_molde: 0.00, is_default: true }
    ],
    // Mapa de compatibilidade retroativa
    revestimento: {
      pastilha_5x5: 85.00,
      pastilha_7_5x7_5: 90.00,
      pastilha_10x10: 85.00,
      pastilha_15x15: 98.00,
      porcelanato_villagres: 120.00,
      personalizado: 0.00
    },
    // Preço de cada peça de acabamento
    acabamento: {
      bp11: 18.50,           // Cantoneira BP11 (20 cm cada)
      c3: 14.00,             // Peça C3 por quina viva
      boleada_7_5: 8.50,     // Pastilha boleada reta 7,5x7,5 cm
      boleada_15: 12.00,     // Pastilha boleada reta 15x15 cm
      quebra_canto: 15.00    // Peça quebra-canto por quina viva
    },
    // Preço do m² de laminação (preço único, o benefício de molde incide na pastilha)
    laminacao: {
      preco_m2: 95.00,
      sem_molde: 95.00,
      com_molde: 95.00
    },
    // Insumos básicos complementares
    insumos: {
      argamassa_m2: 10.50,   // AC-III especial piscina
      rejunte_m2: 6.80       // Rejunte especial
    },
    // Parâmetros de precificação (Seções 9, 10, 11)
    regras: {
      min_unidades_molde: 10,           // Quantidade mínima de unidades para virar molde (padrão: 10)
      acrescimo_autoportante_pct: 50.0, // Acréscimo para piscina autoportante (padrão: +50%)
      margem_previa_pct: 5.0,           // Margem da etapa Prévia (padrão: +5%)
      margem_galga_pct: 0.0,            // Margem da etapa Galga (padrão: 0%)
      margem_desenho_tecnico_pct: 0.0   // Margem da etapa Desenho Técnico (padrão: 0%)
    }
  },

  // 1. Obter configurações de preço ativas
  getSettings() {
    try {
      const stored = localStorage.getItem(PricingEngine.STORAGE_KEY_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        
        // Garante que a lista de revestimentos existe e possui valores com molde e sem molde
        let listRevest = parsed.revestimentos;
        if (!Array.isArray(listRevest) || listRevest.length === 0) {
          listRevest = PricingEngine.DEFAULT_SETTINGS.revestimentos.map(def => {
            const oldVal = (parsed.revestimento && parsed.revestimento[def.id]) ? parsed.revestimento[def.id] : def.preco_sem_molde;
            return {
              ...def,
              preco_sem_molde: oldVal,
              preco_com_molde: def.preco_com_molde || (oldVal * 0.8)
            };
          });
        }

        const lamPreco = parsed.laminacao ? (parsed.laminacao.preco_m2 || parsed.laminacao.sem_molde || 95.00) : 95.00;

        return {
          revestimentos: listRevest,
          revestimento: { ...PricingEngine.DEFAULT_SETTINGS.revestimento, ...(parsed.revestimento || {}) },
          acabamento: { ...PricingEngine.DEFAULT_SETTINGS.acabamento, ...(parsed.acabamento || {}) },
          laminacao: {
            preco_m2: lamPreco,
            sem_molde: lamPreco,
            com_molde: lamPreco
          },
          insumos: { ...PricingEngine.DEFAULT_SETTINGS.insumos, ...(parsed.insumos || {}) },
          regras: { ...PricingEngine.DEFAULT_SETTINGS.regras, ...(parsed.regras || {}) }
        };
      }
    } catch (e) {
      console.warn("[Pricing] Erro ao carregar configurações de preços:", e);
    }
    return JSON.parse(JSON.stringify(PricingEngine.DEFAULT_SETTINGS));
  },

  // 2. Salvar configurações de preço (Somente Admin - Seção 9)
  saveSettings(newSettings) {
    if (!Auth.isAdmin()) {
      alert("Apenas administradores podem alterar as configurações de preços do sistema!");
      return false;
    }
    try {
      localStorage.setItem(PricingEngine.STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
      window.dispatchEvent(new CustomEvent("igui-pricing-updated", { detail: newSettings }));
      
      // Sincroniza em background com Supabase system_pricing_configs
      PricingEngine.syncSettingsToSupabase(newSettings);
      return true;
    } catch (e) {
      console.error("[Pricing] Falha ao salvar configurações:", e);
      return false;
    }
  },

  // 2.1 Helpers para Gerenciar Revestimentos / Pastilhas
  getCoatingsList() {
    const s = PricingEngine.getSettings();
    return s.revestimentos || PricingEngine.DEFAULT_SETTINGS.revestimentos;
  },

  getCoatingInfo(coatingId) {
    const list = PricingEngine.getCoatingsList();
    const id = (coatingId || "pastilha_15x15").toLowerCase();
    const found = list.find(c => c.id.toLowerCase() === id);
    if (found) return found;

    return {
      id: id,
      nome: coatingId || "Personalizado",
      acabamento: "personalizado",
      preco_sem_molde: 98.00,
      preco_com_molde: 78.00,
      is_custom: true
    };
  },

  addCoating(novoRevestimento) {
    const settings = PricingEngine.getSettings();
    if (!settings.revestimentos) settings.revestimentos = [...PricingEngine.DEFAULT_SETTINGS.revestimentos];

    // Cria id slug único
    const slug = (novoRevestimento.id || novoRevestimento.nome.toLowerCase().replace(/[^a-z0-9]/g, '_')).trim();
    const exists = settings.revestimentos.findIndex(c => c.id === slug);

    const item = {
      id: slug,
      nome: novoRevestimento.nome.trim(),
      acabamento: novoRevestimento.acabamento || "personalizado",
      preco_sem_molde: parseFloat(novoRevestimento.preco_sem_molde) || 0.0,
      preco_com_molde: parseFloat(novoRevestimento.preco_com_molde) || 0.0,
      is_custom: true
    };

    if (exists >= 0) {
      settings.revestimentos[exists] = item;
    } else {
      settings.revestimentos.push(item);
    }

    // Atualiza compatibilidade retroativa
    if (!settings.revestimento) settings.revestimento = {};
    settings.revestimento[slug] = item.preco_sem_molde;

    return PricingEngine.saveSettings(settings);
  },

  removeCoating(coatingId) {
    const settings = PricingEngine.getSettings();
    if (!settings.revestimentos) return false;

    settings.revestimentos = settings.revestimentos.filter(c => c.id !== coatingId || c.is_default);
    if (settings.revestimento) delete settings.revestimento[coatingId];

    return PricingEngine.saveSettings(settings);
  },

  // 3. Cálculo de Peças de Acabamento da Piscina (Seção 7)
  calcularAcabamentosPiscina(revestimento, cantosLinearesM, quinasVivasCount) {
    const rev = (revestimento || "pastilha_15x15").toLowerCase();
    const cantosCm = (parseFloat(cantosLinearesM) || 0) * 100.0;
    const quinas = parseInt(quinasVivasCount) || 0;
    const settings = PricingEngine.getSettings();
    const info = PricingEngine.getCoatingInfo(rev);
    const regra = info.acabamento || "personalizado";

    // Seção 7: Porcelanato Villagres ou Personalizado
    if (regra === "personalizado" || rev === "porcelanato_villagres" || rev === "personalizado") {
      return {
        tipo_regra: "personalizado",
        is_custom: true,
        peca_linear: { nome: "Cantos Lineares informados", qtd: (cantosCm / 100).toFixed(2), unit: "m", unit_price: 0, total_price: 0 },
        peca_quina: { nome: "Quinas Vivas informadas", qtd: quinas, unit: "un", unit_price: 0, total_price: 0 },
        total_acabamento: 0.00,
        observacao: "Revestimento personalizado – definido posteriormente pelo cliente"
      };
    }

    // Seção 7: Pastilha 5x5 ou 10x10 -> Cantoneira BP11 (20 cm cada) e Peça C3
    if (regra === "bp11_c3" || rev === "pastilha_5x5" || rev === "pastilha_10x10") {
      const qtdBp11 = Math.ceil(cantosCm / 20.0);
      const qtdC3 = quinas * 1;
      const precoBp11 = settings.acabamento.bp11;
      const precoC3 = settings.acabamento.c3;
      const totBp11 = qtdBp11 * precoBp11;
      const totC3 = qtdC3 * precoC3;

      return {
        tipo_regra: "bp11_c3",
        is_custom: false,
        peca_linear: { nome: "Cantoneira BP11 (20 cm)", qtd: qtdBp11, unit: "un", unit_price: precoBp11, total_price: totBp11 },
        peca_quina: { nome: "Peça C3 (quina viva)", qtd: qtdC3, unit: "un", unit_price: precoC3, total_price: totC3 },
        total_acabamento: totBp11 + totC3,
        observacao: `${qtdBp11} un BP11 + ${qtdC3} un C3`
      };
    }

    // Seção 7: Pastilha 7,5x7,5 -> Boleada reta 7,5 cm e Quebra-canto
    if (regra === "boleada_7_5" || rev === "pastilha_7_5x7_5") {
      const qtdBoleada = Math.ceil(cantosCm / 7.5);
      const qtdQuebra = quinas * 1;
      const precoBoleada = settings.acabamento.boleada_7_5;
      const precoQuebra = settings.acabamento.quebra_canto;
      const totBoleada = qtdBoleada * precoBoleada;
      const totQuebra = qtdQuebra * precoQuebra;

      return {
        tipo_regra: "boleada_7_5",
        is_custom: false,
        peca_linear: { nome: "Pastilha Boleada Reta 7,5x7,5 cm", qtd: qtdBoleada, unit: "un", unit_price: precoBoleada, total_price: totBoleada },
        peca_quina: { nome: "Peça Quebra-canto (quina viva)", qtd: qtdQuebra, unit: "un", unit_price: precoQuebra, total_price: totQuebra },
        total_acabamento: totBoleada + totQuebra,
        observacao: `${qtdBoleada} un Boleada 7,5 + ${qtdQuebra} un Quebra-canto`
      };
    }

    // Seção 7: Pastilha 15x15 -> Boleada reta 15 cm e Quebra-canto
    if (regra === "boleada_15" || rev === "pastilha_15x15") {
      const qtdBoleada = Math.ceil(cantosCm / 15.0);
      const qtdQuebra = quinas * 1;
      const precoBoleada = settings.acabamento.boleada_15;
      const precoQuebra = settings.acabamento.quebra_canto;
      const totBoleada = qtdBoleada * precoBoleada;
      const totQuebra = qtdQuebra * precoQuebra;

      return {
        tipo_regra: "boleada_15",
        is_custom: false,
        peca_linear: { nome: "Pastilha Boleada Reta 15x15 cm", qtd: qtdBoleada, unit: "un", unit_price: precoBoleada, total_price: totBoleada },
        peca_quina: { nome: "Peça Quebra-canto (quina viva)", qtd: qtdQuebra, unit: "un", unit_price: precoQuebra, total_price: totQuebra },
        total_acabamento: totBoleada + totQuebra,
        observacao: `${qtdBoleada} un Boleada 15 + ${qtdQuebra} un Quebra-canto`
      };
    }

    // Fallback genérico
    const qtdBp11 = Math.ceil(cantosCm / 20.0);
    return {
      tipo_regra: "bp11_c3",
      is_custom: false,
      peca_linear: { nome: "Cantoneira BP11", qtd: qtdBp11, unit: "un", unit_price: settings.acabamento.bp11, total_price: qtdBp11 * settings.acabamento.bp11 },
      peca_quina: { nome: "Peça C3", qtd: quinas, unit: "un", unit_price: settings.acabamento.c3, total_price: quinas * settings.acabamento.c3 },
      total_acabamento: (qtdBp11 * settings.acabamento.bp11) + (quinas * settings.acabamento.c3),
      observacao: `${qtdBp11} un BP11 + ${quinas} un C3`
    };
  },

  // 4. Cálculo Completo de uma Piscina / Modelo (Seções 10 e 11)
  calcularModeloPiscina(pool, etapa, division, budgetAllPools = []) {
    const settings = PricingEngine.getSettings();

    const areaRevest = Math.max(0, parseFloat(pool.internal_area_m2) || 0);
    const areaLamina = Math.max(0, parseFloat(pool.lamination_area_m2) || 0);
    const cantosLinearesM = Math.max(0, parseFloat(pool.linear_corners_m) || 0);
    const quinasVivasCount = Math.max(0, parseInt(pool.alive_corners_count) || 0);
    const unidades = Math.max(1, parseInt(pool.units_count) || 1);

    const coatingType = pool.coating_type || "pastilha_15x15";
    const structureType = pool.structure_type || "nao_autoportante";
    const currentStage = (etapa || "previa").toLowerCase();

    // ==============================================================================
    // SEÇÃO 10.2: REGRA PREÇO COM MOLDE × SEM MOLDE (INCORPORADORA)
    // "Quando algum modelo do orçamento tiver 10 ou mais unidades (configurável no admin),
    // ele vira molde e todas as piscinas daquele orçamento recebem o preço COM MOLDE da pastilha."
    // ==============================================================================
    let hasMold = !!pool.has_mold;
    const isIncorporadora = division === "incorporadora";

    if (isIncorporadora) {
      const minMolde = settings.regras.min_unidades_molde || 10;
      // Verifica se o modelo atual OU qualquer outro modelo do orçamento tem >= 10 unidades
      const anyPoolHasMinUnits = [pool, ...(budgetAllPools || [])].some(p => (parseInt(p.units_count) || 0) >= minMolde);

      if (pool.mold_auto !== false) {
        // Se ainda não houve override manual explícito, aplica a regra automática
        hasMold = anyPoolHasMinUnits;
      }
    }

    // ==============================================================================
    // SEÇÃO 11: ORDEM DE CÁLCULO EXATA
    // 1. Valor base (revestimento com ou sem molde + acabamentos + laminação)
    // 2. + acréscimo de autoportante (se aplicável)
    // 3. + margem da etapa (Prévia ou Galga)
    // ==============================================================================

    // 1.1 Custo de Revestimento (O PREÇO DA PASTILHA MUDA SE FOR COM MOLDE OU SEM MOLDE)
    const coatingInfo = PricingEngine.getCoatingInfo(coatingType);
    const precoM2Rev = hasMold ? (coatingInfo.preco_com_molde !== undefined ? coatingInfo.preco_com_molde : coatingInfo.preco_sem_molde) : coatingInfo.preco_sem_molde;
    const custoRevestimento = parseFloat((areaRevest * precoM2Rev).toFixed(2));

    // 1.2 Custo de Acabamentos (BP11, C3, Boleadas, Quebra-cantos)
    const acabamentosCalc = PricingEngine.calcularAcabamentosPiscina(coatingType, cantosLinearesM, quinasVivasCount);
    const custoAcabamentos = parseFloat((acabamentosCalc.total_acabamento).toFixed(2));

    // 1.3 Custo de Laminação (preço fixo da laminação, sem distinção de molde na laminação)
    const precoM2Lamina = settings.laminacao.preco_m2 !== undefined ? settings.laminacao.preco_m2 : (settings.laminacao.sem_molde || 95.00);
    const custoLaminacao = parseFloat((areaLamina * precoM2Lamina).toFixed(2));

    // 1.4 Insumos de assentamento
    const custoInsumos = parseFloat((areaRevest * ((settings.insumos.argamassa_m2 || 10.50) + (settings.insumos.rejunte_m2 || 6.80))).toFixed(2));

    // 1. VALOR BASE UNITÁRIO
    const valorBaseUnitario = parseFloat((custoRevestimento + custoAcabamentos + custoLaminacao + custoInsumos).toFixed(2));

    // 2. + ACRÉSCIMO DE AUTOPORTANTE (+50% padrão se autoportante)
    const isAutoportante = structureType === "autoportante";
    const pctAutoportante = isAutoportante ? (settings.regras.acrescimo_autoportante_pct || 50.0) : 0.0;
    const acrescimoAutoportanteUnit = parseFloat((valorBaseUnitario * (pctAutoportante / 100.0)).toFixed(2));
    const valorComAutoportante = parseFloat((valorBaseUnitario + acrescimoAutoportanteUnit).toFixed(2));

    // 3. + MARGEM DA ETAPA (Prévia +5%, Galga 0%, Desenho Técnico 0%)
    let pctMargemEtapa = 0.0;
    if (currentStage === "previa") {
      pctMargemEtapa = settings.regras.margem_previa_pct || 5.0;
    } else if (currentStage === "galga") {
      pctMargemEtapa = settings.regras.margem_galga_pct || 0.0;
    } else if (currentStage === "desenho_tecnico") {
      pctMargemEtapa = settings.regras.margem_desenho_tecnico_pct || 0.0;
    }

    const margemEtapaUnit = parseFloat((valorComAutoportante * (pctMargemEtapa / 100.0)).toFixed(2));
    const precoFinalUnitario = parseFloat((valorComAutoportante + margemEtapaUnit).toFixed(2));
    const precoTotalModelo = parseFloat((precoFinalUnitario * unidades).toFixed(2));

    return {
      has_mold: hasMold,
      coating_info: coatingInfo,
      coating_name: coatingInfo.nome || (coatingType ? coatingType.replace(/_/g, ' ') : 'Pastilha 15x15'),
      area_revestimento: areaRevest.toFixed(2),
      area_laminacao: areaLamina.toFixed(2),
      volume_m3: (parseFloat(pool.internal_volume_m3) || 0).toFixed(2),
      preco_m2_revestimento: precoM2Rev,
      custo_revestimento: custoRevestimento,
      custo_acabamentos: custoAcabamentos,
      custo_laminacao: custoLaminacao,
      custo_insumos: custoInsumos,
      valor_base_unitario: valorBaseUnitario,
      acrescimo_autoportante_unit: acrescimoAutoportanteUnit,
      valor_com_autoportante: valorComAutoportante,
      pct_margem_etapa: pctMargemEtapa,
      margem_etapa_unit: margemEtapaUnit,
      preco_final_unitario: precoFinalUnitario,
      preco_total_modelo: precoTotalModelo,
      unidades: unidades,
      finishes_details: acabamentosCalc
    };
  },

  // 5. Cálculo Consolidado de todo o Orçamento
  calcularOrcamentoCompleto(budget, pools = []) {
    let totalBaseCost = 0.0;
    let totalPrice = 0.0;
    let totalAreaRevest = 0.0;
    let totalAreaLamina = 0.0;
    let totalVolumeM3 = 0.0;
    let totalVolumeLitros = 0.0;

    const poolsCalculados = pools.map(p => {
      const calc = PricingEngine.calcularModeloPiscina(p, budget.stage, budget.division, pools);
      
      const un = calc.unidades;
      totalBaseCost += (calc.valor_base_unitario * un);
      totalPrice += calc.preco_total_modelo;

      totalAreaRevest += (parseFloat(p.internal_area_m2) || 0) * un;
      totalAreaLamina += (parseFloat(p.lamination_area_m2) || 0) * un;
      totalVolumeM3 += (parseFloat(p.internal_volume_m3) || 0) * un;
      totalVolumeLitros += (parseFloat(p.internal_volume_liters) || 0) * un;

      return {
        ...p,
        has_mold: calc.has_mold,
        calc: calc
      };
    });

    return {
      total_base_cost: parseFloat(totalBaseCost.toFixed(2)),
      total_price: parseFloat(totalPrice.toFixed(2)),
      total_area_revestimento: parseFloat(totalAreaRevest.toFixed(2)),
      total_area_laminacao: parseFloat(totalAreaLamina.toFixed(2)),
      total_volume_m3: parseFloat(totalVolumeM3.toFixed(2)),
      total_volume_liters: parseFloat(totalVolumeLitros.toFixed(2)),
      pools: poolsCalculados
    };
  },

  // Sincronização Supabase
  async syncSettingsToSupabase(settings) {
    if (typeof DB !== "undefined" && DB.getClient()) {
      try {
        const client = DB.getClient();
        await client.from("system_pricing_configs").upsert({
          id: "default_config",
          min_units_mold: settings.regras.min_unidades_molde,
          acrescimo_autoportante_pct: settings.regras.acrescimo_autoportante_pct,
          margem_previa_pct: settings.regras.margem_previa_pct,
          margem_galga_pct: settings.regras.margem_galga_pct,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        // Silencioso se offline
      }
    }
  },

  formatBRL(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
};
