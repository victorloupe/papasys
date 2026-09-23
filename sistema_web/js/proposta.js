// ==============================================================================
// CONTROLLER DA PROPOSTA EXECUTIVA (PDF)
// ==============================================================================

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

  const project = await DB.getProjectById(projectId);
  if (!project) {
    await PapaSysDialog.alert({
      title: "Projeto Não Encontrado",
      message: "O projeto solicitado não foi localizado no sistema.",
      type: "error"
    });
    window.location.href = "index.html";
    return;
  }

  renderizarProposta(project);
});

function renderizarProposta(p) {
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

  document.getElementById("docNumero").textContent = (p.id.slice(0, 8)).toUpperCase();
  document.getElementById("docData").textContent = dataHoje;
  document.getElementById("docValidade").textContent = validade;

  document.getElementById("propCliente").textContent = p.client_name || "Cliente Geral";
  document.getElementById("propProjeto").textContent = p.project_name;
  document.getElementById("propArea").textContent = Number(p.internal_area_m2 || 0).toFixed(2) + " m²";
  document.getElementById("propBorda").textContent = Number(p.border_perimeter_linear_m || 0).toFixed(2) + " m linear";
  document.getElementById("propRevestimento").textContent = (p.tile_spec || "15x15 cm") + " (sem recortes)";

  // Tabela de Itens e Escopo
  const tbody = document.getElementById("propTbody");
  tbody.innerHTML = "";

  const items = p.items || [];
  if (items.length > 0) {
    items.forEach(it => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${escapeHtml(it.description)}</strong></td>
        <td class="tabular-nums">${it.quantity} ${it.unit}</td>
        <td class="tabular-nums" style="text-align: right;">${Calculator.formatBRL(it.unit_cost)}</td>
        <td class="tabular-nums" style="text-align: right; font-weight: 700; color: var(--text-primary);">${Calculator.formatBRL(it.total_cost)}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    // Escopo resumido
    const tr1 = document.createElement("tr");
    tr1.innerHTML = `
      <td><strong>Revestimento Modular (${p.tile_spec || "15x15"}) e Insumos</strong></td>
      <td>${p.internal_area_m2} m²</td>
      <td>-</td>
      <td style="text-align: right; font-weight: 700;">Incluso</td>
    `;
    tbody.appendChild(tr1);

    const tr2 = document.createElement("tr");
    tr2.innerHTML = `
      <td><strong>Pedra Atérmica de Borda e Mão de Obra Especializada</strong></td>
      <td>${p.border_perimeter_linear_m} m</td>
      <td>-</td>
      <td style="text-align: right; font-weight: 700;">Incluso</td>
    `;
    tbody.appendChild(tr2);
  }

  // Totais
  const total = Number(p.total_price) || 0;

  // Condições de pagamento sugeridas (40% / 30% / 30%)
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
  document.getElementById("signCliente").textContent = p.client_name || "Cliente";

  // Botão de editar
  document.getElementById("btnEditarOrcamento").onclick = () => {
    window.location.href = `orcamento.html?id=${p.id}`;
  };
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
