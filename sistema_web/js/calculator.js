// ==============================================================================
// MOTOR DE CÁLCULO FINANCEIRO E QUANTITATIVO (ALINHADO COM SEÇÃO 9)
// ==============================================================================

const Calculator = {
  // Executa o cálculo com base nas regras oficiais da Seção 9
  calcularOrcamento(dados) {
    if (typeof PricingEngine !== "undefined") {
      const pool = {
        internal_area_m2: dados.internal_area_m2 || dados.area_revestimento || 0,
        lamination_area_m2: dados.lamination_area_m2 || dados.area_laminacao || 0,
        internal_volume_m3: dados.internal_volume_m3 || dados.volume_m3 || 0,
        linear_corners_m: dados.linear_corners_m || dados.cantos_lineares_m || 0,
        alive_corners_count: dados.alive_corners_count || dados.quinas_vivas_count || 0,
        units_count: dados.units_count || dados.unidades || 1,
        pool_type: dados.pool_type || dados.tipo_piscina || "convencional",
        structure_type: dados.structure_type || "nao_autoportante",
        coating_type: dados.coating_type || "pastilha_15x15",
        has_mold: !!dados.has_mold
      };
      const etapa = dados.stage || dados.etapa || "previa";
      const divisao = dados.division || dados.divisao || "sob_medida";

      const res = PricingEngine.calcularModeloPiscina(pool, etapa, divisao, [pool]);
      return {
        total_price: res.preco_total_modelo,
        unit_price: res.preco_final_unitario,
        base_price: res.valor_base_revest,
        calc: res
      };
    }

    const area = Math.max(0, parseFloat(dados.internal_area_m2) || 0);
    const precoM2 = parseFloat(dados.preco_m2) || 140.0;
    const base = area * precoM2;
    return {
      total_price: base,
      unit_price: base,
      base_price: base
    };
  },

  // Formata valores numéricos para moeda Real (R$)
  formatBRL(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
};
