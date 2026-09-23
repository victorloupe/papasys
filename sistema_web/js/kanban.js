// ==============================================================================
// CONTROLLER DO DASHBOARD KANBAN - PAPASYS IMPECCABLE CRAFT
// Suporte a cards colapsáveis, modo encolhido em Aprovados/Arquivados e Pesquisa Inteligente
// ==============================================================================

let allProjects = [];
let currentFilterStatus = "todos";
let cardCollapsedStates = {}; // { [projectId]: boolean }

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.initDashboard();
  }

  await carregarProjetos();

  // Escuta novas inserções em tempo real pelo Supabase
  DB.listenRealtime(async (novoProjeto) => {
    showToast(`Novo projeto recebido do SketchUp: ${novoProjeto.project_name}!`, "success");
    await carregarProjetos();
  });

  const searchInput = document.getElementById("searchProjects");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filtrarProjetos();
    });
  }

  // Atalhos de teclado: '/' ou 'Ctrl+K' foca a busca; 'Escape' limpa
  document.addEventListener("keydown", (e) => {
    if ((e.key === "/" || (e.ctrlKey && e.key.toLowerCase() === "k")) && document.activeElement !== searchInput) {
      e.preventDefault();
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    } else if (e.key === "Escape" && searchInput && document.activeElement === searchInput) {
      limparBusca();
      searchInput.blur();
    }
  });
});

async function carregarProjetos() {
  allProjects = await DB.getProjects();
  renderizarEstatisticas(allProjects);
  atualizarContadoresAbas(allProjects);
  filtrarProjetos();
}

function atualizarContadoresAbas(projetos) {
  const counts = {
    todos: projetos.length,
    novo: 0,
    em_analise: 0,
    enviado: 0,
    aprovado: 0,
    rejeitado: 0
  };

  projetos.forEach(p => {
    const s = p.status || "novo";
    if (counts[s] !== undefined) counts[s]++;
  });

  Object.keys(counts).forEach(k => {
    const el = document.getElementById(`tab-count-${k}`);
    if (el) el.textContent = counts[k];
  });
}

function filtrarPorAba(status, el) {
  currentFilterStatus = status;
  document.querySelectorAll(".tab-pill").forEach(btn => btn.classList.remove("active"));
  if (el) el.classList.add("active");
  filtrarProjetos();
}

// Normalizador de texto (ignora acentos e maiúsculas/minúsculas)
function normalizeText(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Algoritmo de Pesquisa Inteligente Multi-Token e Operadores
function smartMatch(p, query) {
  if (!query) return true;
  const q = normalizeText(query);
  if (!q) return true;

  const tokens = q.split(/\s+/).filter(t => t.length > 0);
  const name = normalizeText(p.project_name);
  const client = normalizeText(p.client_name);
  const spec = normalizeText(p.tile_spec);
  const status = normalizeText(p.status);
  const notes = normalizeText(p.notes);
  const price = Number(p.total_price) || 0;
  const area = Number(p.internal_area_m2) || 0;
  const border = Number(p.border_perimeter_linear_m) || 0;
  const priceStr = price.toFixed(2);
  const priceRounded = Math.round(price).toString();
  const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString("pt-BR") : "";

  return tokens.every(tok => {
    // Operador maior que: > 10000 ou >10k
    if (tok.startsWith(">")) {
      const cleanVal = tok.slice(1).replace("k", "000").replace("r$", "").replace(".", "").replace(",", ".").trim();
      const numVal = parseFloat(cleanVal);
      if (!isNaN(numVal)) return price >= numVal;
    }
    // Operador menor que: < 20000 ou <20k
    if (tok.startsWith("<")) {
      const cleanVal = tok.slice(1).replace("k", "000").replace("r$", "").replace(".", "").replace(",", ".").trim();
      const numVal = parseFloat(cleanVal);
      if (!isNaN(numVal)) return price <= numVal;
    }

    // Campos textuais
    if (name.includes(tok)) return true;
    if (client.includes(tok)) return true;
    if (spec.includes(tok)) return true;
    if (status.includes(tok)) return true;
    if (notes.includes(tok)) return true;
    if (dateStr.includes(tok)) return true;

    // Números de preço ou metragens
    if (priceStr.includes(tok) || priceRounded.includes(tok)) return true;
    if (area.toString().includes(tok)) return true;
    if (border.toString().includes(tok)) return true;

    // Sinônimos de status
    if (tok === "arquivado" || tok === "arquivados" || tok === "rejeitado") return (p.status || "novo") === "rejeitado";
    if (tok === "aprovado" || tok === "aprovados" || tok === "obra") return (p.status || "novo") === "aprovado";
    if (tok === "enviado" || tok === "enviada" || tok === "proposta") return (p.status || "novo") === "enviado";
    if (tok === "analise" || tok === "tecnica") return (p.status || "novo") === "em_analise";
    if (tok === "novo" || tok === "novos" || tok === "sketchup" || tok === "3d") return (p.status || "novo") === "novo";

    return false;
  });
}

function filtrarProjetos() {
  const searchInput = document.getElementById("searchProjects");
  const termo = searchInput ? searchInput.value.trim() : "";
  const clearBtn = document.getElementById("btnClearSearch");
  const feedbackEl = document.getElementById("searchFeedback");

  if (clearBtn) {
    clearBtn.classList.toggle("hidden", termo === "");
  }

  let filtrados = allProjects;

  if (currentFilterStatus !== "todos") {
    filtrados = filtrados.filter(p => (p.status || "novo") === currentFilterStatus);
  }

  if (termo !== "") {
    filtrados = filtrados.filter(p => smartMatch(p, termo));

    if (feedbackEl) {
      feedbackEl.classList.remove("hidden");
      feedbackEl.textContent = `${filtrados.length} ${filtrados.length === 1 ? "projeto encontrado" : "projetos encontrados"}`;
    }
  } else {
    if (feedbackEl) feedbackEl.classList.add("hidden");
  }

  renderizarKanban(filtrados);
}

function limparBusca() {
  const searchInput = document.getElementById("searchProjects");
  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }
  filtrarProjetos();
}

function isCardCollapsed(id) {
  if (cardCollapsedStates[id] !== undefined) {
    return cardCollapsedStates[id];
  }
  // Regra solicitada:
  // - "Novos do SketchUp" (status === "novo") começa ABERTO (false)
  // - De "Em Análise Técnica" para frente (em_analise, enviado, aprovado, rejeitado) começam FECHADOS (true)
  const p = allProjects.find(item => item.id === id);
  if (p) {
    const status = p.status || "novo";
    return status !== "novo";
  }
  return false;
}

function toggleCardCollapse(id, event) {
  if (event) event.stopPropagation();

  const current = isCardCollapsed(id);
  const next = !current;
  cardCollapsedStates[id] = next;

  const cardEl = document.querySelector(`.kanban-card[data-project-id="${id}"]`);
  if (cardEl) {
    if (typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.toggleCard(cardEl, next);
    } else {
      cardEl.classList.toggle("card-collapsed", next);
    }
  }
  atualizarTextoToggleTodos();
}

function atualizarTextoToggleTodos() {
  const allCards = document.querySelectorAll(".kanban-card");
  let anyExpanded = false;
  allCards.forEach(c => {
    if (!c.classList.contains("card-collapsed")) anyExpanded = true;
  });

  const txtEl = document.getElementById("txtToggleAll");
  if (txtEl) {
    txtEl.textContent = anyExpanded ? "Recolher Todos" : "Expandir Todos";
  }
}

function toggleTodosCards() {
  const allCards = document.querySelectorAll(".kanban-card");
  let anyExpanded = false;
  allCards.forEach(c => {
    if (!c.classList.contains("card-collapsed")) anyExpanded = true;
  });

  const nextState = anyExpanded; // Se algum estiver aberto, fecha todos. Se todos estiverem fechados, abre todos.

  allProjects.forEach(p => {
    cardCollapsedStates[p.id] = nextState;
  });

  allCards.forEach(c => {
    if (typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.toggleCard(c, nextState);
    } else {
      c.classList.toggle("card-collapsed", nextState);
    }
  });

  const txtEl = document.getElementById("txtToggleAll");
  if (txtEl) {
    txtEl.textContent = nextState ? "Expandir Todos" : "Recolher Todos";
  }
}

function renderizarEstatisticas(projetos) {
  const totalCount = projetos.length;
  const totalValor = projetos.reduce((acc, p) => acc + (Number(p.total_price) || 0), 0);
  const totalM2 = projetos.reduce((acc, p) => acc + (Number(p.internal_area_m2) || 0), 0);
  const aprovadosCount = projetos.filter(p => p.status === "aprovado").length;

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateCounter("statTotalCount", totalCount, { integer: true, duration: 0.8 });
    PapaSysAnimation.animateCounter("statTotalValor", totalValor, { format: "currency", duration: 1.0 });
    PapaSysAnimation.animateCounter("statTotalM2", totalM2, { format: "m2", duration: 0.9 });
    PapaSysAnimation.animateCounter("statAprovados", aprovadosCount, { integer: true, duration: 0.8 });
  } else {
    const countEl = document.getElementById("statTotalCount");
    const valorEl = document.getElementById("statTotalValor");
    const m2El = document.getElementById("statTotalM2");
    const aprovEl = document.getElementById("statAprovados");

    if (countEl) countEl.textContent = totalCount;
    if (valorEl) valorEl.textContent = Calculator.formatBRL(totalValor);
    if (m2El) m2El.textContent = totalM2.toFixed(1) + " m²";
    if (aprovEl) aprovEl.textContent = aprovadosCount;
  }
}

function renderizarKanban(projetos) {
  const colunas = {
    novo: document.getElementById("col-novo"),
    em_analise: document.getElementById("col-em_analise"),
    enviado: document.getElementById("col-enviado"),
    aprovado: document.getElementById("col-aprovado"),
    rejeitado: document.getElementById("col-rejeitado")
  };

  const emptyTexts = {
    novo: "Nenhum projeto novo",
    em_analise: "Nenhum em análise técnica",
    enviado: "Nenhuma proposta enviada",
    aprovado: "Nenhum projeto aprovado",
    rejeitado: "Nenhum projeto arquivado"
  };

  Object.keys(colunas).forEach(key => {
    if (colunas[key]) {
      colunas[key].innerHTML = "";
      const countEl = document.getElementById(`count-${key}`);
      if (countEl) countEl.textContent = "0";
    }
  });

  const contadores = { novo: 0, em_analise: 0, enviado: 0, aprovado: 0, rejeitado: 0 };

  projetos.forEach(p => {
    const status = p.status || "novo";
    const coluna = colunas[status] || colunas.novo;

    if (contadores[status] !== undefined) contadores[status]++;

    const isCollapsed = isCardCollapsed(p.id);

    let compactClass = "";
    if (status === "aprovado") compactClass = " card-compact-approved";
    if (status === "rejeitado") compactClass = " card-compact-archived";

    const card = document.createElement("div");
    card.className = `kanban-card${isCollapsed ? " card-collapsed" : ""}${compactClass}`;
    card.setAttribute("data-project-id", p.id);
    card.setAttribute("draggable", "true");

    card.ondragstart = (e) => {
      e.dataTransfer.setData("text/plain", p.id);
      card.style.opacity = "0.4";
    };
    card.ondragend = () => {
      card.style.opacity = "1";
    };

    const dataFormatada = new Date(p.created_at).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    let dimStr = "";
    if (p.pool_length_m && p.pool_width_m) {
      dimStr = `
        <div class="card-dims-badge" title="Dimensões: Comprimento × Largura × Profundidade">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.3 8.7 8.7 21.3c-.4.4-1 .4-1.4 0l-4.6-4.6c-.4-.4-.4-1 0-1.4L15.3 2.7c.4-.4 1-.4 1.4 0l4.6 4.6c.4.4.4 1 0 1.4z"></path>
            <path d="m14.5 3.5 2 2"></path>
            <path d="m11.5 6.5 2 2"></path>
            <path d="m8.5 9.5 2 2"></path>
          </svg>
          <span>${p.pool_length_m}m × ${p.pool_width_m}m × ${p.pool_depth_m || 1.4}m</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-top">
        <div class="card-top-left card-header-clickable" onclick="toggleCardCollapse('${p.id}', event)" title="Clique para abrir ou fechar detalhes">
          <div class="project-name">${escapeHtml(p.project_name)}</div>
          <div class="client-name">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.client_name || "Cliente não informado")}</span>
          </div>
        </div>
        <div class="card-top-right">
          <span class="badge badge-spec">${escapeHtml(p.tile_spec || "15x15")}</span>
          <button class="card-toggle-btn" onclick="toggleCardCollapse('${p.id}', event)" title="Abrir ou fechar detalhes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <!-- Resumo Compacto: visível quando o card estiver encolhido -->
      <div class="card-collapsed-summary">
        <div class="card-collapsed-price">${Calculator.formatBRL(p.total_price || 0)}</div>
        <div class="card-collapsed-meta">
          <span>${Number(p.internal_area_m2 || 0).toFixed(1)} m²</span>
          <select class="status-select status-select-${status}" onclick="event.stopPropagation()" onchange="alterarStatus('${p.id}', this.value)" style="padding: 2px 6px; font-size: 11px;">
            <option value="novo" ${status === "novo" ? "selected" : ""}>Novo</option>
            <option value="em_analise" ${status === "em_analise" ? "selected" : ""}>Em Análise</option>
            <option value="enviado" ${status === "enviado" ? "selected" : ""}>Enviado</option>
            <option value="aprovado" ${status === "aprovado" ? "selected" : ""}>Aprovado</option>
            <option value="rejeitado" ${status === "rejeitado" ? "selected" : ""}>Arquivado</option>
          </select>
        </div>
      </div>

      <!-- Corpo Detalhado: visível quando o card estiver aberto -->
      <div class="card-collapsible-body">
        ${dimStr}

        <div class="card-metrics">
          <div class="metric-item">
            <span class="metric-label">Área Interna</span>
            <span class="metric-val">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path>
              </svg>
              ${Number(p.internal_area_m2 || 0).toFixed(2)} m²
            </span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Borda Linear</span>
            <span class="metric-val">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3"></rect>
                <path d="M7 7h10v10H7z" stroke-dasharray="2 2"></path>
              </svg>
              ${Number(p.border_perimeter_linear_m || 0).toFixed(2)} m
            </span>
          </div>
        </div>

        <!-- Preço e Seletor de Status -->
        <div class="card-price-row">
          <div>
            <span class="card-price-label">Valor do Orçamento</span>
            <div class="card-price">${Calculator.formatBRL(p.total_price || 0)}</div>
          </div>
          <select class="status-select status-select-${status}" onclick="event.stopPropagation()" onchange="alterarStatus('${p.id}', this.value)" title="Mudar Status">
            <option value="novo" ${status === "novo" ? "selected" : ""}>Novo</option>
            <option value="em_analise" ${status === "em_analise" ? "selected" : ""}>Em Análise</option>
            <option value="enviado" ${status === "enviado" ? "selected" : ""}>Enviado</option>
            <option value="aprovado" ${status === "aprovado" ? "selected" : ""}>Aprovado</option>
            <option value="rejeitado" ${status === "rejeitado" ? "selected" : ""}>Arquivado</option>
          </select>
        </div>

        <!-- Botões de Ação Organizados (Dupla Balanceada 50/50) -->
        <div class="card-buttons-row">
          <button class="btn card-btn-edit" onclick="abrirOrcamento('${p.id}')" title="Editar Orçamento e Medidas">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Editar
          </button>
          <button class="btn card-btn-pdf" onclick="abrirProposta('${p.id}')" title="Ver Proposta Executiva em PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            Proposta
          </button>
        </div>

        <div class="card-footer">
          <span class="card-footer-date">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${dataFormatada}
          </span>
          <div class="card-footer-right">
            <span class="card-margin-pill">Margem: ${p.margin_percent || 25}%</span>
            <button class="card-btn-del" onclick="deletarProjeto('${p.id}')" title="Excluir Projeto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

    coluna.appendChild(card);
  });

  // Atualiza contadores e renderiza empty states elegantes para colunas vazias
  Object.keys(contadores).forEach(key => {
    const countEl = document.getElementById(`count-${key}`);
    if (countEl) countEl.textContent = contadores[key];

    if (contadores[key] === 0 && colunas[key]) {
      colunas[key].innerHTML = `
        <div class="column-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <line x1="9" y1="9" x2="15" y2="15"></line>
            <line x1="15" y1="9" x2="9" y2="15"></line>
          </svg>
          <span class="column-empty-text">${emptyTexts[key]}</span>
          <span class="column-empty-sub">Arraste um card para cá</span>
        </div>
      `;
    }
  });

  atualizarTextoToggleTodos();

  const allCards = document.querySelectorAll(".kanban-card");
  if (typeof PapaSysAnimation !== "undefined" && allCards.length > 0) {
    PapaSysAnimation.animateCards(allCards);
  }
}

// Drag & Drop
function permitirDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.add("drag-over");
}

function dragLeave(e) {
  const col = e.currentTarget;
  col.classList.remove("drag-over");
}

async function dropNoStatus(e, novoStatus) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove("drag-over");

  const projectId = e.dataTransfer.getData("text/plain");
  if (!projectId) return;

  await alterarStatus(projectId, novoStatus);
}

async function alterarStatus(projectId, novoStatus) {
  // Se movido para "novo", abre; de análise em diante, fecha por padrão
  cardCollapsedStates[projectId] = (novoStatus !== "novo");

  const sucesso = await DB.updateProject(projectId, { status: novoStatus });
  if (sucesso) {
    showToast(`Status atualizado para: ${formatarNomeStatus(novoStatus)}`, "success");
    await carregarProjetos();

    // Sutil feedback de encaixe no card
    const cardEl = document.querySelector(`.kanban-card[data-project-id="${projectId}"]`);
    if (cardEl && typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.animateCardDrop(cardEl);
    }
  } else {
    showToast("Erro ao atualizar status.", "error");
  }
}

function formatarNomeStatus(s) {
  const map = {
    novo: "Novo (SketchUp)",
    em_analise: "Em Análise Técnica",
    enviado: "Proposta Enviada",
    aprovado: "Aprovado / Obra",
    rejeitado: "Arquivado"
  };
  return map[s] || s;
}

function abrirOrcamento(id) {
  window.location.href = `orcamento.html?id=${id}`;
}

function abrirProposta(id) {
  window.open(`proposta.html?id=${id}`, "_blank");
}

async function deletarProjeto(id) {
  const confirmou = await PapaSysDialog.confirm({
    title: "Excluir Projeto de Piscina",
    message: "Tem certeza que deseja excluir permanentemente este projeto de piscina? Esta ação não pode ser desfeita.",
    confirmText: "Excluir Projeto",
    cancelText: "Cancelar",
    type: "danger"
  });

  if (confirmou) {
    const cardEl = document.querySelector(`.kanban-card[data-project-id="${id}"]`);
    if (cardEl && typeof PapaSysAnimation !== "undefined") {
      await PapaSysAnimation.animateCardDelete(cardEl);
    }

    const ok = await DB.deleteProject(id);
    if (ok) {
      delete cardCollapsedStates[id];
      showToast("Projeto excluído com sucesso.", "info");
      await carregarProjetos();
    } else {
      showToast("Erro ao excluir projeto.", "error");
    }
  }
}


function showToast(msg, tipo = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  toast.textContent = msg;

  container.appendChild(toast);

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateToastIn(toast);
    setTimeout(() => {
      PapaSysAnimation.animateToastOut(toast, () => toast.remove());
    }, 3800);
  } else {
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 3800);
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

// Modal de Simulação de Envio 3D
function abrirModalSimulacao() {
  const modal = document.getElementById("modalSimulacao");
  if (modal) {
    modal.classList.remove("hidden");
    const card = modal.querySelector(".modal-content");
    if (typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.animateModalIn(modal, card);
    }
  }
}

function fecharModalSimulacao() {
  const modal = document.getElementById("modalSimulacao");
  if (modal) {
    const card = modal.querySelector(".modal-content");
    if (typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.animateModalOut(modal, card, () => {
        modal.classList.add("hidden");
      });
    } else {
      modal.classList.add("hidden");
    }
  }
}

async function submeterSimulacao(e) {
  e.preventDefault();

  const nome = document.getElementById("simNome").value;
  const cliente = document.getElementById("simCliente").value;
  const comp = parseFloat(document.getElementById("simComp").value) || 6.0;
  const larg = parseFloat(document.getElementById("simLarg").value) || 3.0;
  const prof = parseFloat(document.getElementById("simProf").value) || 1.4;
  const spec = document.getElementById("simSpec").value;
  const margem = parseFloat(document.getElementById("simMargem").value) || 25.0;

  const fundoArea = comp * larg;
  const paredesArea = 2 * (comp + larg) * prof;
  const areaTotal = fundoArea + paredesArea;
  const bordaLinear = 2 * (comp + larg);

  const calc = Calculator.calcularOrcamento({
    internal_area_m2: areaTotal,
    border_perimeter_linear_m: bordaLinear,
    tile_spec: spec,
    margin_percent: margem
  });

  const novoProjeto = {
    project_name: nome,
    client_name: cliente,
    tile_spec: spec,
    internal_area_m2: areaTotal,
    border_perimeter_linear_m: bordaLinear,
    pool_length_m: comp,
    pool_width_m: larg,
    pool_depth_m: prof,
    total_cost: calc.totalCost,
    total_price: calc.totalPrice,
    margin_percent: margem,
    status: "novo",
    notes: `Simulação de envio direto do SketchUp 3D para teste do PapaSys.`
  };

  const salvo = await DB.saveProject(novoProjeto, calc.items);

  if (salvo) {
    showToast("Projeto simulado gravado com sucesso no Supabase!", "success");
    fecharModalSimulacao();
    await carregarProjetos();
  } else {
    showToast("Erro ao gravar projeto simulado.", "error");
  }
}
