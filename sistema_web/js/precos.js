// ==============================================================================
// CONTROLLER DA MATRIZ DE PREÇOS & INSUMOS - PAPASYS
// Edição inline e via modal com lápis, filtros de categoria, busca e restauração padrão
// ==============================================================================

let priceItems = [];
let currentCategoryFilter = "todos";
let searchTerm = "";
let currentPage = 1;
let pageSize = 9; // Padrão de 9 itens para encaixe perfeito no layout sem rolagem

document.addEventListener("DOMContentLoaded", async () => {
  await carregarPrecos();
});

async function carregarPrecos() {
  priceItems = await DB.getPriceTable();

  // Garante IDs únicos para todos os itens
  priceItems.forEach((p, idx) => {
    if (!p.id) p.id = "p_" + idx;
  });

  renderizarTabela();
  atualizarEstatisticas();
  atualizarContadoresCategorias();

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.initFormPage();
  }
}

// Atualiza os 4 cards executivos superiores (KPIs)
function atualizarEstatisticas() {
  const total = priceItems.length;
  const mats = priceItems.filter(it => it.category === "material").length;
  const insumos = priceItems.filter(it => it.category === "insumo").length;
  const servicos = priceItems.filter(it => it.category === "mao_de_obra" || it.category === "borda").length;

  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateCounter("statPrecosTotal", total, { integer: true, duration: 0.6 });
    PapaSysAnimation.animateCounter("statPrecosRevestimentos", mats, { integer: true, duration: 0.7 });
    PapaSysAnimation.animateCounter("statPrecosInsumos", insumos, { integer: true, duration: 0.7 });
    PapaSysAnimation.animateCounter("statPrecosMaoObra", servicos, { integer: true, duration: 0.7 });
  } else {
    const elTot = document.getElementById("statPrecosTotal");
    const elMat = document.getElementById("statPrecosRevestimentos");
    const elIns = document.getElementById("statPrecosInsumos");
    const elMao = document.getElementById("statPrecosMaoObra");
    if (elTot) elTot.textContent = total;
    if (elMat) elMat.textContent = mats;
    if (elIns) elIns.textContent = insumos;
    if (elMao) elMao.textContent = servicos;
  }
}

// Atualiza contadores numéricos nas abas de categoria
function atualizarContadoresCategorias() {
  const counts = {
    todos: priceItems.length,
    material: 0,
    insumo: 0,
    borda: 0,
    mao_de_obra: 0
  };

  priceItems.forEach(it => {
    const cat = it.category || "material";
    if (counts[cat] !== undefined) counts[cat]++;
  });

  Object.keys(counts).forEach(k => {
    const el = document.getElementById(`tab-cat-${k}`);
    if (el) el.textContent = counts[k];
  });
}

function filtrarCategoria(cat, btn) {
  currentCategoryFilter = cat;
  currentPage = 1;
  document.querySelectorAll(".segmented-tabs-container .tab-pill").forEach(p => p.classList.remove("active"));
  if (btn) btn.classList.add("active");
  renderizarTabela();
}

function filtrarTabela() {
  const inp = document.getElementById("searchPrices");
  searchTerm = inp ? inp.value.trim().toLowerCase() : "";
  currentPage = 1;
  const clearBtn = document.getElementById("btnClearPriceSearch");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", searchTerm === "");
  }
  renderizarTabela();
}

function limparBuscaPrecos() {
  const inp = document.getElementById("searchPrices");
  if (inp) {
    inp.value = "";
    inp.focus();
  }
  searchTerm = "";
  currentPage = 1;
  const clearBtn = document.getElementById("btnClearPriceSearch");
  if (clearBtn) clearBtn.classList.add("hidden");
  renderizarTabela();
}

// Renderiza a lista de materiais e serviços na tabela com suporte à paginação
function renderizarTabela() {
  const tbody = document.getElementById("tabelaPrecosTbody");
  const pagContainer = document.getElementById("tablePagination");
  if (!tbody) return;
  tbody.innerHTML = "";

  let itensFiltrados = priceItems;

  // Filtro de categoria
  if (currentCategoryFilter !== "todos") {
    itensFiltrados = itensFiltrados.filter(it => it.category === currentCategoryFilter);
  }

  // Filtro de pesquisa
  if (searchTerm !== "") {
    itensFiltrados = itensFiltrados.filter(it => {
      const nome = (it.name || "").toLowerCase();
      const cat = (it.category || "").toLowerCase();
      const unit = (it.unit || "").toLowerCase();
      return nome.includes(searchTerm) || cat.includes(searchTerm) || unit.includes(searchTerm);
    });
  }

  const totalItens = itensFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / pageSize));

  // Ajusta a página atual se estiver fora dos limites
  if (currentPage > totalPaginas) currentPage = totalPaginas;
  if (currentPage < 1) currentPage = 1;

  if (totalItens === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-dim); margin-bottom: 8px;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <div style="font-size: 14px; font-weight: 700; color: var(--text-secondary);">Nenhum material ou serviço encontrado</div>
          <div style="font-size: 12px; color: var(--text-dim); margin-top: 4px;">Tente outro termo de busca ou altere a categoria de filtro selecionada.</div>
        </td>
      </tr>
    `;
    if (pagContainer) {
      pagContainer.innerHTML = `
        <div class="pagination-left">
          <span class="pagination-info">Nenhum item cadastrado ou encontrado</span>
        </div>
      `;
    }
    return;
  }

  // Slice para exibir estritamente os itens da página corrente
  const inicio = (currentPage - 1) * pageSize;
  const fim = Math.min(inicio + pageSize, totalItens);
  const itensPagina = itensFiltrados.slice(inicio, fim);

  itensPagina.forEach((p) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-item-id", p.id);

    const unitSuffix = (p.category === "borda") ? "m" : "m²";

    tr.innerHTML = `
      <td>${getCatBadge(p.category)}</td>
      <td>
        <div style="font-weight: 700; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(p.name)}</div>
        <div style="font-size: 11px; color: var(--text-dim); margin-top: 1px;">Referência para cálculo automático 3D</div>
      </td>
      <td style="text-align: center;">
        <span class="table-unit-tag">${escapeHtml(p.unit)}</span>
      </td>
      <td style="text-align: right;">
        <div class="input-with-affix" title="Custo Direto Unitário em Reais">
          <span class="input-affix-prefix">R$</span>
          <input type="number" step="0.5" class="input-affix-control" value="${Number(p.unit_cost).toFixed(2)}" onchange="atualizarPreco('${p.id}', 'unit_cost', this.value)">
        </div>
      </td>
      <td style="text-align: right;">
        <div class="input-with-affix" title="Margem de Quebra/Perda Técnica Padrão">
          <input type="number" step="0.5" class="input-affix-control" value="${p.default_waste_percent || 0}" onchange="atualizarPreco('${p.id}', 'default_waste_percent', this.value)">
          <span class="input-affix-suffix">%</span>
        </div>
      </td>
      <td style="text-align: right;">
        <div class="input-with-affix" title="Rendimento por unidade do insumo/serviço">
          <input type="number" step="0.5" class="input-affix-control" value="${p.coverage_per_unit || 1}" onchange="atualizarPreco('${p.id}', 'coverage_per_unit', this.value)">
          <span class="input-affix-suffix">${unitSuffix}</span>
        </div>
      </td>
      <td style="text-align: center;">
        <div class="table-actions-cell">
          <button class="btn-action-edit" onclick="editarPreco('${p.id}')" title="Editar Material / Serviço">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-action-delete" onclick="removerPreco('${p.id}')" title="Excluir da Tabela">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  renderizarControlesPaginacao(totalItens, totalPaginas, inicio, fim);
}

// Renderiza a barra inferior com status de itens e botões de página
function renderizarControlesPaginacao(totalItens, totalPaginas, inicio, fim) {
  const pagContainer = document.getElementById("tablePagination");
  if (!pagContainer) return;

  let botoesPaginasHtml = "";
  for (let i = 1; i <= totalPaginas; i++) {
    botoesPaginasHtml += `
      <button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="mudarPagina(${i})" title="Página ${i}">
        ${i}
      </button>
    `;
  }

  const prevDisabled = currentPage <= 1 ? "disabled" : "";
  const nextDisabled = currentPage >= totalPaginas ? "disabled" : "";

  pagContainer.innerHTML = `
    <div class="pagination-left">
      <div class="pagination-info">
        Exibindo <strong>${inicio + 1}</strong> a <strong>${fim}</strong> de <strong>${totalItens}</strong> ${totalItens === 1 ? 'item' : 'materiais'}
      </div>
      <div class="pagination-pagesize">
        <label for="selectPageSize">Por página:</label>
        <select id="selectPageSize" onchange="mudarPageSize(this.value)">
          <option value="9" ${pageSize === 9 ? 'selected' : ''}>9</option>
          <option value="18" ${pageSize === 18 ? 'selected' : ''}>18</option>
          <option value="27" ${pageSize === 27 ? 'selected' : ''}>27</option>
          <option value="999" ${pageSize >= 999 ? 'selected' : ''}>Todos</option>
        </select>
      </div>
    </div>

    <div class="pagination-controls">
      <button class="pagination-btn pagination-btn-nav" ${prevDisabled} onclick="mudarPagina(${currentPage - 1})" title="Página Anterior">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        Anterior
      </button>

      <div class="pagination-pages">
        ${botoesPaginasHtml}
      </div>

      <button class="pagination-btn pagination-btn-nav" ${nextDisabled} onclick="mudarPagina(${currentPage + 1})" title="Próxima Página">
        Próximo
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  `;
}

function mudarPagina(novaPagina) {
  currentPage = novaPagina;
  renderizarTabela();
  if (typeof gsap !== "undefined") {
    gsap.from("#tabelaPrecosTbody tr", {
      opacity: 0,
      y: 6,
      stagger: 0.03,
      duration: 0.18,
      ease: "power1.out"
    });
  }
}

function mudarPageSize(novoTamanho) {
  pageSize = parseInt(novoTamanho, 10) || 5;
  currentPage = 1;
  renderizarTabela();
}

// Atualização inline direta via inputs da tabela
function atualizarPreco(id, campo, valor) {
  const item = priceItems.find(it => it.id === id);
  if (item) {
    item[campo] = parseFloat(valor) || 0;
    showToast(`Parâmetro de "${item.name}" atualizado. Clique em Salvar Alterações ao concluir!`, "info");
  }
}

// Modal completo de Edição ao clicar no Lápis (✏️)
function editarPreco(id) {
  const item = priceItems.find(it => it.id === id);
  if (!item) return;

  PapaSysDialog._createModal({
    title: "Editar Material ou Serviço",
    message: "Altere o nome, categoria, unidade, custo direto ou parâmetros de rendimento deste item.",
    customBody: `
      <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
        <div class="form-group">
          <label class="form-label">Nome / Descrição do Material ou Serviço</label>
          <input type="text" id="dlgEditNome" class="form-input" value="${escapeHtml(item.name)}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select id="dlgEditCat" class="form-select">
              <option value="material" ${item.category === "material" ? "selected" : ""}>Revestimento / Pastilha</option>
              <option value="insumo" ${item.category === "insumo" ? "selected" : ""}>Insumo / Argamassa / Rejunte</option>
              <option value="borda" ${item.category === "borda" ? "selected" : ""}>Borda Atérmica / Peito de Pombo</option>
              <option value="mao_de_obra" ${item.category === "mao_de_obra" ? "selected" : ""}>Mão de Obra Especializada</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Unidade de Medida</label>
            <select id="dlgEditUnidade" class="form-select">
              <option value="m²" ${item.unit === "m²" ? "selected" : ""}>m² (metro quadrado)</option>
              <option value="m" ${item.unit === "m" ? "selected" : ""}>m (metro linear)</option>
              <option value="saco 20kg" ${item.unit === "saco 20kg" ? "selected" : ""}>saco 20kg</option>
              <option value="balde 5kg" ${item.unit === "balde 5kg" ? "selected" : ""}>balde 5kg</option>
              <option value="un" ${item.unit === "un" ? "selected" : ""}>un (unidade)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Custo Direto (R$)</label>
            <input type="number" id="dlgEditPreco" class="form-input" step="0.5" value="${item.unit_cost}" />
          </div>
          <div class="form-group">
            <label class="form-label">Quebra Padrão (%)</label>
            <input type="number" id="dlgEditQuebra" class="form-input" step="0.5" value="${item.default_waste_percent || 0}" />
          </div>
          <div class="form-group">
            <label class="form-label">Rendimento (m² / Un)</label>
            <input type="number" id="dlgEditRendimento" class="form-input" step="0.5" value="${item.coverage_per_unit || 1}" />
          </div>
        </div>
      </div>
    `,
    confirmText: "Salvar Alterações",
    cancelText: "Cancelar",
    type: "info",
    onConfirm: () => {
      const nome = document.getElementById("dlgEditNome")?.value?.trim();
      if (!nome) {
        showToast("O nome do material/serviço não pode ficar vazio.", "error");
        return;
      }
      const cat = document.getElementById("dlgEditCat")?.value || "material";
      const unidade = document.getElementById("dlgEditUnidade")?.value || "m²";
      const preco = parseFloat(document.getElementById("dlgEditPreco")?.value) || 0;
      const quebra = parseFloat(document.getElementById("dlgEditQuebra")?.value) || 0;
      const rendimento = parseFloat(document.getElementById("dlgEditRendimento")?.value) || 1;

      item.name = nome;
      item.category = cat;
      item.unit = unidade;
      item.unit_cost = preco;
      item.default_waste_percent = quebra;
      item.coverage_per_unit = rendimento;

      renderizarTabela();
      atualizarEstatisticas();
      atualizarContadoresCategorias();

      const row = document.querySelector(`tr[data-item-id="${id}"]`);
      if (row && typeof PapaSysAnimation !== "undefined") {
        PapaSysAnimation.animateTableRow(row);
      }

      showToast(`Item "${nome}" atualizado com sucesso!`, "success");
    }
  });

  setTimeout(() => {
    document.getElementById("dlgEditNome")?.focus();
    document.getElementById("dlgEditNome")?.select();
  }, 60);
}

// Modal de Criação de Novo Item
function adicionarNovoPreco() {
  PapaSysDialog._createModal({
    title: "Novo Material ou Serviço",
    message: "Cadastre um novo item na matriz de custos de referência do PapaSys.",
    customBody: `
      <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
        <div class="form-group">
          <label class="form-label">Nome / Descrição do Material ou Serviço</label>
          <input type="text" id="dlgItemNome" class="form-input" placeholder="Ex: Pastilha Porcelanizada 15x15 cm" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select id="dlgItemCat" class="form-select">
              <option value="material">Revestimento / Pastilha</option>
              <option value="insumo">Insumo / Argamassa / Rejunte</option>
              <option value="borda">Borda Atérmica / Peito de Pombo</option>
              <option value="mao_de_obra">Mão de Obra Especializada</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Unidade de Medida</label>
            <select id="dlgItemUnidade" class="form-select">
              <option value="m²">m² (metro quadrado)</option>
              <option value="m">m (metro linear)</option>
              <option value="saco 20kg">saco 20kg</option>
              <option value="balde 5kg">balde 5kg</option>
              <option value="un">un (unidade)</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Custo Direto Unitário (R$)</label>
            <input type="number" id="dlgItemPreco" class="form-input" step="0.5" value="50.00" />
          </div>
          <div class="form-group">
            <label class="form-label">Quebra Padrão (%)</label>
            <input type="number" id="dlgItemQuebra" class="form-input" step="0.5" value="5.0" />
          </div>
          <div class="form-group">
            <label class="form-label">Rendimento (m² / Un)</label>
            <input type="number" id="dlgItemRendimento" class="form-input" step="0.5" value="1.0" />
          </div>
        </div>
      </div>
    `,
    confirmText: "Adicionar Item",
    cancelText: "Cancelar",
    type: "info",
    onConfirm: () => {
      const nome = document.getElementById("dlgItemNome")?.value?.trim();
      if (!nome) {
        showToast("O nome do material/serviço é obrigatório.", "error");
        return;
      }
      const categoria = document.getElementById("dlgItemCat")?.value || "material";
      const unidade = document.getElementById("dlgItemUnidade")?.value || "m²";
      const preco = parseFloat(document.getElementById("dlgItemPreco")?.value) || 0.0;
      const quebra = parseFloat(document.getElementById("dlgItemQuebra")?.value) || 0.0;
      const rendimento = parseFloat(document.getElementById("dlgItemRendimento")?.value) || 1.0;

      const novoId = "p_" + Date.now();
      priceItems.unshift({
        id: novoId,
        category: categoria,
        name: nome,
        unit: unidade,
        unit_cost: preco,
        default_waste_percent: quebra,
        coverage_per_unit: rendimento,
        active: true
      });

      currentPage = 1;
      renderizarTabela();
      atualizarEstatisticas();
      atualizarContadoresCategorias();

      const row = document.querySelector(`tr[data-item-id="${novoId}"]`);
      if (row && typeof PapaSysAnimation !== "undefined") {
        PapaSysAnimation.animateTableRow(row);
      }
      showToast(`Item "${nome}" adicionado com sucesso!`, "success");
    }
  });

  setTimeout(() => {
    document.getElementById("dlgItemNome")?.focus();
  }, 60);
}

// Exclusão de item com confirmação e animação suave
async function removerPreco(id) {
  const item = priceItems.find(it => it.id === id);
  const nome = item ? item.name : "este item";

  const confirmou = await PapaSysDialog.confirm({
    title: "Remover Item da Tabela",
    message: `Tem certeza que deseja remover "${nome}" da tabela padrão de custos? Esta ação não pode ser desfeita após salvar.`,
    confirmText: "Remover Item",
    cancelText: "Cancelar",
    type: "danger"
  });

  if (confirmou) {
    const row = document.querySelector(`tr[data-item-id="${id}"]`);
    if (row && typeof gsap !== "undefined") {
      await new Promise(r => {
        gsap.to(row, { opacity: 0, x: 30, duration: 0.22, ease: "power2.in", onComplete: r });
      });
    }

    priceItems = priceItems.filter(it => it.id !== id);

    // Ajusta a página atual se a página anterior tiver ficado vazia
    const totalItens = priceItems.length;
    const totalPaginas = Math.max(1, Math.ceil(totalItens / pageSize));
    if (currentPage > totalPaginas) currentPage = totalPaginas;

    renderizarTabela();
    atualizarEstatisticas();
    atualizarContadoresCategorias();
    showToast(`"${nome}" removido da tabela.`, "info");
  }
}

// Restaura os 9 itens padrão originais
async function restaurarPadroesPrecos() {
  const confirmou = await PapaSysDialog.confirm({
    title: "Restaurar Padrões de Fábrica",
    message: "Deseja restaurar todos os materiais e serviços para os valores e rendimentos originais do PapaSys? Suas edições atuais serão substituídas.",
    confirmText: "Restaurar Padrão",
    cancelText: "Cancelar",
    type: "warning"
  });

  if (confirmou) {
    const defaultPrices = [
      { id: "1", category: "material", name: "Pastilha Cerâmica 15x15 cm", unit: "m²", unit_cost: 98.0, default_waste_percent: 5.0, coverage_per_unit: 1.0 },
      { id: "2", category: "material", name: "Pastilha Porcelana 10x10 cm", unit: "m²", unit_cost: 85.0, default_waste_percent: 5.0, coverage_per_unit: 1.0 },
      { id: "3", category: "material", name: "Porcelanato 20x20 cm", unit: "m²", unit_cost: 78.0, default_waste_percent: 7.0, coverage_per_unit: 1.0 },
      { id: "4", category: "insumo", name: "Argamassa AC-III Piscina (Saco 20kg)", unit: "saco 20kg", unit_cost: 42.0, default_waste_percent: 5.0, coverage_per_unit: 4.0 },
      { id: "5", category: "insumo", name: "Rejunte Especial Piscina (Balde 5kg)", unit: "balde 5kg", unit_cost: 68.0, default_waste_percent: 5.0, coverage_per_unit: 10.0 },
      { id: "6", category: "borda", name: "Pedra Atérmica Boleada para Borda", unit: "m", unit_cost: 130.0, default_waste_percent: 3.0, coverage_per_unit: 1.0 },
      { id: "7", category: "mao_de_obra", name: "Assentamento de Pastilhas / Revestimento", unit: "m²", unit_cost: 75.0, default_waste_percent: 0.0, coverage_per_unit: 1.0 },
      { id: "8", category: "mao_de_obra", name: "Instalação de Borda Atérmica", unit: "m", unit_cost: 45.0, default_waste_percent: 0.0, coverage_per_unit: 1.0 },
      { id: "9", category: "mao_de_obra", name: "Impermeabilização com Membrana Polimérica", unit: "m²", unit_cost: 55.0, default_waste_percent: 0.0, coverage_per_unit: 1.0 }
    ];

    priceItems = JSON.parse(JSON.stringify(defaultPrices));
    localStorage.setItem(DB.STORAGE_KEY_PRICES, JSON.stringify(priceItems));

    currentPage = 1;
    renderizarTabela();
    atualizarEstatisticas();
    atualizarContadoresCategorias();

    showToast("Tabela de preços restaurada para o padrão de fábrica!", "success");
  }
}

// Salva alterações no Supabase e no LocalStorage
async function salvarTabelaPrecos() {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.from("price_table").upsert(priceItems);
      if (error) throw error;
    } catch (e) {
      console.warn("[DB Precos] Erro no Supabase, salvando localmente:", e);
    }
  }

  localStorage.setItem(DB.STORAGE_KEY_PRICES, JSON.stringify(priceItems));
  showToast("Tabela de preços e rendimentos salva com sucesso!", "success");
}

// Badges elegantes com ícones SVG
function getCatBadge(cat) {
  switch (cat) {
    case "material":
      return `
        <span class="badge badge-cat-material" title="Revestimento modular para piscina">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path>
          </svg>
          Revestimento
        </span>
      `;
    case "insumo":
      return `
        <span class="badge badge-cat-insumo" title="Insumo técnico de assentamento ou rejunte">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          </svg>
          Insumo
        </span>
      `;
    case "borda":
      return `
        <span class="badge badge-cat-borda" title="Pedras e acabamentos de borda perimetral">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3"></rect>
            <path d="M7 7h10v10H7z" stroke-dasharray="2 2"></path>
          </svg>
          Borda
        </span>
      `;
    case "mao_de_obra":
      return `
        <span class="badge badge-cat-mao_de_obra" title="Serviço especializado de mão de obra">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
          </svg>
          Mão de Obra
        </span>
      `;
    default:
      return `<span class="badge badge-cat-insumo">${escapeHtml(cat)}</span>`;
  }
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
