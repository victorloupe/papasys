// ==============================================================================
// CONTROLLER DA PROPOSTA EXECUTIVA (PDF) - PAPASYS
// Exibição analítica e comercial completa dos fornecimentos e serviços
// ==============================================================================

let currentProject = null;
let modoExibicaoGlobal = false; // false = Valores Detalhados (padrão); true = Incluso no Escopo

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("id");

  if (!projectId) {
    await PapaSysDialog.alert({
      title: "Identificador Inválido",
      message: "Nenhum ID de projeto válido foi especificado.",
      type: "warning"
    });
    window.location.href = "index.html";
    return;
  }

  currentProject = await DB.getProjectById(projectId);
  if (!currentProject) {
    await PapaSysDialog.alert({
      title: "Projeto Não Encontrado",
      message: "O projeto solicitado não foi localizado no sistema.",
      type: "error"
    });
    window.location.href = "index.html";
    return;
  }

  // Se o projeto ainda não possui lista de itens gravada, gera a composição analítica completa automaticamente
  if (!currentProject.items || currentProject.items.length === 0) {
    const calc = Calculator.calcularOrcamento({
      internal_area_m2: currentProject.internal_area_m2,
      border_perimeter_linear_m: currentProject.border_perimeter_linear_m,
      tile_spec: currentProject.tile_spec,
      margin_percent: currentProject.margin_percent !== undefined ? currentProject.margin_percent : 25.0
    });
    currentProject.items = calc.items;
    currentProject.total_cost = calc.total_cost;
    currentProject.total_price = calc.total_price;

    // Sincroniza em segundo plano no Supabase e LocalStorage para persistência
    DB.updateProject(currentProject.id, {
      total_cost: calc.total_cost,
      total_price: calc.total_price
    }, currentProject.items).catch(err => console.warn("[Proposta] Sincronização automática de itens:", err));
  }

  renderizarProposta(currentProject);
});

function renderizarProposta(p) {
  if (!p) return;

  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const validade = new Date(Date.now() + 15 * 86400000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  document.getElementById("docNumero").textContent = (p.id ? p.id.slice(0, 8) : "000000").toUpperCase();
  document.getElementById("docData").textContent = dataHoje;
  document.getElementById("docValidade").textContent = validade;

  document.getElementById("propCliente").textContent = p.client_name || "Cliente Geral";
  document.getElementById("propProjeto").textContent = p.project_name || "Projeto de Piscina";
  document.getElementById("propArea").textContent = Number(p.internal_area_m2 || 0).toFixed(2) + " m²";
  document.getElementById("propBorda").textContent = Number(p.border_perimeter_linear_m || 0).toFixed(2) + " m linear";
  document.getElementById("propRevestimento").textContent = (p.tile_spec || "15x15 cm") + " (sem recortes)";

  // Tabela de Itens e Escopo Completo
  const tbody = document.getElementById("propTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const items = p.items || [];
  const margem = parseFloat(p.margin_percent !== undefined ? p.margin_percent : 25.0) || 0;
  const fatorMargem = 1 + (margem / 100);

  let somaTotalComercial = 0;

  items.forEach((it) => {
    const custoUnit = Number(it.unit_cost) || 0;
    const custoTotal = Number(it.total_cost) || (Number(it.quantity) * custoUnit) || 0;

    // Preço de venda comercial proporcional (com margem de lucro inclusa)
    const unitVenda = custoUnit * fatorMargem;
    const totalVenda = custoTotal * fatorMargem;
    somaTotalComercial += totalVenda;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="prop-item-title-wrap">
          <span class="prop-item-name">${escapeHtml(it.description)}</span>
          ${getCategoryBadgeHtml(it.category)}
        </div>
      </td>
      <td class="tabular-nums" style="text-align: center;">
        <span class="table-unit-tag" style="font-weight: 700; font-size: 11px;">
          ${Number(it.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${escapeHtml(it.unit || '')}
        </span>
      </td>
      <td class="tabular-nums" style="text-align: right; color: var(--text-secondary); font-size: 12px;">
        ${modoExibicaoGlobal ? '<span style="color: var(--text-dim);">-</span>' : Calculator.formatBRL(unitVenda)}
      </td>
      <td class="tabular-nums" style="text-align: right; font-weight: 700; color: var(--text-primary); font-size: 12.5px;">
        ${modoExibicaoGlobal ? '<span style="color: var(--status-aprovado); font-weight: 700;">Incluso</span>' : Calculator.formatBRL(totalVenda)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  // O total é o preço de venda gravado ou calculado pela soma
  const total = Number(p.total_price) || parseFloat(somaTotalComercial.toFixed(2));

  // Subtotal e Total Geral
  const elSub = document.getElementById("propTotalSub");
  if (elSub) {
    elSub.textContent = modoExibicaoGlobal ? "Incluso no Pacote Global" : Calculator.formatBRL(total);
  }

  // Condições de faturamento sugeridas (40% entrada, 30% impermeabilização, 30% entrega)
  const entrada = total * 0.4;
  const parcela1 = total * 0.3;
  const parcela2 = total * 0.3;

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.initFormPage();
    PapaSysAnimation.animateCounter("propTotalFinal", total, { format: "currency", duration: 0.8 });
    PapaSysAnimation.animateCounter("condEntrada", entrada, { format: "currency", duration: 0.8 });
    PapaSysAnimation.animateCounter("condParcela1", parcela1, { format: "currency", duration: 0.8 });
    PapaSysAnimation.animateCounter("condParcela2", parcela2, { format: "currency", duration: 0.8 });
  } else {
    document.getElementById("propTotalFinal").textContent = Calculator.formatBRL(total);
    document.getElementById("condEntrada").textContent = Calculator.formatBRL(entrada);
    document.getElementById("condParcela1").textContent = Calculator.formatBRL(parcela1);
    document.getElementById("condParcela2").textContent = Calculator.formatBRL(parcela2);
  }

  // Assinatura
  document.getElementById("signCliente").textContent = p.client_name || "CLIENTE";

  // Botão de editar orçamento
  const btnEditar = document.getElementById("btnEditarOrcamento");
  if (btnEditar) {
    btnEditar.onclick = () => {
      window.location.href = `orcamento.html?id=${p.id}`;
    };
  }
}

// Alterna entre visão detalhada com preços e visão comercial simplificada (Incluso) via Segmented Control
function setModoExibicao(isGlobal) {
  modoExibicaoGlobal = isGlobal;
  const btnDet = document.getElementById("btnModoDetalhado");
  const btnGlob = document.getElementById("btnModoGlobal");
  if (btnDet && btnGlob) {
    if (isGlobal) {
      btnDet.classList.remove("active");
      btnGlob.classList.add("active");
    } else {
      btnGlob.classList.remove("active");
      btnDet.classList.add("active");
    }
  }
  renderizarProposta(currentProject);
}

function alternarModoPrecos() {
  setModoExibicao(!modoExibicaoGlobal);
}

function getCategoryBadgeHtml(cat) {
  switch (cat) {
    case "material":
      return '<span class="badge badge-cat-material" style="font-size: 10px; padding: 2px 7px;">Revestimento Modular</span>';
    case "insumo":
      return '<span class="badge badge-cat-insumo" style="font-size: 10px; padding: 2px 7px;">Insumo de Assentamento</span>';
    case "borda":
      return '<span class="badge badge-cat-borda" style="font-size: 10px; padding: 2px 7px;">Borda Perimetral</span>';
    case "mao_de_obra":
      return '<span class="badge badge-cat-mao_de_obra" style="font-size: 10px; padding: 2px 7px;">Mão de Obra Especializada</span>';
    case "extra":
      return '<span class="badge" style="background:#f1f5f9; color:#475569; font-size: 10px; padding: 2px 7px; border: 1px solid #e2e8f0;">Serviço Complementar</span>';
    default:
      return '<span class="badge" style="font-size: 10px; padding: 2px 7px;">Composição</span>';
  }
}

function imprimirProposta() {
  window.print();
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
