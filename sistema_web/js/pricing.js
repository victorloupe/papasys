// ==============================================================================
// MOTOR DE PRECIFICAÇÃO E REGRAS FINANCEIRAS iGUi (SEÇÃO 9)
// Cálculo Base: Área de Revestimento (m²) × Preço do m²
// ==============================================================================

const PricingEngine = {
  STORAGE_KEY_SETTINGS: "igui_pricing_settings_v9",

  // Configurações padrão do sistema conforme Seção 9
  DEFAULT_SETTINGS: {
    // 9.1 & 9.5: Preço do m² por divisão e tipo de piscina (Convencional / Especial)
    m2_prices: {
      sob_medida: {
        convencional: 140.00,
        especial: 175.00
      },
      incorporadora: {
        convencional: 120.00,
        especial: 150.00
      },
      internacional: {
        convencional: 150.00,
        especial: 185.00
      }
    },
    // 9.2 & 9.5: Regra de Molde (Incorporadora)
    molde: {
      preco_m2_convencional: 100.00, // Preço do m² com molde (Convencional ≥ 10 un)
      preco_m2_especial: 130.00,     // Preço do m² com molde (Especial ≥ 10 un)
      desconto_m2: 20.00,            // Retrocompatibilidade
      min_unidades: 10               // Gatilho de unidades no orçamento (padrão: 10)
    },
    // 9.3 & 9.5: Regras de Acréscimo
    acrescimos: {
      autoportante_pct: 50.0,    // +50% sobre o valor da piscina
      etapas: {
        previa: 5.0,             // +5%
        galga: 0.0,              // 0%
        desenho_tecnico: 0.0     // 0%
      }
    },
    // Revestimentos mantidos para seleção visual e regras técnicas de acabamento (informativo)
    revestimentos: [
      { id: "pastilha_5x5", nome: "Pastilha 5x5 cm", acabamento: "bp11_c3" },
      { id: "pastilha_7_5x7_5", nome: "Pastilha 7,5x7,5 cm", acabamento: "boleada_7_5" },
      { id: "pastilha_10x10", nome: "Pastilha 10x10 cm", acabamento: "bp11_c3" },
      { id: "pastilha_15x15", nome: "Pastilha 15x15 cm", acabamento: "boleada_15" },
      { id: "porcelanato_villagres", nome: "Porcelanato Villagres", acabamento: "personalizado" },
      { id: "personalizado", nome: "Revestimento Personalizado", acabamento: "personalizado" }
    ]
  },

  // 1. Obter configurações ativas (localStorage ou padrão)
  getSettings() {
    try {
      const stored = localStorage.getItem(PricingEngine.STORAGE_KEY_SETTINGS) ||
                     localStorage.getItem("igui_pricing_settings");
      if (stored) {
        const parsed = JSON.parse(stored);
        const def = PricingEngine.DEFAULT_SETTINGS;

        const incConv = parsed.m2_prices?.incorporadora?.convencional ?? def.m2_prices.incorporadora.convencional;
        const incEsp = parsed.m2_prices?.incorporadora?.especial ?? def.m2_prices.incorporadora.especial;

        return {
          m2_prices: {
            sob_medida: {
              convencional: parsed.m2_prices?.sob_medida?.convencional ?? def.m2_prices.sob_medida.convencional,
              especial: parsed.m2_prices?.sob_medida?.especial ?? def.m2_prices.sob_medida.especial
            },
            incorporadora: {
              convencional: incConv,
              especial: incEsp
            },
            internacional: {
              convencional: parsed.m2_prices?.internacional?.convencional ?? def.m2_prices.internacional.convencional,
              especial: parsed.m2_prices?.internacional?.especial ?? def.m2_prices.internacional.especial
            }
          },
          molde: {
            preco_m2_convencional: parsed.molde?.preco_m2_convencional ?? (parsed.molde?.desconto_m2 ? (incConv - parsed.molde.desconto_m2) : def.molde.preco_m2_convencional),
            preco_m2_especial: parsed.molde?.preco_m2_especial ?? (parsed.molde?.desconto_m2 ? (incEsp - parsed.molde.desconto_m2) : def.molde.preco_m2_especial),
            desconto_m2: parsed.molde?.desconto_m2 ?? def.molde.desconto_m2,
            min_unidades: parsed.molde?.min_unidades ?? parsed.regras?.min_unidades_molde ?? def.molde.min_unidades
          },
          acrescimos: {
            autoportante_pct: parsed.acrescimos?.autoportante_pct ?? parsed.regras?.acrescimo_autoportante_pct ?? def.acrescimos.autoportante_pct,
            etapas: {
              previa: parsed.acrescimos?.etapas?.previa ?? parsed.regras?.margem_previa_pct ?? def.acrescimos.etapas.previa,
              galga: parsed.acrescimos?.etapas?.galga ?? parsed.regras?.margem_galga_pct ?? def.acrescimos.etapas.galga,
              desenho_tecnico: parsed.acrescimos?.etapas?.desenho_tecnico ?? parsed.regras?.margem_desenho_tecnico_pct ?? def.acrescimos.etapas.desenho_tecnico
            }
          },
          revestimentos: parsed.revestimentos || def.revestimentos
        };
      }
    } catch (e) {
      console.warn("[PricingEngine] Erro ao carregar configurações de preços:", e);
    }
    return JSON.parse(JSON.stringify(PricingEngine.DEFAULT_SETTINGS));
  },

  // 2. Salvar configurações de preço (Somente Admin - Seção 9.5)
  saveSettings(newSettings) {
    if (typeof Auth !== "undefined" && !Auth.isAdmin()) {
      alert("Apenas administradores podem alterar as configurações de preços do sistema!");
      return false;
    }
    try {
      localStorage.setItem(PricingEngine.STORAGE_KEY_SETTINGS, JSON.stringify(newSettings));
      window.dispatchEvent(new CustomEvent("igui-pricing-updated", { detail: newSettings }));
      PricingEngine.syncSettingsToSupabase(newSettings);
      return true;
    } catch (e) {
      console.error("[PricingEngine] Falha ao salvar configurações:", e);
      return false;
    }
  },

  // Obter lista de revestimentos (para fins informativos e quantitativos)
  getCoatingsList() {
    const s = PricingEngine.getSettings();
    return s.revestimentos || PricingEngine.DEFAULT_SETTINGS.revestimentos;
  },

  // 3. Obter Preço do m² por Divisão e Tipo de Piscina (Seção 9.1)
  getPrecoM2(divisao, tipoPiscina) {
    const s = PricingEngine.getSettings();
    const div = (divisao || "sob_medida").toLowerCase();
    const tipo = (tipoPiscina || "convencional").toLowerCase();

    const divTable = s.m2_prices[div] || s.m2_prices.sob_medida;
    return parseFloat(divTable[tipo] !== undefined ? divTable[tipo] : (tipo === "especial" ? 175.0 : 140.0)) || 140.0;
  },

  // 4. Quantitativos de Peças de Acabamento (BP11, C3, Boleadas, Quebra-cantos)
  // "As peças de acabamento não têm valor próprio: já estão incluídas no preço do m² do revestimento.
  // O plugin apenas informa as quantidades." (Seção 9.1)
  calcularAcabamentosPiscina(revestimento, cantosLinearesM, quinasVivasCount) {
    const rev = (revestimento || "pastilha_15x15").toLowerCase();
    const cantosCm = (parseFloat(cantosLinearesM) || 0) * 100.0;
    const quinas = Math.max(0, parseInt(quinasVivasCount) || 0);

    // Porcelanato ou Personalizado
    if (rev === "porcelanato_villagres" || rev === "personalizado") {
      return {
        tipo_regra: "personalizado",
        peca_linear: { nome: "Cantos Lineares informados", qtd: (cantosCm / 100).toFixed(2), unit: "m", unit_price: 0, total_price: 0 },
        peca_quina: { nome: "Quinas Vivas informadas", qtd: quinas, unit: "un", unit_price: 0, total_price: 0 },
        total_acabamento: 0.00,
        incluso_no_m2: true,
        observacao: "Peças de acabamento inclusas no preço do m²"
      };
    }

    // Pastilha 5x5 ou 10x10 -> Cantoneira BP11 (20 cm cada) e Peça C3
    if (rev === "pastilha_5x5" || rev === "pastilha_10x10") {
      const qtdBp11 = Math.ceil(cantosCm / 20.0);
      const qtdC3 = quinas * 1;
      return {
        tipo_regra: "bp11_c3",
        peca_linear: { nome: "Cantoneira BP11 (20 cm)", qtd: qtdBp11, unit: "un", unit_price: 0, total_price: 0 },
        peca_quina: { nome: "Peça C3 (quina viva)", qtd: qtdC3, unit: "un", unit_price: 0, total_price: 0 },
        total_acabamento: 0.00,
        incluso_no_m2: true,
        observacao: `${qtdBp11} un BP11 + ${qtdC3} un C3 (inclusas no m²)`
      };
    }

    // Pastilha 7,5x7,5 -> Boleada reta 7,5 cm e Quebra-canto
    if (rev === "pastilha_7_5x7_5") {
      const qtdBoleada = Math.ceil(cantosCm / 7.5);
      const qtdQuebra = quinas * 1;
      return {
        tipo_regra: "boleada_7_5",
        peca_linear: { nome: "Pastilha Boleada Reta 7,5x7,5 cm", qtd: qtdBoleada, unit: "un", unit_price: 0, total_price: 0 },
        peca_quina: { nome: "Peça Quebra-canto (quina viva)", qtd: qtdQuebra, unit: "un", unit_price: 0, total_price: 0 },
        total_acabamento: 0.00,
        incluso_no_m2: true,
        observacao: `${qtdBoleada} un Boleada 7,5 + ${qtdQuebra} un Quebra-canto (inclusas no m²)`
      };
    }

    // Pastilha 15x15 (Padrão) -> Boleada reta 15 cm e Quebra-canto
    const qtdBoleada = Math.ceil(cantosCm / 15.0);
    const qtdQuebra = quinas * 1;
    return {
      tipo_regra: "boleada_15",
      peca_linear: { nome: "Pastilha Boleada Reta 15x15 cm", qtd: qtdBoleada, unit: "un", unit_price: 0, total_price: 0 },
      peca_quina: { nome: "Peça Quebra-canto (quina viva)", qtd: qtdQuebra, unit: "un", unit_price: 0, total_price: 0 },
      total_acabamento: 0.00,
      incluso_no_m2: true,
      observacao: `${qtdBoleada} un Boleada 15 + ${qtdQuebra} un Quebra-canto (inclusas no m²)`
    };
  },

  // 5. Cálculo Completo de um Modelo de Piscina (Seções 9.1, 9.2, 9.3 e 9.4)
  calcularModeloPiscina(pool, etapa, division, budgetAllPools = []) {
    const settings = PricingEngine.getSettings();

    const areaRevest = Math.max(0, parseFloat(pool.internal_area_m2) || 0);
    const areaLamina = Math.max(0, parseFloat(pool.lamination_area_m2) || 0);
    const volumeM3 = Math.max(0, parseFloat(pool.internal_volume_m3) || 0);
    const volumeLitros = Math.max(0, parseFloat(pool.internal_volume_liters) || (volumeM3 * 1000));
    const cantosLinearesM = Math.max(0, parseFloat(pool.linear_corners_m) || 0);
    const quinasVivasCount = Math.max(0, parseInt(pool.alive_corners_count) || 0);
    const unidades = Math.max(1, parseInt(pool.units_count) || 1);

    const poolType = (pool.pool_type || pool.tipo_piscina || "convencional").toLowerCase();
    const structureType = pool.structure_type || "nao_autoportante";
    const coatingType = pool.coating_type || "pastilha_15x15";
    const currentStage = (etapa || "previa").toLowerCase();
    const currentDivision = (division || "sob_medida").toLowerCase();

    // ==============================================================================
    // 9.2 DESCONTO DE MOLDE (SOMENTE INCORPORADORA)
    // "Quando algum modelo do orçamento tiver 10 ou mais unidades (configurável no admin),
    // aplica-se o desconto de molde. O desconto vale para todas as piscinas daquele orçamento.
    // O sistema pré-seleciona automaticamente 'com molde' ou 'sem molde',
    // mas o usuário pode alterar manualmente por modelo."
    // ==============================================================================
    let hasMold = false;
    const isIncorporadora = currentDivision === "incorporadora";

    if (isIncorporadora) {
      const minMolde = parseInt(settings.molde?.min_unidades) || 10;
      const allPools = [pool, ...(budgetAllPools || [])];
      const algumModeloTemMin = allPools.some(p => (parseInt(p.units_count) || 1) >= minMolde);

      if (pool.mold_manual_override === true || pool.mold_manual_override === false) {
        hasMold = !!pool.has_mold;
      } else {
        hasMold = algumModeloTemMin;
      }
    }

    // ==============================================================================
    // 9.4 ORDEM DE CÁLCULO EXATA:
    // 1. Área de revestimento × preço do m² (conforme divisão e tipo)
    // 2. − desconto de molde (Incorporadora, se aplicável)
    // 3. + acréscimo de autoportante (se aplicável, +50%)
    // 4. + acréscimo da etapa (Prévia: +5% ou Galga: 0%)
    // 5. × quantidade de unidades do modelo
    // 6. Soma de todos os modelos = valor total do orçamento
    // ==============================================================================

    // 1. Preço base do m² (conforme divisão e tipo)
    const precoM2Padrao = PricingEngine.getPrecoM2(currentDivision, poolType);
    let precoM2Efetivo = precoM2Padrao;
    let descontoMoldeM2 = 0.0;
    let valorDescontoMoldeUnit = 0.0;

    // 2. Regra de Molde (Incorporadora): se com molde (≥ 10 unidades ou selecionado),
    // usa diretamente o valor que a piscina vai ser quando tiver mais de 10 unidades
    if (isIncorporadora && hasMold) {
      if (poolType === "especial") {
        precoM2Efetivo = parseFloat(settings.molde?.preco_m2_especial) || (precoM2Padrao - (parseFloat(settings.molde?.desconto_m2) || 20.0));
      } else {
        precoM2Efetivo = parseFloat(settings.molde?.preco_m2_convencional) || (precoM2Padrao - (parseFloat(settings.molde?.desconto_m2) || 20.0));
      }
      descontoMoldeM2 = Math.max(0, parseFloat((precoM2Padrao - precoM2Efetivo).toFixed(2)));
      valorDescontoMoldeUnit = parseFloat((areaRevest * descontoMoldeM2).toFixed(2));
    }

    const valorBaseRevest = parseFloat((areaRevest * precoM2Padrao).toFixed(2));
    const valorAposMolde = parseFloat((areaRevest * precoM2Efetivo).toFixed(2));

    // 3. + Acréscimo de autoportante (se aplicável, +50%)
    const isAutoportante = structureType === "autoportante";
    const pctAutoportante = isAutoportante ? (parseFloat(settings.acrescimos?.autoportante_pct) || 50.0) : 0.0;
    const acrescimoAutoUnit = parseFloat((valorAposMolde * (pctAutoportante / 100.0)).toFixed(2));
    const valorComAutoportante = parseFloat((valorAposMolde + acrescimoAutoUnit).toFixed(2));

    // 4. + Acréscimo da etapa (Prévia: +5%, Galga: 0%, Desenho Técnico: 0%)
    let pctEtapa = 0.0;
    if (currentStage === "previa") {
      pctEtapa = parseFloat(settings.acrescimos?.etapas?.previa !== undefined ? settings.acrescimos.etapas.previa : 5.0);
    } else if (currentStage === "galga") {
      pctEtapa = parseFloat(settings.acrescimos?.etapas?.galga !== undefined ? settings.acrescimos.etapas.galga : 0.0);
    } else if (currentStage === "desenho_tecnico") {
      pctEtapa = parseFloat(settings.acrescimos?.etapas?.desenho_tecnico !== undefined ? settings.acrescimos.etapas.desenho_tecnico : 0.0);
    }
    const acrescimoEtapaUnit = parseFloat((valorComAutoportante * (pctEtapa / 100.0)).toFixed(2));
    const precoFinalUnitario = parseFloat((valorComAutoportante + acrescimoEtapaUnit).toFixed(2));

    // 5. × Quantidade de unidades do modelo
    const precoTotalModelo = parseFloat((precoFinalUnitario * unidades).toFixed(2));

    // Peças de acabamento (apenas quantitativas, valor R$ 0,00 incluso no m²)
    const acabamentosCalc = PricingEngine.calcularAcabamentosPiscina(coatingType, cantosLinearesM, quinasVivasCount);

    return {
      has_mold: hasMold,
      pool_type: poolType,
      structure_type: structureType,
      coating_type: coatingType,
      preco_m2: precoM2Efetivo,
      preco_m2_padrao: precoM2Padrao,
      area_revestimento: areaRevest.toFixed(2),
      area_laminacao: areaLamina.toFixed(2),
      volume_m3: volumeM3.toFixed(2),
      volume_litros: Math.round(volumeLitros),
      valor_base_revest: valorBaseRevest,
      desconto_molde_m2: descontoMoldeM2,
      valor_desconto_molde_unit: valorDescontoMoldeUnit,
      valor_apos_molde: valorAposMolde,
      pct_autoportante: pctAutoportante,
      valor_acrescimo_auto_unit: acrescimoAutoUnit,
      valor_com_autoportante: valorComAutoportante,
      pct_etapa: pctEtapa,
      valor_acrescimo_etapa_unit: acrescimoEtapaUnit,
      preco_final_unitario: precoFinalUnitario,
      preco_total_modelo: precoTotalModelo,
      unidades: unidades,
      finishes_details: acabamentosCalc
    };
  },

  // 6. Cálculo Consolidado de todo o Orçamento (Soma de todos os modelos)
  calcularOrcamentoCompleto(budget, pools = []) {
    let totalPrice = 0.0;
    let totalBaseRevest = 0.0;
    let totalDescontoMolde = 0.0;
    let totalBaseCost = 0.0;
    let totalAcrescimoAuto = 0.0;
    let totalAcrescimoEtapa = 0.0;
    let totalAreaRevest = 0.0;
    let totalAreaLamina = 0.0;
    let totalVolumeM3 = 0.0;
    let totalVolumeLitros = 0.0;

    const poolsCalculados = (pools || []).map(p => {
      const calc = PricingEngine.calcularModeloPiscina(p, budget.stage, budget.division, pools);
      const un = calc.unidades;

      totalPrice += calc.preco_total_modelo;
      totalBaseRevest += (calc.valor_base_revest * un);
      totalDescontoMolde += (calc.valor_desconto_molde_unit * un);
      totalBaseCost += (calc.valor_apos_molde * un);
      totalAcrescimoAuto += (calc.valor_acrescimo_auto_unit * un);
      totalAcrescimoEtapa += (calc.valor_acrescimo_etapa_unit * un);
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
      total_price: parseFloat(totalPrice.toFixed(2)),
      total_base_cost: parseFloat(totalBaseCost.toFixed(2)),
      total_base_revest: parseFloat(totalBaseRevest.toFixed(2)),
      total_desconto_molde: parseFloat(totalDescontoMolde.toFixed(2)),
      total_acrescimo_auto: parseFloat(totalAcrescimoAuto.toFixed(2)),
      total_acrescimo_etapa: parseFloat(totalAcrescimoEtapa.toFixed(2)),
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
          revestimentos_config: settings.m2_prices,
          min_units_mold: settings.molde.min_unidades,
          acrescimo_autoportante_pct: settings.acrescimos.autoportante_pct,
          margem_previa_pct: settings.acrescimos.etapas.previa,
          margem_galga_pct: settings.acrescimos.etapas.galga,
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
