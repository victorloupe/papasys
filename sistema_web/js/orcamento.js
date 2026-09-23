// ==============================================================================
// CONTROLLER DO EDITOR E CALCULADORA DE ORÇAMENTO - PAPASYS
// Permite edição total: medidas, materiais, serviços extras, preços e margem
// ==============================================================================

let currentProject = null;
let currentItems = [];

document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("id");

  if (!projectId) {
    await PapaSysDialog.alert({
      title: "Projeto Não Especificado",
      message: "Nenhum ID de projeto foi informado para abrir o orçamento.",
      type: "warning"
    });
    window.location.href = "index.html";
    return;
  }

  await carregarDadosProjeto(projectId);
});

async function carregarDadosProjeto(id) {
  currentProject = await DB.getProjectById(id);

  if (!currentProject) {
    await PapaSysDialog.alert({
      title: "Projeto Não Encontrado",
      message: "O projeto solicitado não foi localizado no banco de dados.",
      type: "error"
    });
    window.location.href = "index.html";
    return;
  }

  // Preenche os campos editáveis
  document.getElementById("txtHeaderTitulo").textContent = "Orçamento: " + (currentProject.project_name || "Sem Nome");
  document.getElementById("inputNomeProjeto").value = currentProject.project_name || "";
  document.getElementById("inputCliente").value = currentProject.client_name || "";
  document.getElementById("inputAreaM2").value = Number(currentProject.internal_area_m2 || 0).toFixed(2);
  document.getElementById("inputBordaM").value = Number(currentProject.border_perimeter_linear_m || 0).toFixed(2);
  document.getElementById("inputTileSpec").value = currentProject.tile_spec || "15x15 cm";
  document.getElementById("selStatus").value = currentProject.status || "novo";
  document.getElementById("inputMargem").value = currentProject.margin_percent || 25.0;
  document.getElementById("txtNotas").value = currentProject.notes || "";

  // Carrega itens existentes ou calcula se vazio
  if (currentProject.items && currentProject.items.length > 0) {
    currentItems = JSON.parse(JSON.stringify(currentProject.items));
  } else {
    const calc = Calculator.calcularOrcamento({
      internal_area_m2: currentProject.internal_area_m2,
      border_perimeter_linear_m: currentProject.border_perimeter_linear_m,
      tile_spec: currentProject.tile_spec,
      margin_percent: currentProject.margin_percent || 25.0
    });
    currentItems = calc.items;
  }

  renderizarTabelaItens();
  recalcularTotais();

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.initFormPage();
  }
}

// Renderiza todas as linhas editáveis da tabela de composição analítica
function renderizarTabelaItens() {
  const tbody = document.getElementById("itensTbody");
  tbody.innerHTML = "";

  currentItems.forEach((item, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <select class="table-select" onchange="atualizarItem(${index}, 'category', this.value)">
          <option value="material" ${item.category === "material" ? "selected" : ""}>Material</option>
          <option value="insumo" ${item.category === "insumo" ? "selected" : ""}>Insumo</option>
          <option value="borda" ${item.category === "borda" ? "selected" : ""}>Borda</option>
          <option value="mao_de_obra" ${item.category === "mao_de_obra" ? "selected" : ""}>Mão de Obra</option>
          <option value="extra" ${item.category === "extra" ? "selected" : ""}>Extra/Serviço</option>
        </select>
      </td>
      <td>
        <input type="text" class="table-input" value="${escapeHtml(item.description)}" oninput="atualizarItem(${index}, 'description', this.value)">
      </td>
      <td>
        <input type="number" step="0.01" class="table-input tabular-nums" style="text-align: right; font-weight: 700; padding: 5px 6px; width: 100%; box-sizing: border-box;" value="${item.quantity}" oninput="atualizarItem(${index}, 'quantity', this.value)">
      </td>
      <td>
        <input type="text" class="table-input" style="text-align: center; text-transform: lowercase; font-weight: 600; padding: 5px 4px; width: 100%; box-sizing: border-box;" value="${escapeHtml(item.unit || 'un')}" oninput="atualizarItem(${index}, 'unit', this.value)">
      </td>
      <td>
        <input type="number" step="0.01" class="table-input tabular-nums" style="text-align: right; padding: 5px 6px; width: 100%; box-sizing: border-box;" value="${item.unit_cost}" oninput="atualizarItem(${index}, 'unit_cost', this.value)">
      </td>
      <td style="font-weight: 800; color: var(--orange-600); font-size: 13px; text-align: right; white-space: nowrap;" class="tabular-nums">
        ${Calculator.formatBRL(item.total_cost || 0)}
      </td>
      <td style="text-align: center;">
        <button class="btn-danger-ghost" onclick="removerItem(${index})" title="Remover item">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function atualizarItem(index, campo, valor) {
  if (campo === "quantity" || campo === "unit_cost") {
    currentItems[index][campo] = parseFloat(valor) || 0;
    currentItems[index].total_cost = parseFloat((currentItems[index].quantity * currentItems[index].unit_cost).toFixed(2));
    
    // Atualiza a coluna do total daquela linha
    const tbody = document.getElementById("itensTbody");
    const row = tbody.children[index];
    if (row) {
      row.children[5].textContent = Calculator.formatBRL(currentItems[index].total_cost);
    }
  } else {
    currentItems[index][campo] = valor;
  }
  recalcularTotais();
}

function removerItem(index) {
  currentItems.splice(index, 1);
  renderizarTabelaItens();
  recalcularTotais();
}

// Adiciona um item extra customizado (ex: escavação, iluminação, bomba, etc.)
function adicionarItemExtra() {
  currentItems.push({
    category: "extra",
    description: "Novo Item de Obra (Ex: Iluminação LED, Bomba, Escavação)",
    quantity: 1,
    unit: "un",
    unit_cost: 350.0,
    waste_percent: 0,
    total_cost: 350.0
  });
  renderizarTabelaItens();
  recalcularTotais();
  showToast("Novo item adicionado. Edite a descrição e o valor!", "info");

  const tbody = document.getElementById("itensTbody");
  if (tbody && tbody.lastElementChild && typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateTableRow(tbody.lastElementChild);
  }
}

// Recalcula insumos automaticamente caso o usuário mude a Área ou Borda
function recalcularPorMedidas() {
  const area = parseFloat(document.getElementById("inputAreaM2").value) || 0;
  const borda = parseFloat(document.getElementById("inputBordaM").value) || 0;
  const spec = document.getElementById("inputTileSpec").value || "15x15 cm";
  const margem = parseFloat(document.getElementById("inputMargem").value) || 25.0;

  // Preserva itens de categoria "extra" criados pelo usuário
  const extras = currentItems.filter(it => it.category === "extra");

  const calc = Calculator.calcularOrcamento({
    internal_area_m2: area,
    border_perimeter_linear_m: borda,
    tile_spec: spec,
    margin_percent: margem,
    custom_items: extras
  });

  currentItems = calc.items;
  renderizarTabelaItens();
  recalcularTotais();
  showToast("Itens e consumos recalculados com base nas novas medidas!", "success");
}

function recalcularTotais() {
  const margem = parseFloat(document.getElementById("inputMargem").value) || 0;
  const custoTotal = parseFloat(currentItems.reduce((acc, it) => acc + (Number(it.total_cost) || 0), 0).toFixed(2));
  const precoVenda = parseFloat((custoTotal * (1 + margem / 100)).toFixed(2));
  const lucro = parseFloat((precoVenda - custoTotal).toFixed(2));

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateCounter("txtCustoTotal", custoTotal, { format: "currency", duration: 0.5 });
    PapaSysAnimation.animateCounter("txtPrecoVenda", precoVenda, { format: "currency", duration: 0.5 });
    PapaSysAnimation.animateCounter("txtLucro", lucro, { format: "currency", duration: 0.5 });
  } else {
    document.getElementById("txtCustoTotal").textContent = Calculator.formatBRL(custoTotal);
    document.getElementById("txtPrecoVenda").textContent = Calculator.formatBRL(precoVenda);
    document.getElementById("txtLucro").textContent = Calculator.formatBRL(lucro);
  }
  document.getElementById("txtMargemDisplay").textContent = margem.toFixed(1) + "%";
}

function atualizarResumoMedidas() {
  // Apenas atualização suave de feedback
}

// Salva todas as alterações no Supabase
async function salvarOrcamento() {
  const nomeProjeto = document.getElementById("inputNomeProjeto").value || "Projeto Sem Nome";
  const cliente = document.getElementById("inputCliente").value || "Cliente Geral";
  const areaM2 = parseFloat(document.getElementById("inputAreaM2").value) || 0;
  const bordaM = parseFloat(document.getElementById("inputBordaM").value) || 0;
  const tileSpec = document.getElementById("inputTileSpec").value || "15x15 cm";
  const status = document.getElementById("selStatus").value;
  const margem = parseFloat(document.getElementById("inputMargem").value) || 0;
  const notas = document.getElementById("txtNotas").value;

  const custoTotal = parseFloat(currentItems.reduce((acc, it) => acc + (Number(it.total_cost) || 0), 0).toFixed(2));
  const precoVenda = parseFloat((custoTotal * (1 + margem / 100)).toFixed(2));

  const dadosAtualizados = {
    project_name: nomeProjeto,
    client_name: cliente,
    internal_area_m2: areaM2,
    border_perimeter_linear_m: bordaM,
    tile_spec: tileSpec,
    status: status,
    margin_percent: margem,
    total_cost: custoTotal,
    total_price: precoVenda,
    notes: notas
  };

  const ok = await DB.updateProject(currentProject.id, dadosAtualizados, currentItems);
  if (ok) {
    document.getElementById("txtHeaderTitulo").textContent = "Orçamento: " + nomeProjeto;
    showToast("Orçamento, medidas e itens salvos com sucesso no Supabase.", "success");
  } else {
    showToast("Erro ao salvar dados no servidor.", "error");
  }
}

async function abrirPropostaExecutiva() {
  await salvarOrcamento();
  window.location.href = `proposta.html?id=${currentProject.id}`;
}

function showToast(msg, tipo = "info") {
  const box = document.getElementById("toastBox");
  if (!box) return;
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  box.appendChild(t);

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateToastIn(t);
    setTimeout(() => {
      PapaSysAnimation.animateToastOut(t, () => t.remove());
    }, 3500);
  } else {
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }
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
