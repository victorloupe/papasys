// ==============================================================================
// MOTOR DE CÁLCULO FINANCEIRO E QUANTITATIVO
// ==============================================================================

const Calculator = {
  // Executa o cálculo analítico com base nos quantitativos apurados no SketchUp
  calcularOrcamento(dados) {
    const area = Math.max(0, parseFloat(dados.internal_area_m2) || 0);
    const borda = Math.max(0, parseFloat(dados.border_perimeter_linear_m) || 0);
    const precoRevestimento = parseFloat(dados.preco_revestimento) || 98.0;
    const precoBorda = parseFloat(dados.preco_borda) || 130.0;
    const margemLucro = parseFloat(dados.margin_percent !== undefined ? dados.margin_percent : 25.0);
    const tileSpec = dados.tile_spec || "15x15 cm";

    const itens = [];

    // 1. Revestimento Principal (com 5% de quebra padrão)
    const quebraRevestimento = 5.0;
    const qtdRevestimento = parseFloat((area * (1 + quebraRevestimento / 100)).toFixed(2));
    const custoRevestimento = parseFloat((qtdRevestimento * precoRevestimento).toFixed(2));
    itens.push({
      category: "material",
      description: `Revestimento Modular (${tileSpec}) - Paginação sem recortes`,
      quantity: qtdRevestimento,
      unit: "m²",
      unit_cost: precoRevestimento,
      waste_percent: quebraRevestimento,
      total_cost: custoRevestimento
    });

    // 2. Argamassa AC-III Especial Piscina
    // Consumo: 5kg/m² -> 1 saco de 20kg cobre 4 m²
    const sacosArgamassa = Math.ceil(area / 4.0) || 1;
    const precoArgamassa = 42.0;
    const custoArgamassa = parseFloat((sacosArgamassa * precoArgamassa).toFixed(2));
    itens.push({
      category: "insumo",
      description: "Argamassa Colante AC-III Especial Piscina (Saco 20kg)",
      quantity: sacosArgamassa,
      unit: "saco 20kg",
      unit_cost: precoArgamassa,
      waste_percent: 0,
      total_cost: custoArgamassa
    });

    // 3. Rejunte Especial Piscina
    // Consumo: 1 balde de 5kg cobre 10 m²
    const baldesRejunte = Math.ceil(area / 10.0) || 1;
    const precoRejunte = 68.0;
    const custoRejunte = parseFloat((baldesRejunte * precoRejunte).toFixed(2));
    itens.push({
      category: "insumo",
      description: "Rejunte Especial para Piscina (Balde 5kg)",
      quantity: baldesRejunte,
      unit: "balde 5kg",
      unit_cost: precoRejunte,
      waste_percent: 0,
      total_cost: custoRejunte
    });

    // 4. Borda Superior (Pedra ou Porcelanato boleado)
    if (borda > 0) {
      const quebraBorda = 3.0;
      const qtdBorda = parseFloat((borda * (1 + quebraBorda / 100)).toFixed(2));
      const custoBorda = parseFloat((qtdBorda * precoBorda).toFixed(2));
      itens.push({
        category: "borda",
        description: "Pedra Boleada Atérmica para Acabamento de Borda",
        quantity: qtdBorda,
        unit: "m",
        unit_cost: precoBorda,
        waste_percent: quebraBorda,
        total_cost: custoBorda
      });
    }

    // 5. Mão de Obra de Assentamento de Revestimento
    const valorMoRevest = 75.0; // R$ 75/m²
    const custoMoRevest = parseFloat((area * valorMoRevest).toFixed(2));
    itens.push({
      category: "mao_de_obra",
      description: "Mão de Obra Especializada - Assentamento de Pastilhas",
      quantity: area,
      unit: "m²",
      unit_cost: valorMoRevest,
      waste_percent: 0,
      total_cost: custoMoRevest
    });

    // 6. Mão de Obra de Borda
    if (borda > 0) {
      const valorMoBorda = 45.0; // R$ 45/m
      const custoMoBorda = parseFloat((borda * valorMoBorda).toFixed(2));
      itens.push({
        category: "mao_de_obra",
        description: "Mão de Obra - Instalação e Nivelamento da Borda",
        quantity: borda,
        unit: "m",
        unit_cost: valorMoBorda,
        waste_percent: 0,
        total_cost: custoMoBorda
      });
    }

    // 7. Impermeabilização Técnica
    const valorImpermeabilizacao = 55.0; // R$ 55/m²
    const custoImper = parseFloat((area * valorImpermeabilizacao).toFixed(2));
    itens.push({
      category: "mao_de_obra",
      description: "Impermeabilização Técnica com Membrana Polimérica",
      quantity: area,
      unit: "m²",
      unit_cost: valorImpermeabilizacao,
      waste_percent: 0,
      total_cost: custoImper
    });

    // Adiciona itens extras personalizados se existirem
    if (dados.custom_items && dados.custom_items.length > 0) {
      dados.custom_items.forEach(extra => {
        if (extra.description) {
          const q = parseFloat(extra.quantity) || 1;
          const u = parseFloat(extra.unit_cost) || 0;
          const tot = parseFloat((q * u).toFixed(2));
          itens.push({
            category: extra.category || "extra",
            description: extra.description,
            quantity: q,
            unit: extra.unit || "un",
            unit_cost: u,
            waste_percent: 0,
            total_cost: tot
          });
        }
      });
    }

    // Totalização
    const custoTotal = parseFloat(itens.reduce((acc, it) => acc + it.total_cost, 0).toFixed(2));
    const precoFinal = parseFloat((custoTotal * (1 + margemLucro / 100)).toFixed(2));
    const lucroLiquido = parseFloat((precoFinal - custoTotal).toFixed(2));

    return {
      items: itens,
      total_cost: custoTotal,
      margin_percent: margemLucro,
      total_price: precoFinal,
      profit_value: lucroLiquido
    };
  },

  // Formata valores numéricos para moeda Real (R$)
  formatBRL(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
};
