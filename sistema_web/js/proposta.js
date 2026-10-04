// ==============================================================================
// PROPOSTA COMERCIAL EXECUTIVA & FICHA TÉCNICA iGUi
// Formatada para Impressão e Salvamento em PDF
// ==============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const budgetId = urlParams.get("id");

  await carregarProposta(budgetId);
});

async function carregarProposta(budgetId) {
  let budget = null;
  if (budgetId) {
    budget = await DB.getBudgetById(budgetId);
  }

  if (!budget) {
    const all = await DB.getBudgets();
    budget = all[0] || null;
  }

  if (!budget) {
    if (typeof PapaSysDialog !== "undefined") {
      await PapaSysDialog.alert({
        title: "Orçamento Não Encontrado",
        message: "O orçamento solicitado não foi localizado no sistema.",
        type: "warning"
      });
    }
    window.location.href = "index.html";
    return;
  }

  renderizarProposta(budget);
}

function renderizarProposta(b) {
  const pools = b.pools || [];
  const nomesDiv = { sob_medida: "iGUi Sob Medida", incorporadora: "iGUi Incorporadora", internacional: "iGUi Internacional" };
  const nomesEtapas = { previa: "Prévia (Estimativa Preliminar)", galga: "Galga (Pré-venda)", desenho_tecnico: "Desenho Técnico (Venda)" };

  const isAdmin = typeof Auth !== "undefined" && Auth.isAdmin();
  const docTitle = document.querySelector(".prop-doc-title");
  if (docTitle) {
    docTitle.textContent = "PROPOSTA COMERCIAL & FICHA TÉCNICA";
  }

  // Identificação
  document.getElementById("propCodigo").textContent = b.budget_code;
  document.getElementById("propData").textContent = new Date(b.created_at || Date.now()).toLocaleDateString("pt-BR");
  document.getElementById("propDivisao").textContent = nomesDiv[b.division] || b.division;
  document.getElementById("propEtapa").textContent = nomesEtapas[b.stage] || b.stage;

  document.getElementById("propProjeto").textContent = b.project_name;
  document.getElementById("propCliente").textContent = b.client_name || "Cliente Geral";
  document.getElementById("propResponsavel").textContent = b.assigned_user_name || "Victor Lourenço";

  // Totalizador de preço
  const tileValor = document.getElementById("propTileValor");
  if (tileValor) tileValor.style.display = "flex";

  const thUnit = document.getElementById("propThUnitario");
  if (thUnit) thUnit.style.display = "";

  const thSub = document.getElementById("propThSubtotal");
  if (thSub) thSub.style.display = "";

  const secPreco = document.getElementById("propSecaoComposicaoPreco");
  if (secPreco) secPreco.style.display = "block";

  const secCrono = document.getElementById("propSecaoCronograma");
  if (secCrono) secCrono.style.display = "block";

  // Totalizadores
  const elTotal = document.getElementById("propTotalValor");
  if (elTotal) elTotal.textContent = PricingEngine.formatBRL(b.total_price);

  document.getElementById("propTotalRevest").textContent = `${b.total_area_revestimento || 0} m²`;
  document.getElementById("propTotalLamina").textContent = `${b.total_area_laminacao || 0} m²`;
  document.getElementById("propTotalVolume").textContent = `${b.total_volume_m3 || 0} m³ (${Number(b.total_volume_liters || 0).toLocaleString('pt-BR')} L)`;

  // Tabela de Modelos de Piscinas
  const tbody = document.getElementById("propModelosTbody");
  if (tbody) {
    tbody.innerHTML = pools.map((p, idx) => {
      const acab = p.finishes_details || PricingEngine.calcularAcabamentosPiscina(p.coating_type, p.linear_corners_m, p.alive_corners_count);
      const isAuto = p.structure_type === "autoportante";
      const hasMold = p.has_mold;

      return `
        <tr>
          <td>
            <strong>#${idx + 1} ${p.model_name}</strong>
            <div class="field-hint">
              ${p.pool_type === 'especial' ? 'Piscina Especial' : 'Piscina Convencional'} &bull;
              ${isAuto ? 'Autoportante (+50%)' : 'Não autoportante'}
              ${hasMold ? ' &bull; <span class="badge-mold">COM MOLDE</span>' : ''}
            </div>
          </td>
          <td class="text-center"><strong>${p.units_count} un</strong></td>
          <td>
            <div>${p.coating_type.replace('_', ' ')}</div>
            <div class="field-hint">${acab.observacao || ''}</div>
          </td>
          <td class="text-right">
            <div>${p.internal_area_m2} m² revest.</div>
            <div class="field-hint">${p.lamination_area_m2} m² lâmina</div>
          </td>
          <td class="text-right">
            <div>${p.internal_volume_m3} m³</div>
            <div class="field-hint">${Number((p.internal_volume_liters || (p.internal_volume_m3 * 1000))).toLocaleString('pt-BR')} L</div>
          </td>
          <td class="text-right tabular-nums">
            ${PricingEngine.formatBRL(p.unit_final_value || (p.total_model_value / p.units_count))}
          </td>
          <td class="text-right tabular-nums font-bold" style="color: var(--igui-blue-dark);">
            ${PricingEngine.formatBRL(p.total_model_value)}
          </td>
        </tr>
      `;
    }).join("");
  }

  // Composição Financeira da Seção 11 e Cronograma
  document.getElementById("propBaseCost").textContent = PricingEngine.formatBRL(b.total_base_cost);
  const diffAuto = (b.total_price - b.total_base_cost) * 0.7; // aproximado
  const diffMargem = b.stage === 'previa' ? (b.total_price * 0.05 / 1.05) : 0;

  document.getElementById("propAutoCost").textContent = `+ ${PricingEngine.formatBRL(diffAuto)}`;
  document.getElementById("propStageMargin").textContent = `+ ${PricingEngine.formatBRL(diffMargem)} (${b.stage === 'previa' ? '+5%' : '0%'})`;
  document.getElementById("propGrandTotal").textContent = PricingEngine.formatBRL(b.total_price);

  // Cronograma de Desembolso
  const total = b.total_price || 0;
  document.getElementById("cronoEntrada").textContent = PricingEngine.formatBRL(total * 0.40);
  document.getElementById("cronoCasco").textContent = PricingEngine.formatBRL(total * 0.30);
  document.getElementById("cronoEntrega").textContent = PricingEngine.formatBRL(total * 0.30);

  // Notas
  if (b.notes) {
    document.getElementById("propNotas").textContent = b.notes;
  }
}
