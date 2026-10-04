// ==============================================================================
// CONTROLADOR PRINCIPAL DO SISTEMA DE ORÇAMENTOS iGUi (SEÇÕES 1, 2, 3, 10)
// Páginas por Fluxo: Prévia -> Galga -> Desenho Técnico
// Divisões: iGUi Sob Medida | iGUi Incorporadora | iGUi Internacional
// ==============================================================================

const App = {
  activeDivision: "sob_medida", // 'sob_medida', 'incorporadora', 'internacional', 'dashboard_geral'
  activeStage: "previa",       // 'previa', 'galga', 'desenho_tecnico'
  searchTerm: "",
  budgets: [],
  selectedBudgetForAction: null,

  // Estado de Paginação, Modo de Visualização e Filtros
  currentPage: 1,
  itemsPerPage: 10,
  viewMode: "table", // 'table' (orçamento por linha) ou 'cards'
  statusFilter: "all", // 'all', 'em_aberto', 'em_analise', 'aprovado'
  sortBy: "recent", // 'recent', 'oldest', 'price_desc', 'price_asc', 'code', 'client'

  // Gestão de Usuários & Modal
  userModalTab: "switch", // 'switch' | 'manage' | 'edit'
  editingUserId: null,
  selectedAvatarColor: "#0284c7",

  // Inicialização do aplicativo
  async init() {
    // 1. Guarda de autenticação: redireciona para login se não houver sessão ativa
    if (!Auth.isLoggedIn()) {
      window.location.href = "login.html";
      return;
    }

    App.setupEventListeners();

    // Restaura preferências locais de visualização e itens por página
    try {
      const savedMode = localStorage.getItem("igui_view_mode");
      if (savedMode && (savedMode === "table" || savedMode === "cards")) {
        App.viewMode = savedMode;
      }
      const savedLimit = localStorage.getItem("igui_items_per_page");
      if (savedLimit) {
        App.itemsPerPage = parseInt(savedLimit) || 10;
      }
    } catch (e) {}

    App.updateUserInterface();

    // Determina a divisão inicial permitida para o usuário ativo
    const user = Auth.getCurrentUser();
    if (user.role !== "admin") {
      const allowed = user.allowed_divisions || ["sob_medida"];
      App.activeDivision = allowed[0] || "sob_medida";
    }

    // Carrega parâmetros da URL se houver (ex: ?divisao=sob_medida&etapa=previa)
    const params = new URLSearchParams(window.location.search);
    if (params.get("divisao") && Auth.canAccessDivision(params.get("divisao"))) {
      App.activeDivision = params.get("divisao");
    }
    if (params.get("etapa") && Auth.canAccessStage(params.get("etapa"))) {
      App.activeStage = params.get("etapa");
    }

    // Sincroniza classes visuais ativas nos seletores
    document.querySelectorAll(".division-tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-division") === App.activeDivision);
    });
    document.querySelectorAll(".stage-pill-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-stage") === App.activeStage);
    });

    await App.loadBudgets();
  },

  // Configura escutadores de eventos
  setupEventListeners() {
    window.addEventListener("igui-user-changed", async () => {
      App.updateUserInterface();
      const user = Auth.getCurrentUser();
      if (!Auth.canAccessDivision(App.activeDivision)) {
        App.activeDivision = (user.allowed_divisions || ["sob_medida"])[0] || "sob_medida";
      }
      await App.loadBudgets();
    });

    const searchInput = document.getElementById("searchBudgets");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        App.searchTerm = e.target.value.toLowerCase().trim();
        App.renderContent();
      });
    }

    // Atalhos de teclado
    document.addEventListener("keydown", (e) => {
      if ((e.key === "/" || (e.ctrlKey && e.key.toLowerCase() === "k")) && document.activeElement !== searchInput) {
        e.preventDefault();
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      } else if (e.key === "Escape") {
        App.closeAllModals();
      }
    });
  },

  // Atualiza a barra de navegação superior e dados do usuário ativo
  updateUserInterface() {
    const user = Auth.getCurrentUser();
    const isAdmin = Auth.isAdmin();

    // Nome e Cargo no topo
    const lblNome = document.getElementById("navUserName");
    const lblCargo = document.getElementById("navUserRole");
    const avatar = document.getElementById("navUserAvatar");

    if (lblNome) lblNome.textContent = user.name;
    if (lblCargo) {
      lblCargo.textContent = isAdmin ? "Diretoria / Admin" : "Projetista";
      lblCargo.className = `badge-user-role ${isAdmin ? 'admin' : ''}`;
    }
    if (avatar) {
      const parts = (user.name || "U").trim().split(" ");
      avatar.textContent = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
      if (user.avatar_color) avatar.style.background = user.avatar_color;
    }

    // Controle de Visibilidade das Divisões (Seção 3)
    // "O usuário Victor Lourenço atende apenas iGUi Sob Medida, portanto só enxerga essa divisão."
    const allowed = user.allowed_divisions || ["sob_medida"];

    const tabSob = document.getElementById("tabDivSobMedida");
    const tabInc = document.getElementById("tabDivIncorporadora");
    const tabInt = document.getElementById("tabDivInternacional");
    const tabDash = document.getElementById("tabDivDashboardGeral");
    const linkPrecos = document.getElementById("linkConfigPrecos");
    const btnNovo = document.getElementById("btnNovoOrcamento");

    if (tabSob) tabSob.style.display = (isAdmin || allowed.includes("sob_medida")) ? "flex" : "none";
    if (tabInc) tabInc.style.display = (isAdmin || allowed.includes("incorporadora")) ? "flex" : "none";
    if (tabInt) tabInt.style.display = (isAdmin || allowed.includes("internacional")) ? "flex" : "none";
    
    // Apenas Administrador/Diretor vê o Dashboard Geral, Configurações de Preço e Gestão de Usuários (Seção 3 e 9)
    const btnAdminUsers = document.getElementById("btnAdminUsuarios");
    if (tabDash) tabDash.style.display = isAdmin ? "flex" : "none";
    if (linkPrecos) linkPrecos.style.display = isAdmin ? "inline-flex" : "none";
    if (btnAdminUsers) btnAdminUsers.style.display = isAdmin ? "inline-flex" : "none";
  },

  // Selecionar Divisão com Micro-interação e Transição Fluida (Seção 2)
  async selectDivision(divisionKey) {
    if (divisionKey === "dashboard_geral") {
      if (!Auth.isAdmin()) {
        App.showToast("Acesso restrito: somente Administradores podem acessar o Dashboard Geral.", "error");
        return;
      }
      App.activeDivision = "dashboard_geral";
    } else {
      if (!Auth.canAccessDivision(divisionKey)) {
        App.showToast(`Acesso restrito: o usuário ${Auth.getCurrentUser().name} não tem acesso à divisão ${divisionKey}.`, "error");
        return;
      }
      App.activeDivision = divisionKey;
    }

    App.currentPage = 1;

    // Atualiza estado visual das abas de divisão com feedback tátil de escala
    document.querySelectorAll(".division-tab-btn").forEach(btn => {
      const isActive = btn.getAttribute("data-division") === App.activeDivision;
      btn.classList.toggle("active", isActive);
      if (isActive && typeof gsap !== "undefined") {
        gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.24, ease: "back.out(2)" });
      }
    });

    // Se saiu do dashboard geral, garante que a barra de etapas seja visível
    const stageBar = document.getElementById("stageNavigationWrap");
    if (stageBar) {
      stageBar.style.display = App.activeDivision === "dashboard_geral" ? "none" : "flex";
    }

    await App.loadBudgets();
  },

  // Selecionar Etapa/Página do Fluxo com Animação (Seção 1)
  async selectStage(stageKey) {
    if (!Auth.canAccessStage(stageKey)) {
      App.showToast(`Acesso restrito à etapa ${stageKey}.`, "error");
      return;
    }
    App.activeStage = stageKey;
    App.currentPage = 1;

    document.querySelectorAll(".stage-pill-btn").forEach(btn => {
      const isActive = btn.getAttribute("data-stage") === stageKey;
      btn.classList.toggle("active", isActive);
      if (isActive && typeof gsap !== "undefined") {
        gsap.fromTo(btn, { scale: 0.97 }, { scale: 1, duration: 0.22, ease: "back.out(1.5)" });
      }
    });

    App.updateCounters();
    App.renderContent(true);
  },

  // Carrega orçamentos do banco de dados com animação Skeleton de alta fidelidade
  async loadBudgets() {
    const mainWrap = document.getElementById("mainContentArea");
    if (mainWrap && typeof PapaSysAnimation !== "undefined") {
      const nomesDivisao = {
        sob_medida: "iGUi Sob Medida",
        incorporadora: "iGUi Incorporadora",
        internacional: "iGUi Internacional",
        dashboard_geral: "Dashboard Geral"
      };
      const labelDiv = nomesDivisao[App.activeDivision] || "Orçamentos";
      PapaSysAnimation.renderSkeletonLoading(mainWrap, `Carregando ${labelDiv} e quantitativos 3D...`);
    }

    App.budgets = await DB.getBudgets();
    App.updateCounters();
    App.renderContent(true);
  },

  // Atualiza os contadores das etapas e abas
  updateCounters() {
    if (App.activeDivision === "dashboard_geral") return;

    const divBudgets = App.budgets.filter(b => b.division === App.activeDivision);
    const countPrevia = divBudgets.filter(b => b.stage === "previa").length;
    const countGalga = divBudgets.filter(b => b.stage === "galga").length;
    const countDesenho = divBudgets.filter(b => b.stage === "desenho_tecnico").length;

    const elPrevia = document.getElementById("counterStagePrevia");
    const elGalga = document.getElementById("counterStageGalga");
    const elDesenho = document.getElementById("counterStageDesenho");

    if (elPrevia) elPrevia.textContent = countPrevia;
    if (elGalga) elGalga.textContent = countGalga;
    if (elDesenho) elDesenho.textContent = countDesenho;

    // Atualiza o título e subtítulo da página ativa de forma limpa e sem entidades cruas
    const titulosDivisao = {
      sob_medida: "iGUi Sob Medida",
      incorporadora: "iGUi Incorporadora",
      internacional: "iGUi Internacional",
      dashboard_geral: "Dashboard Geral da Diretoria"
    };

    const nomesEtapas = {
      previa: "1. Prévia (Estimativa Preliminar +5%)",
      galga: "2. Galga (Quadro Técnico de Pré-venda 0%)",
      desenho_tecnico: "3. Desenho Técnico (Venda Executiva)"
    };

    const subEtapas = {
      previa: "Orçamentos preliminares com margem comercial de +5%.",
      galga: "Quadro técnico de engenharia pré-venda (0% margem).",
      desenho_tecnico: "Documentação técnica executiva da venda (exclusivo do Sistema Web)."
    };

    const headerTitle = document.getElementById("pageCurrentTitle");
    const headerSub = document.getElementById("pageCurrentSub");

    if (headerTitle) {
      if (App.activeDivision === "dashboard_geral") {
        headerTitle.textContent = "Dashboard Geral da Diretoria";
      } else {
        headerTitle.innerHTML = `${titulosDivisao[App.activeDivision]} <span class="title-sep">•</span> ${nomesEtapas[App.activeStage]}`;
      }
    }
    if (headerSub) {
      headerSub.textContent = App.activeDivision === "dashboard_geral"
        ? "Visão consolidada de todas as divisões, indicadores executivos e painel 'Quem está fazendo o quê'."
        : `${subEtapas[App.activeStage]} Divisão ${titulosDivisao[App.activeDivision]}.`;
    }
  },

  // Renderiza o conteúdo com transição visual cinematográfica
  renderContent(animate = true) {
    const mainWrap = document.getElementById("mainContentArea");
    if (!mainWrap) return;

    const doRender = () => {
      if (App.activeDivision === "dashboard_geral") {
        App.renderAdminDashboard(mainWrap);
      } else {
        App.renderBudgetsList(mainWrap);
      }
    };

    if (animate && typeof PapaSysAnimation !== "undefined") {
      PapaSysAnimation.animateViewTransition(mainWrap, doRender);
    } else {
      doRender();
      mainWrap.classList.remove("view-transition-fade-slide");
      void mainWrap.offsetWidth;
      mainWrap.classList.add("view-transition-fade-slide");
    }
  },

  // 1. RENDERIZAÇÃO DA PÁGINA DA ETAPA ATIVA (MODO LINHAS / TABELA + PAGINAÇÃO)
  renderBudgetsList(container) {
    const division = App.activeDivision;
    const stage = App.activeStage;
    const isAdmin = Auth.isAdmin();

    // Todos os orçamentos da divisão e etapa atuais
    const baseList = App.budgets.filter(b => b.division === division && b.stage === stage);

    // Contadores para os filtros de status
    const countTotal = baseList.length;
    const countAberto = baseList.filter(b => (b.status || 'em_aberto') === 'em_aberto').length;
    const countAnalise = baseList.filter(b => b.status === 'em_analise').length;
    const countAprovado = baseList.filter(b => b.status === 'aprovado').length;

    // Estatísticas Consolidadas da Etapa Atual (KPIs)
    const totalUnits = baseList.reduce((acc, b) => acc + (b.pools || []).reduce((pAcc, p) => pAcc + (parseInt(p.units_count) || 1), 0), 0);
    const totalM2Revest = baseList.reduce((acc, b) => acc + (parseFloat(b.total_area_revestimento) || 0), 0);
    const totalValor = baseList.reduce((acc, b) => acc + (parseFloat(b.total_price) || 0), 0);

    // 1. Aplica Filtro de Status
    let filteredList = baseList;
    if (App.statusFilter && App.statusFilter !== "all") {
      filteredList = filteredList.filter(b => (b.status || "em_aberto") === App.statusFilter);
    }

    // 2. Aplica Filtro de Pesquisa
    if (App.searchTerm) {
      filteredList = filteredList.filter(b => {
        const poolsText = (b.pools || []).map(p => `${p.model_name} ${p.coating_type}`).join(" ");
        const text = `${b.budget_code} ${b.project_name} ${b.client_name} ${b.assigned_user_name || ''} ${poolsText}`.toLowerCase();
        return text.includes(App.searchTerm);
      });
    }

    // 3. Aplica Ordenação
    filteredList.sort((a, b) => {
      switch (App.sortBy) {
        case "recent":
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        case "oldest":
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case "price_desc":
          return (parseFloat(b.total_price) || 0) - (parseFloat(a.total_price) || 0);
        case "price_asc":
          return (parseFloat(a.total_price) || 0) - (parseFloat(b.total_price) || 0);
        case "code":
          return (a.budget_code || "").localeCompare(b.budget_code || "");
        case "client":
          return (a.client_name || "").localeCompare(b.client_name || "");
        default:
          return 0;
      }
    });

    // 4. Cálculo da Paginação
    const totalFiltered = filteredList.length;
    const totalPages = Math.ceil(totalFiltered / App.itemsPerPage) || 1;
    if (App.currentPage > totalPages) App.currentPage = totalPages;
    if (App.currentPage < 1) App.currentPage = 1;

    const startIndex = (App.currentPage - 1) * App.itemsPerPage;
    const endIndex = Math.min(startIndex + App.itemsPerPage, totalFiltered);
    const pagedItems = filteredList.slice(startIndex, endIndex);

    // Monta o cabeçalho com KPIs, Barra de Ferramentas e Alternador Linhas / Cards
    container.innerHTML = `
      <!-- Banner com Métricas Rápidas da Etapa (KPIs) -->
      <div class="metrics-kpi-bar">
        <div class="metric-kpi-card">
          <div class="kpi-icon-wrap blue">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Orçamentos na Etapa</span>
            <span class="kpi-val">${countTotal}</span>
          </div>
        </div>

        <div class="metric-kpi-card">
          <div class="kpi-icon-wrap orange">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M2 12c2.5-3 5.5-3 8 0s5.5 3 8 0 3-1.5 4-1.5"></path>
              <path d="M2 17c2.5-3 5.5-3 8 0s5.5 3 8 0 3-1.5 4-1.5"></path>
            </svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Piscinas / Unidades</span>
            <span class="kpi-val">${totalUnits} un</span>
          </div>
        </div>

        <div class="metric-kpi-card">
          <div class="kpi-icon-wrap purple">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </div>
          <div class="kpi-info">
            <span class="kpi-label">Área de Revestimento</span>
            <span class="kpi-val">${totalM2Revest.toFixed(1)} m²</span>
          </div>
        </div>

        ${isAdmin ? `
          <div class="metric-kpi-card">
            <div class="kpi-icon-wrap green">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">Faturamento Estimado</span>
              <span class="kpi-val tabular-nums">${PricingEngine.formatBRL(totalValor)}</span>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Barra de Controle: Filtros de Status, Ordenação, Limite e Alternador de Modo -->
      <div class="list-toolbar-wrap">
        <div class="toolbar-left">
          <div class="filter-pills-row">
            <button class="filter-pill ${App.statusFilter === 'all' ? 'active' : ''}" onclick="App.setStatusFilter('all')">
              Todos <span class="pill-count">${countTotal}</span>
            </button>
            <button class="filter-pill ${App.statusFilter === 'em_aberto' ? 'active' : ''}" onclick="App.setStatusFilter('em_aberto')">
              Em Aberto <span class="pill-count">${countAberto}</span>
            </button>
            <button class="filter-pill ${App.statusFilter === 'em_analise' ? 'active' : ''}" onclick="App.setStatusFilter('em_analise')">
              Em Análise <span class="pill-count">${countAnalise}</span>
            </button>
            <button class="filter-pill ${App.statusFilter === 'aprovado' ? 'active' : ''}" onclick="App.setStatusFilter('aprovado')">
              Aprovados <span class="pill-count">${countAprovado}</span>
            </button>
          </div>
        </div>

        <div class="toolbar-right">
          <!-- Seletor de Ordenação -->
          <div class="sort-selector-wrap">
            <span class="select-label">Ordenar:</span>
            <select class="form-control select-sort" onchange="App.setSortBy(this.value)">
              <option value="recent" ${App.sortBy === 'recent' ? 'selected' : ''}>Mais Recentes</option>
              <option value="oldest" ${App.sortBy === 'oldest' ? 'selected' : ''}>Mais Antigos</option>
              <option value="price_desc" ${App.sortBy === 'price_desc' ? 'selected' : ''}>Maior Valor</option>
              <option value="price_asc" ${App.sortBy === 'price_asc' ? 'selected' : ''}>Menor Valor</option>
              <option value="code" ${App.sortBy === 'code' ? 'selected' : ''}>Código A-Z</option>
              <option value="client" ${App.sortBy === 'client' ? 'selected' : ''}>Cliente A-Z</option>
            </select>
          </div>

          <!-- Seletor de Itens por Página -->
          <div class="limit-selector-wrap">
            <span class="select-label">Exibir:</span>
            <select class="form-control select-limit" onchange="App.setItemsPerPage(this.value)">
              <option value="10" ${App.itemsPerPage === 10 ? 'selected' : ''}>10 / pág</option>
              <option value="25" ${App.itemsPerPage === 25 ? 'selected' : ''}>25 / pág</option>
              <option value="50" ${App.itemsPerPage === 50 ? 'selected' : ''}>50 / pág</option>
            </select>
          </div>

          <!-- Alternador de Modo de Visualização (Linhas vs Cards) -->
          <div class="view-mode-toggle" title="Alternar entre Orçamentos por Linha (Tabela) e Modo Cards">
            <button class="view-btn ${App.viewMode === 'table' ? 'active' : ''}" onclick="App.setViewMode('table')" title="Visualização por Linha (Tabela - Recomendado para muitos orçamentos)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
              <span>Linhas</span>
            </button>
            <button class="view-btn ${App.viewMode === 'cards' ? 'active' : ''}" onclick="App.setViewMode('cards')" title="Visualização em Cards">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Conteúdo: Tabela de Linhas ou Cards -->
      ${totalFiltered === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3 class="empty-title">Nenhum orçamento encontrado com os filtros atuais</h3>
          <p class="empty-desc">${App.searchTerm ? `Nenhum resultado para a busca "<strong>${App.searchTerm}</strong>".` : `Não há orçamentos registrados com este status.`}</p>
          <div class="empty-actions">
            <button class="btn btn-primary" onclick="App.abrirModalNovoOrcamento()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Criar Novo Orçamento
            </button>
            ${App.searchTerm || App.statusFilter !== 'all' ? `
              <button class="btn btn-secondary" onclick="App.limparFiltros()">
                Limpar Filtros e Busca
              </button>
            ` : `
              <button class="btn btn-secondary" onclick="App.simularEnvioSketchUp()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                Simular Envio do SketchUp
              </button>
            `}
          </div>
        </div>
      ` : App.viewMode === 'table' ? App.renderBudgetsTable(pagedItems, totalFiltered) : `
        <div class="budgets-flow-grid">
          ${pagedItems.map(b => App.renderBudgetCard(b)).join("")}
        </div>
      `}

      <!-- Rodapé de Paginação -->
      ${totalFiltered > 0 ? App.renderPagination(totalFiltered, totalPages, startIndex, endIndex) : ''}
    `;
  },

  // RENDERIZAÇÃO EM TABELA / LINHAS (DESIGN ALTO PADRÃO PARA MUITOS ORÇAMENTOS)
  renderBudgetsTable(items, totalFiltered) {
    const isAdmin = Auth.isAdmin();
    return `
      <div class="table-responsive-card">
        <table class="budget-data-table">
          <thead>
            <tr>
              <th style="width: 140px;">Código & Etapa</th>
              <th style="min-width: 200px;">Empreendimento & Cliente</th>
              <th style="min-width: 220px;">Piscinas & Revestimento</th>
              <th style="width: 160px;">Quantitativos 3D</th>
              <th style="width: 130px;">Estrutura</th>
              <th style="width: 160px;">Responsável</th>
              <th style="width: 140px;" class="text-right">Valor Total</th>
              <th style="width: 180px;" class="text-center">Ações Rápidas</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(b => App.renderBudgetRow(b)).join("")}
          </tbody>
        </table>
      </div>
    `;
  },

  // Linha individual do orçamento na tabela
  renderBudgetRow(b) {
    const isAdmin = Auth.isAdmin();
    const isIncorporadora = b.division === "incorporadora";
    const pools = b.pools || [];
    const totalUnits = pools.reduce((acc, p) => acc + (parseInt(p.units_count) || 1), 0);
    const assignedName = b.assigned_user_name || "Não atribuído";
    const assignedInitials = assignedName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

    // Data formatada
    let dateStr = "Hoje";
    if (b.created_at) {
      const d = new Date(b.created_at);
      dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear().toString().slice(-2)}`;
    }

    // Próxima etapa no fluxo
    let nextStage = null;
    let nextBtnLabel = "";
    if (b.stage === "previa") {
      nextStage = "galga";
      nextBtnLabel = "Para Galga →";
    } else if (b.stage === "galga") {
      nextStage = "desenho_tecnico";
      nextBtnLabel = "Para Desenho →";
    }

    // Verifica se algum modelo tem molde ou é autoportante
    const hasMold = pools.some(p => p.has_mold);
    const hasAutoportante = pools.some(p => p.structure_type === "autoportante");

    // Usuário atribuído e cor do avatar
    const assignedUser = Auth.getAllUsers().find(u => u.name === assignedName || u.id === b.assigned_user_id || u.email === assignedName);
    const assignedColor = assignedUser ? (assignedUser.avatar_color || '#f97316') : '#f97316';

    // Formata nomes dos revestimentos
    const coatingLabels = {
      pastilha_5x5: "Pastilha 5x5",
      pastilha_7_5x7_5: "Pastilha 7.5x7.5",
      pastilha_10x10: "Pastilha 10x10",
      pastilha_15x15: "Pastilha 15x15",
      porcelanato_villagres: "Villagres",
      personalizado: "Personalizado"
    };

    return `
      <tr class="budget-row-item ${b.stage}" id="row-${b.id}">
        <!-- 1. Código, Etapa e Data -->
        <td class="col-code">
          <div class="row-code-wrap">
            <a href="orcamento.html?id=${b.id}" class="row-code-link" title="Abrir editor do orçamento">${b.budget_code}</a>
            <div class="row-badges-sub">
              <span class="stage-tag-mini ${b.stage}">${b.stage.replace('_', ' ').toUpperCase()}</span>
              ${hasMold ? '<span class="badge-mold-mini" title="Preço com molde ativado">MOLDE</span>' : ''}
            </div>
            <span class="row-date-text">${dateStr}</span>
          </div>
        </td>

        <!-- 2. Empreendimento e Cliente -->
        <td class="col-project">
          <a href="orcamento.html?id=${b.id}" class="row-project-name" title="${b.project_name}">
            ${b.project_name}
          </a>
          <div class="row-client-name">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>${b.client_name || 'Cliente Geral'}</span>
          </div>
          ${b.notes ? `
            <div class="row-notes-preview" title="${b.notes}">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0; vertical-align: -1px;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              </svg>
              <span>${b.notes}</span>
            </div>
          ` : ''}
        </td>

        <!-- 3. Piscinas & Modelos -->
        <td class="col-pools">
          <div class="row-pools-list">
            ${pools.map(p => `
              <div class="row-pool-chip">
                <span class="chip-qty">${p.units_count}x</span>
                <span class="chip-model">${p.model_name}</span>
                <span class="chip-sep">•</span>
                <span class="chip-coating">${coatingLabels[p.coating_type] || p.coating_type}</span>
              </div>
            `).join("")}
          </div>
          <div class="row-pools-meta">
            ${pools.length} ${pools.length === 1 ? 'modelo' : 'modelos'} • ${totalUnits} ${totalUnits === 1 ? 'unidade' : 'unidades'}
            ${isIncorporadora && totalUnits > 1 ? `
              <button class="btn-split-link" onclick="App.abrirModalDividirOrcamento('${b.id}')" title="Dividir unidades em orçamentos diferentes">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px;">
                  <polyline points="17 1 21 5 17 9"></polyline>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                  <polyline points="7 23 3 19 7 15"></polyline>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                Dividir
              </button>
            ` : ''}
          </div>
        </td>

        <!-- 4. Quantitativos 3D -->
        <td class="col-quants">
          <div class="quants-stack">
            <div class="quant-line" title="Área de Revestimento (faces internas)">
              <span class="q-label">Revest:</span>
              <span class="q-val font-bold">${b.total_area_revestimento || 0} m²</span>
            </div>
            <div class="quant-line" title="Área de Laminação externa">
              <span class="q-label">Lamina:</span>
              <span class="q-val">${b.total_area_laminacao || 0} m²</span>
            </div>
            <div class="quant-line" title="Volume cúbico interno">
              <span class="q-label">Volume:</span>
              <span class="q-val">${b.total_volume_m3 || 0} m³</span>
            </div>
          </div>
        </td>

        <!-- 5. Estrutura -->
        <td class="col-struct">
          <div class="struct-wrap">
            <span class="badge-structure ${hasAutoportante ? 'autoportante' : 'convencional'}">
              ${hasAutoportante ? 'Autoportante (+50%)' : 'Não autoportante'}
            </span>
          </div>
        </td>

        <!-- 6. Responsável -->
        <td class="col-user">
          <div class="row-user-chip" onclick="App.abrirModalReatribuir('${b.id}')" title="Clique para reatribuir responsável">
            <div class="user-chip-avatar" style="background: ${assignedColor}">${assignedInitials}</div>
            <div class="user-chip-details">
              <span class="user-chip-name">${assignedName}</span>
              <span class="user-chip-edit-hint">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px;">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Reatribuir
              </span>
            </div>
          </div>
        </td>

        <!-- 7. Valor Total -->
        <td class="col-price text-right">
          <div class="row-price-val tabular-nums font-bold">
            ${PricingEngine.formatBRL(b.total_price)}
          </div>
          <div class="row-price-sub">
            ${b.stage === 'previa' ? '+5% margem' : '0% margem'}
          </div>
        </td>

        <!-- 8. Ações Rápidas (Ícones em cima, botão de avanço embaixo) -->
        <td class="col-actions text-center">
          <div class="row-actions-group">
            <div class="row-actions-icons">
              <a href="orcamento.html?id=${b.id}" class="btn-action-icon btn-action-edit" title="Editar Orçamento Detalhado">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </a>

              <a href="proposta.html?id=${b.id}" class="btn-action-icon btn-action-proposal" title="Visualizar Proposta Comercial & Ficha Técnica PDF">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </a>

              <button class="btn-action-icon btn-action-danger" onclick="App.excluirOrcamento('${b.id}')" title="Excluir este orçamento">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>

            ${nextStage ? `
              <button class="btn btn-xs btn-primary btn-advance-row" onclick="App.avancarEtapa('${b.id}', '${nextStage}')" title="Avançar para a próxima etapa">
                ${nextBtnLabel}
              </button>
            ` : `
              <span class="badge-finished-mini" title="Desenho Técnico Concluído">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Aprovada
              </span>
            `}
          </div>
        </td>
      </tr>
    `;
  },

  // Card do Orçamento (Modo Cards)
  renderBudgetCard(b) {
    const isAdmin = Auth.isAdmin();
    const isIncorporadora = b.division === "incorporadora";
    const pools = b.pools || [];
    const totalUnits = pools.reduce((acc, p) => acc + (parseInt(p.units_count) || 1), 0);
    const assignedName = b.assigned_user_name || "Não atribuído";
    const assignedInitials = assignedName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

    let nextStage = null;
    let nextStageLabel = "";
    if (b.stage === "previa") {
      nextStage = "galga";
      nextStageLabel = "Avançar para Galga (Pré-venda) →";
    } else if (b.stage === "galga") {
      nextStage = "desenho_tecnico";
      nextStageLabel = "Avançar para Desenho Técnico (Venda) →";
    }

    const hasMold = pools.some(p => p.has_mold);

    return `
      <div class="budget-card ${b.stage}" id="card-${b.id}">
        <div class="card-head">
          <div class="card-badge-row">
            <span class="code-badge">${b.budget_code}</span>
            <span class="stage-tag ${b.stage}">${b.stage.replace('_', ' ').toUpperCase()}</span>
            ${hasMold ? '<span class="badge-mold">COM MOLDE</span>' : ''}
          </div>

          <div class="card-user-responsible" title="Responsável por este orçamento" onclick="App.abrirModalReatribuir('${b.id}')">
            <div class="user-chip">
              <div class="user-chip-avatar">${assignedInitials}</div>
              <span class="user-chip-name">${assignedName}</span>
              <span class="user-chip-edit">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </span>
            </div>
          </div>
        </div>

        <div class="card-body">
          <h3 class="card-project-title" onclick="window.location.href='orcamento.html?id=${b.id}'">
            ${b.project_name}
          </h3>
          <div class="card-client-row">
            <span class="client-label">Cliente:</span>
            <span class="client-value">${b.client_name || 'Geral'}</span>
          </div>

          <div class="pools-summary-box">
            <div class="pools-header">
              <span class="pools-count-badge">${pools.length} ${pools.length === 1 ? 'modelo' : 'modelos'} • ${totalUnits} ${totalUnits === 1 ? 'unidade' : 'unidades'}</span>
              ${isIncorporadora && totalUnits > 1 ? `
                <button class="btn-split-trigger" onclick="App.abrirModalDividirOrcamento('${b.id}')" title="Dividir unidades">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px;">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                  </svg>
                  Dividir
                </button>
              ` : ''}
            </div>

            <div class="pools-list-mini">
              ${pools.map(p => `
                <div class="pool-mini-item">
                  <div class="pool-mini-name">
                    <span class="pool-qty-pill">${p.units_count}x</span>
                    <strong>${p.model_name}</strong>
                  </div>
                  <div class="pool-mini-meta">
                    <span>${p.coating_type.replace('_', ' ')}</span> • 
                    <span>${p.structure_type === 'autoportante' ? 'Autoportante (+50%)' : 'Não autoportante'}</span>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="quant-pills-row">
            <div class="quant-pill" title="Área de Revestimento">
              <span class="pill-k">Revest:</span>
              <span class="pill-v">${b.total_area_revestimento || 0} m²</span>
            </div>
            <div class="quant-pill" title="Área de Laminação">
              <span class="pill-k">Lamina:</span>
              <span class="pill-v">${b.total_area_laminacao || 0} m²</span>
            </div>
            <div class="quant-pill" title="Volume interno">
              <span class="pill-k">Volume:</span>
              <span class="pill-v">${b.total_volume_m3 || 0} m³</span>
            </div>
          </div>

          <div class="card-footer-row">
            <div class="price-block">
              <span class="price-label">Valor Total Estimado:</span>
              <span class="price-value tabular-nums">${PricingEngine.formatBRL(b.total_price)}</span>
            </div>

            <div class="card-actions">
              <a href="orcamento.html?id=${b.id}" class="btn-action btn-edit" title="Editar Orçamento">
                Editar
              </a>
              <a href="proposta.html?id=${b.id}" class="btn-action btn-proposal" title="Ficha Técnica / Proposta PDF">
                Proposta PDF
              </a>
              <button class="btn-action btn-danger-action" onclick="App.excluirOrcamento('${b.id}')" title="Excluir">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>

          ${nextStage ? `
            <div class="advance-stage-row">
              <button class="btn-advance-stage" onclick="App.avancarEtapa('${b.id}', '${nextStage}')">
                ${nextStageLabel}
              </button>
            </div>
          ` : `
            <div class="advance-stage-row finished">
              <span class="badge-finished">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: -1px; margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                Etapa Desenho Técnico (Venda Aprovada)
              </span>
            </div>
          `}
        </div>
      </div>
    `;
  },

  // RENDERIZAÇÃO DA BARRA DE PAGINAÇÃO
  renderPagination(totalFiltered, totalPages, startIndex, endIndex) {
    // Gera array de páginas com elipses se necessário
    const pages = [];
    const cur = App.currentPage;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= cur - 2 && i <= cur + 2)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== "...") {
        pages.push("...");
      }
    }

    return `
      <div class="pagination-footer-bar">
        <div class="pagination-info">
          Exibindo <strong>${startIndex + 1}</strong> a <strong>${endIndex}</strong> de <strong>${totalFiltered}</strong> orçamentos
        </div>

        <div class="pagination-controls">
          <button class="pagination-btn nav-btn" ${cur === 1 ? 'disabled' : ''} onclick="App.setPage(1)" title="Primeira Página">
            « Primeira
          </button>
          <button class="pagination-btn nav-btn" ${cur === 1 ? 'disabled' : ''} onclick="App.setPage(${cur - 1})" title="Página Anterior">
            ‹ Anterior
          </button>

          <div class="pagination-pages-list">
            ${pages.map(p => {
              if (p === "...") {
                return `<span class="pagination-ellipsis">...</span>`;
              }
              return `
                <button class="pagination-btn page-num ${p === cur ? 'active' : ''}" onclick="App.setPage(${p})">
                  ${p}
                </button>
              `;
            }).join("")}
          </div>

          <button class="pagination-btn nav-btn" ${cur === totalPages ? 'disabled' : ''} onclick="App.setPage(${cur + 1})" title="Próxima Página">
            Próxima ›
          </button>
          <button class="pagination-btn nav-btn" ${cur === totalPages ? 'disabled' : ''} onclick="App.setPage(${totalPages})" title="Última Página">
            Última »
          </button>
        </div>
      </div>
    `;
  },

  // Métodos de Controle de Paginação e Filtros
  setPage(page) {
    App.currentPage = page;
    App.renderContent();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  setItemsPerPage(limit) {
    App.itemsPerPage = parseInt(limit) || 10;
    App.currentPage = 1;
    try {
      localStorage.setItem("igui_items_per_page", App.itemsPerPage);
    } catch(e) {}
    App.renderContent();
  },

  setViewMode(mode) {
    App.viewMode = mode;
    try {
      localStorage.setItem("igui_view_mode", mode);
    } catch(e) {}
    App.renderContent();
  },

  setStatusFilter(status) {
    App.statusFilter = status;
    App.currentPage = 1;
    App.renderContent();
  },

  setSortBy(sortBy) {
    App.sortBy = sortBy;
    App.renderContent();
  },

  limparFiltros() {
    App.searchTerm = "";
    App.statusFilter = "all";
    App.currentPage = 1;
    const input = document.getElementById("searchBudgets");
    if (input) input.value = "";
    App.renderContent();
  },

  async excluirOrcamento(budgetId) {
    const budget = App.budgets.find(b => b.id === budgetId);
    const code = budget ? budget.budget_code : budgetId;
    const ok = await PapaSysDialog.confirm({
      title: "Excluir Orçamento",
      message: `Deseja realmente excluir o orçamento ${code}?\nEsta ação removerá o orçamento e todos os seus modelos vinculados.`,
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
      type: "danger"
    });
    if (!ok) return;

    const success = await DB.deleteBudget(budgetId);
    if (success) {
      App.showToast(`Orçamento ${code} excluído com sucesso.`, "info");
      await App.loadBudgets();
    }
  },

  // 2. RENDERIZAÇÃO DO DASHBOARD GERAL DA DIRETORIA (SEÇÃO 3)
  // "Visualiza quem está fazendo o quê (responsável por cada orçamento).
  // Acessa um Dashboard geral com todos os dados e indicadores.
  // Gerencia usuários: define divisões, páginas e tarefas de cada um."
  renderAdminDashboard(container) {
    const all = App.budgets;
    const users = Auth.getAllUsers();

    // Indicadores Gerais
    const totalGeral = all.reduce((acc, b) => acc + (parseFloat(b.total_price) || 0), 0);
    const totalM2Revest = all.reduce((acc, b) => acc + (parseFloat(b.total_area_revestimento) || 0), 0);
    const totalM2Lamina = all.reduce((acc, b) => acc + (parseFloat(b.total_area_laminacao) || 0), 0);
    const totalLitros = all.reduce((acc, b) => acc + (parseFloat(b.total_volume_liters) || 0), 0);

    // Contadores por Divisão
    const sobMedidaCount = all.filter(b => b.division === "sob_medida").length;
    const incorporadoraCount = all.filter(b => b.division === "incorporadora").length;
    const internacionalCount = all.filter(b => b.division === "internacional").length;

    // Contadores por Etapa
    const previaCount = all.filter(b => b.stage === "previa").length;
    const galgaCount = all.filter(b => b.stage === "galga").length;
    const desenhoCount = all.filter(b => b.stage === "desenho_tecnico").length;

    container.innerHTML = `
      <div class="admin-dashboard-view">
        
        <!-- Header com botão de gerenciar usuários -->
        <div class="dashboard-header-bar">
          <div>
            <h2 class="dash-section-title">Painel Executivo Geral da Diretoria</h2>
            <p class="dash-section-sub">Consolidação em tempo real das 3 divisões iGUi (Sob Medida, Incorporadora e Internacional)</p>
          </div>
          <div class="dash-header-actions">
            <button class="btn btn-primary" onclick="App.abrirModalGerenciarUsuarios()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Gerenciar Equipe
            </button>
            <a href="precos.html" class="btn btn-secondary">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Configurações de Preço
            </a>
          </div>
        </div>

        <!-- 4 Stat Tiles Executivos -->
        <div class="stats-overview">
          <div class="stat-tile">
            <div class="stat-tile-header">
              <span class="stat-tile-label">Faturamento Total em Orçamentos</span>
              <div class="stat-tile-icon stat-icon-blue">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
            </div>
            <div class="stat-tile-value tabular-nums" style="color: var(--igui-blue);">${PricingEngine.formatBRL(totalGeral)}</div>
            <div class="stat-tile-sub">${all.length} orçamentos acumulados</div>
          </div>

          <div class="stat-tile">
            <div class="stat-tile-header">
              <span class="stat-tile-label">Metragem de Revestimento</span>
              <div class="stat-tile-icon stat-icon-green">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
              </div>
            </div>
            <div class="stat-tile-value tabular-nums">${totalM2Revest.toFixed(1)} m²</div>
            <div class="stat-tile-sub">Faces internas com material Revestimento</div>
          </div>

          <div class="stat-tile">
            <div class="stat-tile-header">
              <span class="stat-tile-label">Metragem de Laminação</span>
              <div class="stat-tile-icon stat-icon-orange">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
            </div>
            <div class="stat-tile-value tabular-nums">${totalM2Lamina.toFixed(1)} m²</div>
            <div class="stat-tile-sub">Bordas e cascos com material Laminação</div>
          </div>

          <div class="stat-tile">
            <div class="stat-tile-header">
              <span class="stat-tile-label">Volume Total de Água</span>
              <div class="stat-tile-icon stat-icon-purple">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                </svg>
              </div>
            </div>
            <div class="stat-tile-value tabular-nums">${Number(totalLitros).toLocaleString('pt-BR')} L</div>
            <div class="stat-tile-sub">${(totalLitros / 1000).toFixed(1)} m³ cúbicos calculados</div>
          </div>
        </div>

        <!-- Distribuição por Divisão & Etapa -->
        <div class="dashboard-split-grid">
          
          <div class="dash-card">
            <h3 class="dash-card-title">Distribuição por Divisão (3 Divisões)</h3>
            <div class="division-distribution-list">
              <div class="dist-item" onclick="App.selectDivision('sob_medida')">
                <div class="dist-item-info">
                  <strong>iGUi Sob Medida</strong>
                  <span>1 piscina por orçamento</span>
                </div>
                <div class="dist-item-val">${sobMedidaCount} orçamentos</div>
              </div>
              <div class="dist-item" onclick="App.selectDivision('incorporadora')">
                <div class="dist-item-info">
                  <strong>iGUi Incorporadora</strong>
                  <span>Múltiplos modelos, moldes e desmembramento</span>
                </div>
                <div class="dist-item-val">${incorporadoraCount} orçamentos</div>
              </div>
              <div class="dist-item" onclick="App.selectDivision('internacional')">
                <div class="dist-item-info">
                  <strong>iGUi Internacional</strong>
                  <span>Projetos e exportação global</span>
                </div>
                <div class="dist-item-val">${internacionalCount} orçamentos</div>
              </div>
            </div>
          </div>

          <div class="dash-card">
            <h3 class="dash-card-title">Fluxo por Páginas / Etapas</h3>
            <div class="stage-pipeline-list">
              <div class="pipeline-step previa">
                <div class="step-num">1</div>
                <div class="step-info">
                  <strong>Prévia</strong>
                  <span>Estimativa preliminar (+5% margem)</span>
                </div>
                <div class="step-count">${previaCount}</div>
              </div>

              <div class="pipeline-step galga">
                <div class="step-num">2</div>
                <div class="step-info">
                  <strong>Galga (Pré-venda)</strong>
                  <span>Quadro técnico pré-venda (0% margem)</span>
                </div>
                <div class="step-count">${galgaCount}</div>
              </div>

              <div class="pipeline-step desenho">
                <div class="step-num">3</div>
                <div class="step-info">
                  <strong>Desenho Técnico (Venda)</strong>
                  <span>Aprovado no sistema (sem passar pelo SketchUp)</span>
                </div>
                <div class="step-count">${desenhoCount}</div>
              </div>
            </div>
          </div>

        </div>

        <!-- SEÇÃO 3: QUEM ESTÁ FAZENDO O QUÊ -->
        <div class="dash-card full-width" style="margin-top: 14px;">
          <div class="card-head-between">
            <div>
              <h3 class="dash-card-title">Quem está fazendo o quê (Alocação da Equipe)</h3>
              <p class="dash-card-sub">Visualização dos orçamentos e tarefas sob responsabilidade de cada projetista</p>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="App.abrirModalGerenciarUsuarios()">
              Gerenciar Equipe
            </button>
          </div>

          <div class="team-allocation-table-wrap">
            <table class="team-allocation-table">
              <thead>
                <tr>
                  <th>Responsável</th>
                  <th>Cargo / Perfil</th>
                  <th>Divisões Permitidas</th>
                  <th>Orçamentos Ativos</th>
                  <th>Volume em Carteira</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => {
                  const userBudgets = all.filter(b => b.assigned_user_id === u.id || b.assigned_user_name === u.name);
                  const userTotal = userBudgets.reduce((acc, b) => acc + (parseFloat(b.total_price) || 0), 0);
                  const parts = (u.name || "U").trim().split(" ");
                  const init = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();

                  return `
                    <tr>
                      <td>
                        <div class="user-row-cell">
                          <div class="avatar-cell" style="background: ${u.avatar_color || '#0284c7'}">${init}</div>
                          <div>
                            <strong>${u.name}</strong>
                            <div class="user-email-sub">${u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="badge-role ${u.role === 'admin' ? 'admin' : ''}">
                          ${u.role === 'admin' ? 'Administrador' : 'Projetista'}
                        </span>
                      </td>
                      <td>
                        <div class="tags-cell">
                          ${(u.allowed_divisions || ['sob_medida']).map(d => `<span class="tag-div">${d.replace('_', ' ')}</span>`).join('')}
                        </div>
                      </td>
                      <td>
                        <strong>${userBudgets.length}</strong> orçamentos
                        <div class="user-tasks-mini">
                          ${userBudgets.slice(0, 2).map(b => `<div class="task-mini-link" onclick="window.location.href='orcamento.html?id=${b.id}'">${b.budget_code} (${b.project_name})</div>`).join('')}
                          ${userBudgets.length > 2 ? `<span class="more-tasks">+${userBudgets.length - 2} outros</span>` : ''}
                        </div>
                      </td>
                      <td class="tabular-nums font-bold" style="color: var(--igui-blue);">
                        ${PricingEngine.formatBRL(userTotal)}
                      </td>
                      <td>
                        <button class="btn btn-sm btn-secondary" onclick="App.abrirModalAtribuirParaUsuario('${u.id}', '${u.name}')">
                          Atribuir Orçamento
                        </button>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;
  },

  // ==============================================================================
  // AÇÕES DO FLUXO (AVANÇAR ETAPA, REATRIBUIR, DIVIDIR UNIDADES)
  // ==============================================================================
  async avancarEtapa(budgetId, nextStage) {
    // REGRA DA GALGA: exige validação técnica com a fábrica e confirmação das medidas
    if (nextStage === "galga") {
      App.abrirModalConfirmarGalga(budgetId);
      return;
    }

    const nomes = {
      galga: "Galga (Pré-venda)",
      desenho_tecnico: "Desenho Técnico (Venda)"
    };
    const targetName = nomes[nextStage] || nextStage;

    const ok = await PapaSysDialog.confirm({
      title: "Avançar Etapa do Fluxo",
      message: `Deseja avançar este orçamento para a etapa de ${targetName}?\n\nOs cálculos de margem e precificação serão ajustados automaticamente conforme as regras do fluxo.`,
      confirmText: "Avançar Etapa",
      cancelText: "Cancelar",
      type: "info"
    });
    if (!ok) return;

    const updated = await DB.advanceStage(budgetId, nextStage);
    if (updated) {
      App.showToast(`Orçamento avançado com sucesso para ${targetName}!`, "success");
      await App.loadBudgets();
    }
  },

  // ==============================================================================
  // CONFIRMAÇÃO DE GALGA TÉCNICA COM A FÁBRICA
  // ==============================================================================
  abrirModalConfirmarGalga(budgetId) {
    const budget = App.budgets.find(b => b.id === budgetId);
    if (!budget) return;

    App.selectedBudgetForGalga = budget;

    // Se não tiver piscinas carregadas, sintetiza a piscina padrão
    let pools = budget.pools || [];
    if (pools.length === 0) {
      const areaRev = parseFloat(budget.total_area_revestimento) || 28.0;
      const areaLam = parseFloat(budget.total_area_laminacao) || 38.99;
      const volM3 = parseFloat(budget.total_volume_m3) || 21.0;
      pools = [{
        id: `pool-${budget.id}-1`,
        budget_id: budget.id,
        model_name: budget.project_name || "Piscina Sob Medida",
        units_count: 1,
        pool_type: "convencional",
        structure_type: "nao_autoportante",
        coating_type: "pastilha_15x15",
        has_mold: false,
        comprimento_m: 6.00,
        largura_m: 3.00,
        profundidade_m: 1.40,
        internal_area_m2: areaRev,
        lamination_area_m2: areaLam,
        internal_volume_m3: volM3,
        internal_volume_liters: volM3 * 1000,
        linear_corners_m: 21.60,
        alive_corners_count: 4
      }];
      budget.pools = pools;
    }

    const container = document.getElementById("appGalgaPoolsContainer");
    const chk = document.getElementById("chkAppGalgaConfirm");
    const btn = document.getElementById("btnAppConfirmarGalga");
    const modal = document.getElementById("modalConfirmarGalga");

    if (!container || !modal) return;

    if (chk) chk.checked = false;
    if (btn) btn.disabled = true;

    container.innerHTML = pools.map((p, idx) => {
      const comp = parseFloat(p.comprimento_m) || 6.00;
      const larg = parseFloat(p.largura_m) || 3.00;
      const prof = parseFloat(p.profundidade_m) || 1.40;
      const rev = parseFloat(p.internal_area_m2) || 28.00;
      const lam = parseFloat(p.lamination_area_m2) || 38.99;
      const vol = parseFloat(p.internal_volume_m3) || 21.00;

      return `
        <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
            <strong style="color: #0f172a; font-size: 13.5px;">${budget.budget_code} &bull; Modelo #${idx + 1}: ${p.model_name}</strong>
            <span style="font-size: 12px; color: #0284c7; font-weight: 600;">Revestimento: ${(p.coating_type || 'pastilha_15x15').replace('_', ' ')}</span>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;">
            <div class="form-group">
              <label class="form-label" style="font-size: 12px;">Comprimento Final (m):</label>
              <input type="number" step="0.01" class="form-control" id="appGalgaComp_${idx}" value="${comp.toFixed(2)}" onchange="App.aoAjustarMedidaGalga(${idx})">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 12px;">Largura Final (m):</label>
              <input type="number" step="0.01" class="form-control" id="appGalgaLarg_${idx}" value="${larg.toFixed(2)}" onchange="App.aoAjustarMedidaGalga(${idx})">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 12px;">Profundidade Final (m):</label>
              <input type="number" step="0.01" class="form-control" id="appGalgaProf_${idx}" value="${prof.toFixed(2)}" onchange="App.aoAjustarMedidaGalga(${idx})">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; padding: 8px; border-radius: 6px;">
            <div class="form-group">
              <label class="form-label" style="font-size: 11px; color: #64748b;">Área Revestimento (m²):</label>
              <input type="number" step="0.01" class="form-control" id="appGalgaRev_${idx}" value="${rev.toFixed(2)}">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 11px; color: #64748b;">Área Laminação (m²):</label>
              <input type="number" step="0.01" class="form-control" id="appGalgaLam_${idx}" value="${lam.toFixed(2)}">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 11px; color: #64748b;">Volume Interno (m³):</label>
              <input type="number" step="0.01" class="form-control" id="appGalgaVol_${idx}" value="${vol.toFixed(2)}">
            </div>
          </div>
        </div>
      `;
    }).join("");

    modal.style.display = "flex";
  },

  aoAlternarCheckboxGalga(isChecked) {
    const btn = document.getElementById("btnAppConfirmarGalga");
    if (btn) btn.disabled = !isChecked;
  },

  aoAjustarMedidaGalga(idx) {
    const comp = parseFloat(document.getElementById(`appGalgaComp_${idx}`)?.value) || 0;
    const larg = parseFloat(document.getElementById(`appGalgaLarg_${idx}`)?.value) || 0;
    const prof = parseFloat(document.getElementById(`appGalgaProf_${idx}`)?.value) || 0;

    if (comp > 0 && larg > 0 && prof > 0) {
      const areaFundo = comp * larg;
      const areaParedes = 2 * (comp + larg) * prof;
      const areaRevest = areaFundo + areaParedes;
      const areaLamina = parseFloat((areaRevest * 1.15).toFixed(2));
      const volM3 = parseFloat((comp * larg * prof).toFixed(2));

      const elRev = document.getElementById(`appGalgaRev_${idx}`);
      const elLam = document.getElementById(`appGalgaLam_${idx}`);
      const elVol = document.getElementById(`appGalgaVol_${idx}`);

      if (elRev) elRev.value = areaRevest.toFixed(2);
      if (elLam) elLam.value = areaLamina.toFixed(2);
      if (elVol) elVol.value = volM3.toFixed(2);
    }
  },

  async executarConfirmacaoGalga() {
    const budget = App.selectedBudgetForGalga;
    if (!budget) return;

    const pools = budget.pools || [];
    pools.forEach((p, idx) => {
      const comp = parseFloat(document.getElementById(`appGalgaComp_${idx}`)?.value);
      const larg = parseFloat(document.getElementById(`appGalgaLarg_${idx}`)?.value);
      const prof = parseFloat(document.getElementById(`appGalgaProf_${idx}`)?.value);
      const rev = parseFloat(document.getElementById(`appGalgaRev_${idx}`)?.value);
      const lam = parseFloat(document.getElementById(`appGalgaLam_${idx}`)?.value);
      const vol = parseFloat(document.getElementById(`appGalgaVol_${idx}`)?.value);

      if (!isNaN(comp) && comp > 0) p.comprimento_m = comp;
      if (!isNaN(larg) && larg > 0) p.largura_m = larg;
      if (!isNaN(prof) && prof > 0) p.profundidade_m = prof;
      if (!isNaN(rev) && rev > 0) p.internal_area_m2 = rev;
      if (!isNaN(lam) && lam > 0) p.lamination_area_m2 = lam;
      if (!isNaN(vol) && vol > 0) {
        p.internal_volume_m3 = vol;
        p.internal_volume_liters = vol * 1000;
      }
    });

    budget.stage = "galga";
    App.closeAllModals();

    const saved = await DB.saveBudget(budget, pools);
    if (saved) {
      App.showToast(`Orçamento ${budget.budget_code} avançado para Galga (0% de margem) com medidas validadas!`, "success");
      await App.loadBudgets();
    }
  },

  // ==============================================================================
  // MODAL DIVIDIR UNIDADES (INCORPORADORA - MULTI-MODELOS SIMULTÂNEOS)
  // Permite selecionar 2 do modelo A, 1 do modelo B etc. em uma única operação.
  // ==============================================================================
  // ==============================================================================
  // MODAL DIVIDIR UNIDADES (INCORPORADORA - MULTI-MODELOS SIMULTÂNEOS)
  // Permite selecionar 2 do modelo A, 1 do modelo B etc. em uma única operação.
  // ==============================================================================
  getNomeRevestimento(p) {
    if (p.coating_name) return p.coating_name;
    const map = {
      pastilha_15x15: "Pastilha 15×15 cm",
      pastilha_10x10: "Pastilha 10×10 cm",
      pastilha_7_5x7_5: "Pastilha 7,5×7,5 cm",
      pastilha_5x5: "Pastilha 5×5 cm",
      porcelanato_villagres: "Porcelanato Villagres",
      personalizado: "Revestimento Personalizado"
    };
    return map[p.coating_type] || (p.coating_type ? p.coating_type.replace(/_/g, ' ') : "Pastilha 15×15 cm");
  },

  gerarSugestoesCodigo(originalCode) {
    if (!originalCode) return { sugA: "ORC-LOTE-B", sugB: "ORC-LOTE-2", sugC: "ORC-NOVO" };
    
    // Sugestão 1: Sufixo alfabético (-B, -C, etc.)
    const baseClean = originalCode.replace(/-[A-Z0-9]+$/, "");
    let sugA = `${originalCode}-B`;
    const letters = ["B", "C", "D", "E", "F", "G"];
    for (let l of letters) {
      const candidate = `${originalCode}-${l}`;
      if (!App.budgets.some(b => b.budget_code === candidate)) {
        sugA = candidate;
        break;
      }
    }

    // Sugestão 2: Sufixo de Lote (-LOTE2, -LOTE3, etc.)
    let sugB = `${originalCode}-LOTE2`;
    for (let i = 2; i <= 9; i++) {
      const candidate = `${originalCode}-LOTE${i}`;
      if (!App.budgets.some(b => b.budget_code === candidate)) {
        sugB = candidate;
        break;
      }
    }

    // Sugestão 3: Próximo código sequencial livre da empresa
    let sugC = "";
    const match = originalCode.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2]);
      let nextNum = num + 1;
      while (App.budgets.some(b => b.budget_code === `${prefix}${nextNum}`)) {
        nextNum++;
      }
      sugC = `${prefix}${nextNum}`;
    } else {
      sugC = `${originalCode}-2`;
    }

    return { sugA, sugB, sugC };
  },

  aplicarSugestaoCodigo(code) {
    const input = document.getElementById("splitNewBudgetCode");
    if (input) {
      input.value = code;
      input.focus();
    }
    if (App.splitData) {
      App.splitData.budgetCode = code;
    }
  },

  aplicarPredefinicaoDesmembramento(tipo) {
    if (!App.selectedBudgetForAction || !App.splitData) return;
    const pools = App.selectedBudgetForAction.pools;

    if (tipo === "um_cada") {
      pools.forEach(p => {
        App.definirQtdDesmembrar(p.id, 1);
      });
    } else if (tipo === "metade") {
      pools.forEach(p => {
        const total = parseInt(p.units_count) || 1;
        const half = Math.max(0, Math.floor(total / 2));
        App.definirQtdDesmembrar(p.id, half);
      });
    } else if (tipo === "zerar") {
      pools.forEach(p => {
        App.definirQtdDesmembrar(p.id, 0);
      });
    }
  },

  abrirModalDividirOrcamento(budgetId) {
    const budget = App.budgets.find(b => b.id === budgetId);
    if (!budget || !budget.pools || budget.pools.length === 0) return;

    const sugestoes = App.gerarSugestoesCodigo(budget.budget_code);

    App.selectedBudgetForAction = budget;
    App.splitData = {
      budgetId: budget.id,
      items: {},
      budgetCode: sugestoes.sugA,
      projectName: `${budget.project_name} (Lote Desmembrado)`
    };

    // Inicializa as quantidades a desmembrar como 0
    budget.pools.forEach(p => {
      App.splitData.items[p.id] = 0;
    });

    const modal = document.getElementById("modalDividirUnidades");
    const container = document.getElementById("conteudoDividirUnidades");
    if (!modal || !container) return;

    const totalPiscinas = budget.pools.reduce((s, p) => s + (parseInt(p.units_count) || 1), 0);

    container.innerHTML = `
      <div class="split-header-banner">
        <div class="split-header-title-row">
          <div>
            <span class="split-budget-code-badge">${budget.budget_code}</span>
            <strong style="font-size: 14px; color: #0f172a; margin-left: 6px;">${budget.project_name}</strong>
          </div>
          <span style="font-size: 12px; color: #64748b; font-weight: 600;">Total no orçamento: <strong>${totalPiscinas} piscinas</strong></span>
        </div>
        <p class="split-header-desc">
          Defina as quantidades que deseja desmembrar de <strong>cada modelo simultaneamente</strong> para compor um novo lote (ex: 1 unidade do Modelo A + 2 unidades do Modelo B).
        </p>
      </div>

      <!-- Barra de Atalhos Rápidos -->
      <div class="split-presets-bar">
        <span class="split-presets-label">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          Atalhos de Seleção Rápida:
        </span>
        <div class="split-presets-actions">
          <button type="button" class="btn-preset-action highlight" onclick="App.aplicarPredefinicaoDesmembramento('um_cada')" title="Seleciona 1 unidade de cada modelo automaticamente">
            Desmembrar 1 un de cada modelo
          </button>
          <button type="button" class="btn-preset-action" onclick="App.aplicarPredefinicaoDesmembramento('metade')" title="Seleciona metade das unidades de cada modelo">
            Desmembrar 50% (Metade)
          </button>
          <button type="button" class="btn-preset-action" onclick="App.aplicarPredefinicaoDesmembramento('zerar')" title="Zera a seleção de todos os modelos">
            Zerar Seleção
          </button>
        </div>
      </div>

      <div class="split-section-label">
        <span>1. Modelos Disponíveis no Orçamento</span>
        <span style="font-size: 11px; text-transform: none; font-weight: 600; color: #64748b;">Ajuste nos botões + / - ou use os atalhos</span>
      </div>

      <div class="split-models-container" id="splitModelsList">
        ${budget.pools.map(p => {
          const totalUnits = parseInt(p.units_count) || 1;
          const coatingName = App.getNomeRevestimento(p);
          const dims = p.internal_area_m2 ? `${p.internal_area_m2}m² revest.` : "";
          const moldLabel = p.has_mold ? "Molde Ativo (≥10 un)" : "Sem Molde";

          return `
            <div class="split-model-card" id="splitCard_${p.id}">
              <div class="split-model-info">
                <div class="split-model-name-line">
                  <span class="split-model-name-text">${p.model_name}</span>
                  <span class="badge-coating-highlight" title="Revestimento especificado para este modelo">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    ${coatingName}
                  </span>
                </div>
                <div class="split-spec-tags">
                  <span class="split-spec-pill total">Total no orçamento: <strong>${totalUnits} un</strong></span>
                  ${dims ? `<span class="split-spec-pill">${dims}</span>` : ""}
                  <span class="split-spec-pill ${p.has_mold ? 'mold-active' : ''}">${moldLabel}</span>
                </div>
                <div class="split-status-text" id="splitStatus_${p.id}">
                  Nenhuma unidade selecionada para este modelo
                </div>
              </div>

              <div class="split-controls-wrap">
                <div class="split-stepper-row">
                  <button type="button" class="btn-split-step" id="btnMinus_${p.id}" onclick="App.ajustarQtdDesmembrar('${p.id}', -1)" title="Diminuir 1 unidade">&minus;</button>
                  <input type="number" id="inputSplit_${p.id}" class="input-split-num" value="0" min="0" max="${totalUnits}" oninput="App.definirQtdDesmembrar('${p.id}', this.value)">
                  <button type="button" class="btn-split-step" id="btnPlus_${p.id}" onclick="App.ajustarQtdDesmembrar('${p.id}', 1)" title="Adicionar 1 unidade">&plus;</button>
                </div>
                <div class="split-quick-actions">
                  <button type="button" class="btn-quick-split" onclick="App.zerarQtdDesmembrar('${p.id}')">0</button>
                  <button type="button" class="btn-quick-split" onclick="App.definirQtdDesmembrar('${p.id}', 1)">1 un</button>
                  ${totalUnits >= 2 ? `<button type="button" class="btn-quick-split" onclick="App.definirQtdDesmembrar('${p.id}', 2)">2 un</button>` : ""}
                  ${totalUnits >= 5 ? `<button type="button" class="btn-quick-split" onclick="App.definirQtdDesmembrar('${p.id}', 5)">5 un</button>` : ""}
                  <button type="button" class="btn-quick-split" onclick="App.tudoQtdDesmembrar('${p.id}')" title="Selecionar todas as unidades deste modelo">Todas (${totalUnits})</button>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <div class="split-section-label">
        <span>2. Identificação e Código do Novo Orçamento</span>
      </div>

      <div class="split-config-card">
        <div class="split-config-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span>Configuração do Novo Orçamento Gerado</span>
        </div>

        <div class="form-group" style="margin-bottom: 12px;">
          <label class="form-label" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 12px; font-weight: 700; color: #1e293b;">Número / Código do Novo Orçamento:</span>
            <span style="font-size: 11px; font-weight: 500; color: #64748b;">(Sugerido automaticamente • Editável)</span>
          </label>
          <div class="input-with-code-sug">
            <input type="text" id="splitNewBudgetCode" class="form-control" style="font-family: monospace; font-size: 13.5px; font-weight: 800; color: #0284c7; background: #ffffff;" value="${sugestoes.sugA}" placeholder="Ex: ${budget.budget_code}-B">
            <div class="sug-chips-row">
              <span class="sug-hint-txt">Sugestões de código:</span>
              <button type="button" class="btn-sug-chip" onclick="App.aplicarSugestaoCodigo('${sugestoes.sugA}')" title="Usar sufixo de lote">${sugestoes.sugA}</button>
              <button type="button" class="btn-sug-chip" onclick="App.aplicarSugestaoCodigo('${sugestoes.sugB}')" title="Usar identificador de lote">${sugestoes.sugB}</button>
              <button type="button" class="btn-sug-chip" onclick="App.aplicarSugestaoCodigo('${sugestoes.sugC}')" title="Usar próximo código sequencial">${sugestoes.sugC}</button>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 10px;">
          <label class="form-label" style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 4px; display: block;">Nome do Novo Projeto / Empreendimento:</label>
          <input type="text" id="splitNewProjectName" class="form-control" value="${budget.project_name} (Lote Desmembrado)" placeholder="Ex: Residencial Terras do Sul - Lote Quadra 4">
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 12px; font-weight: 700; color: #1e293b; margin-bottom: 4px; display: block;">Observações Técnicas / Motivo do Desmembramento (Opcional):</label>
          <input type="text" id="splitNewNotes" class="form-control" placeholder="Ex: Desmembrado para lote prioritário de entrega (Fase 1).">
        </div>
      </div>

      <div class="split-section-label">
        <span>3. Resumo do Desmembramento em Tempo Real</span>
      </div>

      <div class="split-summary-grid">
        <div class="split-summary-box dest">
          <div class="split-summary-header">
            <span class="split-summary-title">Novo Orçamento Gerado</span>
            <span class="split-summary-count" id="summaryDestCount">0 unidades</span>
          </div>
          <div class="split-chips-list" id="summaryDestChips">
            <span style="font-size: 11.5px; color: #94a3b8; font-style: italic;">Nenhuma piscina selecionada</span>
          </div>
        </div>

        <div class="split-summary-box src">
          <div class="split-summary-header">
            <span class="split-summary-title">Orçamento Original Remanescente</span>
            <span class="split-summary-count" id="summarySrcCount">${totalPiscinas} unidades</span>
          </div>
          <div class="split-chips-list" id="summarySrcChips">
            <!-- Injetado dinamicamente -->
          </div>
        </div>
      </div>

      <div id="splitWarningBanner" class="split-warning-banner info" style="display: none;"></div>

      <div class="split-modal-footer">
        <button type="button" class="btn btn-secondary" onclick="App.closeAllModals()">Cancelar</button>
        <button type="button" id="btnConfirmSplitAction" class="btn-confirm-split" onclick="App.executarDivisaoMultipla('${budget.id}')" disabled>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="17 1 21 5 17 9"></polyline>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
            <polyline points="7 23 3 19 7 15"></polyline>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
          </svg>
          <span id="btnConfirmSplitText">Selecione unidades para desmembrar</span>
        </button>
      </div>
    `;

    modal.style.display = "flex";
    App.atualizarResumoDesmembramento();
  },

  ajustarQtdDesmembrar(poolId, delta) {
    if (!App.selectedBudgetForAction || !App.splitData) return;
    const pool = App.selectedBudgetForAction.pools.find(p => p.id === poolId);
    if (!pool) return;

    const maxUnits = parseInt(pool.units_count) || 1;
    const current = App.splitData.items[poolId] || 0;
    const nextVal = Math.max(0, Math.min(maxUnits, current + delta));

    App.splitData.items[poolId] = nextVal;
    const input = document.getElementById(`inputSplit_${poolId}`);
    if (input) input.value = nextVal;

    App.atualizarResumoDesmembramento();
  },

  definirQtdDesmembrar(poolId, val) {
    if (!App.selectedBudgetForAction || !App.splitData) return;
    const pool = App.selectedBudgetForAction.pools.find(p => p.id === poolId);
    if (!pool) return;

    const maxUnits = parseInt(pool.units_count) || 1;
    let num = parseInt(val);
    if (isNaN(num)) num = 0;
    const nextVal = Math.max(0, Math.min(maxUnits, num));

    App.splitData.items[poolId] = nextVal;
    const input = document.getElementById(`inputSplit_${poolId}`);
    if (input && input.value !== String(nextVal)) input.value = nextVal;

    App.atualizarResumoDesmembramento();
  },

  zerarQtdDesmembrar(poolId) {
    App.definirQtdDesmembrar(poolId, 0);
  },

  tudoQtdDesmembrar(poolId) {
    if (!App.selectedBudgetForAction) return;
    const pool = App.selectedBudgetForAction.pools.find(p => p.id === poolId);
    if (!pool) return;
    App.definirQtdDesmembrar(poolId, parseInt(pool.units_count) || 1);
  },

  atualizarResumoDesmembramento() {
    if (!App.selectedBudgetForAction || !App.splitData) return;
    const budget = App.selectedBudgetForAction;

    let totalMoving = 0;
    let totalRemaining = 0;
    const movingChips = [];
    const remainingChips = [];

    budget.pools.forEach(pool => {
      const maxUnits = parseInt(pool.units_count) || 1;
      const qtyMoving = App.splitData.items[pool.id] || 0;
      const qtyRemaining = maxUnits - qtyMoving;
      const coatingName = App.getNomeRevestimento(pool);

      totalMoving += qtyMoving;
      totalRemaining += qtyRemaining;

      // Atualiza visual do card do modelo
      const card = document.getElementById(`splitCard_${pool.id}`);
      const statusText = document.getElementById(`splitStatus_${pool.id}`);
      const btnMinus = document.getElementById(`btnMinus_${pool.id}`);
      const btnPlus = document.getElementById(`btnPlus_${pool.id}`);

      if (btnMinus) btnMinus.disabled = (qtyMoving <= 0);
      if (btnPlus) btnPlus.disabled = (qtyMoving >= maxUnits);

      if (card) {
        if (qtyMoving > 0) {
          card.classList.add("has-selection");
        } else {
          card.classList.remove("has-selection");
        }
      }

      if (statusText) {
        if (qtyMoving > 0) {
          statusText.className = "split-status-text active";
          statusText.innerHTML = `<strong>${qtyMoving} un</strong> irão para o novo orçamento • <strong>${qtyRemaining} un</strong> restarão no original`;
        } else {
          statusText.className = "split-status-text";
          statusText.textContent = `Nenhuma unidade selecionada (permanecerão todas as ${maxUnits} un)`;
        }
      }

      if (qtyMoving > 0) {
        movingChips.push(`<span class="split-chip highlight">${qtyMoving}x ${pool.model_name} (${coatingName})</span>`);
      }
      if (qtyRemaining > 0) {
        remainingChips.push(`<span class="split-chip">${qtyRemaining}x ${pool.model_name}</span>`);
      }
    });

    // Atualiza caixas de resumo
    const elDestCount = document.getElementById("summaryDestCount");
    const elDestChips = document.getElementById("summaryDestChips");
    const elSrcCount = document.getElementById("summarySrcCount");
    const elSrcChips = document.getElementById("summarySrcChips");

    if (elDestCount) {
      elDestCount.textContent = `${totalMoving} ${totalMoving === 1 ? 'unidade' : 'unidades'}`;
    }
    if (elDestChips) {
      elDestChips.innerHTML = movingChips.length > 0
        ? movingChips.join("")
        : `<span style="font-size: 11.5px; color: #94a3b8; font-style: italic;">Nenhuma piscina selecionada</span>`;
    }

    if (elSrcCount) {
      elSrcCount.textContent = `${totalRemaining} ${totalRemaining === 1 ? 'unidade' : 'unidades'}`;
    }
    if (elSrcChips) {
      elSrcChips.innerHTML = remainingChips.length > 0
        ? remainingChips.join("")
        : `<span style="font-size: 11.5px; color: #ef4444; font-weight: 700;">Nenhuma unidade restará!</span>`;
    }

    // Validações e estado do botão de confirmação
    const btnConfirm = document.getElementById("btnConfirmSplitAction");
    const btnText = document.getElementById("btnConfirmSplitText");
    const warning = document.getElementById("splitWarningBanner");

    if (!btnConfirm || !btnText) return;

    if (totalMoving === 0) {
      btnConfirm.disabled = true;
      btnText.textContent = "Selecione unidades para desmembrar";
      if (warning) warning.style.display = "none";
    } else if (totalRemaining === 0) {
      btnConfirm.disabled = true;
      btnText.textContent = "Mantenha ao menos 1 unidade no original";
      if (warning) {
        warning.className = "split-warning-banner error";
        warning.style.display = "flex";
        warning.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span><strong>Desmembramento Bloqueado:</strong> O orçamento original não pode ficar completamente vazio (0 unidades). Reduza ao menos 1 unidade em um dos modelos.</span>
        `;
      }
    } else {
      btnConfirm.disabled = false;
      btnText.textContent = `Desmembrar Tudo de Uma Vez (${totalMoving} ${totalMoving === 1 ? 'unidade' : 'unidades'})`;
      if (warning) {
        warning.className = "split-warning-banner info";
        warning.style.display = "flex";
        warning.innerHTML = `
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Tudo pronto! Um novo orçamento de lote será gerado com as <strong>${totalMoving} unidades</strong> selecionadas e o orçamento original continuará com <strong>${totalRemaining} unidades</strong>.</span>
        `;
      }
    }
  },

  async executarDivisaoMultipla(budgetId) {
    if (!App.splitData) return;

    const itemsToMove = Object.entries(App.splitData.items)
      .map(([poolId, unitsToMove]) => ({ poolId, unitsToMove }))
      .filter(m => m.unitsToMove > 0);

    if (itemsToMove.length === 0) {
      App.showToast("Selecione pelo menos 1 unidade para desmembrar.", "warning");
      return;
    }

    const codeInput = document.getElementById("splitNewBudgetCode");
    const projNameInput = document.getElementById("splitNewProjectName");
    const notesInput = document.getElementById("splitNewNotes");

    const options = {
      budgetCode: codeInput ? codeInput.value.trim() : "",
      projectName: projNameInput ? projNameInput.value.trim() : "",
      notes: notesInput ? notesInput.value.trim() : ""
    };

    const btnConfirm = document.getElementById("btnConfirmSplitAction");
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = `<span style="display: inline-block; animation: spin 0.8s linear infinite;">⏳</span> Gerando lote...`;
    }

    try {
      const res = await DB.splitBudgetMulti(budgetId, itemsToMove, options);
      if (res && res.destinationBudget) {
        App.closeAllModals();
        App.showToast(`Lote desmembrado com sucesso! Novo orçamento ${res.destinationBudget.budget_code} gerado com ${res.totalMoving} piscinas.`, "success");
        await App.loadBudgets();
      } else {
        if (btnConfirm) {
          btnConfirm.disabled = false;
          App.atualizarResumoDesmembramento();
        }
      }
    } catch (e) {
      console.error("[App] Erro ao desmembrar unidades:", e);
      App.showToast("Erro inesperado ao desmembrar unidades. Tente novamente.", "error");
      if (btnConfirm) {
        btnConfirm.disabled = false;
        App.atualizarResumoDesmembramento();
      }
    }
  },

  // Mantido para compatibilidade se invocado diretamente
  async executarDivisao(budgetId, poolId) {
    const input = document.getElementById(`inputSplitUnits_${poolId}`);
    const units = parseInt(input ? input.value : 1) || 1;

    const res = await DB.splitBudgetUnits(budgetId, poolId, units);
    if (res) {
      App.closeAllModals();
      App.showToast(`Unidades desmembradas com sucesso! Novo orçamento ${res.destinationBudget.budget_code} gerado.`, "success");
      await App.loadBudgets();
    }
  },

  // Modal Atribuir Responsável
  abrirModalReatribuir(budgetId) {
    const budget = App.budgets.find(b => b.id === budgetId);
    if (!budget) return;
    App.selectedBudgetForAction = budget;

    const users = Auth.getAllUsers();
    const modal = document.getElementById("modalReatribuir");
    const container = document.getElementById("conteudoReatribuir");
    if (!modal || !container) return;

    container.innerHTML = `
      <p class="field-hint">Selecione o membro da equipe responsável pelo orçamento <strong>${budget.budget_code}</strong>:</p>
      <div class="users-list-select" style="margin-top: 10px;">
        ${users.map(u => `
          <div class="user-select-card ${budget.assigned_user_id === u.id ? 'active' : ''}" onclick="App.salvarReatribuicao('${budget.id}', '${u.id}', '${u.name}')">
            <div class="user-avatar" style="background: ${u.avatar_color || '#0284c7'}">${u.name.slice(0, 2).toUpperCase()}</div>
            <div class="user-info">
              <div class="user-name">${u.name}</div>
              <div class="user-permissions">${u.email} &bull; ${(u.allowed_divisions || []).join(', ')}</div>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    modal.style.display = "flex";
  },

  async salvarReatribuicao(budgetId, userId, userName) {
    await DB.reassignBudget(budgetId, userId, userName);
    App.closeAllModals();
    App.showToast(`Orçamento atribuído a ${userName}!`, "success");
    await App.loadBudgets();
  },

  // ============================================================================
  // GESTÃO DE USUÁRIOS E SESSÃO ATIVA (SEÇÃO 3)
  // Administrador pode gerenciar equipe, configurar divisões, etapas e permissões
  // ============================================================================
  toggleUserModal(tab = "switch") {
    const m = document.getElementById("modalUserSelect");
    if (!m) return;
    const isVis = m.style.display !== "none";
    if (isVis && tab === App.userModalTab) {
      m.style.display = "none";
      return;
    }
    m.style.display = "flex";
    App.alternarAbaUsuario(tab);
  },

  abrirModalGerenciarUsuarios() {
    App.toggleUserModal("manage");
  },

  alternarAbaUsuario(tab) {
    App.userModalTab = tab;
    const isAdmin = Auth.isAdmin();

    const btnSwitch = document.getElementById("tabBtnAlternarUsuario");
    const btnManage = document.getElementById("tabBtnGerenciarEquipe");

    if (btnSwitch) btnSwitch.classList.toggle("active", tab === "switch");
    if (btnManage) {
      btnManage.classList.toggle("active", tab === "manage" || tab === "edit");
      btnManage.style.display = isAdmin ? "inline-flex" : "none";
    }

    App.renderUserModalContent();
  },

  renderUserModalContent() {
    const container = document.getElementById("modalUserBody");
    if (!container) return;

    const current = Auth.getCurrentUser();
    const isAdmin = Auth.isAdmin();
    const users = Auth.getAllUsers();

    if (App.userModalTab === "switch") {
      const divLabels = {
        sob_medida: "iGUi Sob Medida",
        incorporadora: "iGUi Incorporadora",
        internacional: "iGUi Internacional"
      };

      container.innerHTML = `
        <div style="margin-bottom: 12px;">
          <p class="field-hint" style="margin: 0; font-size: 13px; line-height: 1.4;">
            Selecione uma conta para alternar a sessão ativa e testar as permissões de acesso (ex: Victor Lourenço só enxerga iGUi Sob Medida; Administrador tem acesso irrestrito):
          </p>
        </div>

        <div class="users-list-select">
          ${users.map(u => {
            const isCurrent = u.id === current.id;
            const parts = (u.name || "U").trim().split(" ");
            const initials = parts.length > 1 
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() 
              : parts[0].slice(0, 2).toUpperCase();
            const roleLabel = u.role === "admin" ? "Administrador / Diretor" : "Projetista";
            const allowedDivs = u.allowed_divisions || ["sob_medida"];

            return `
              <div class="user-select-card ${isCurrent ? 'active' : ''}" onclick="App.selecionarUsuarioSessao('${u.id}')">
                <div class="user-avatar" style="background: ${u.avatar_color || '#0284c7'}">${initials}</div>
                <div class="user-info">
                  <div class="user-name-row">
                    <span class="user-name">${u.name}</span>
                    <span class="badge-role ${u.role === 'admin' ? 'admin' : ''}">${roleLabel}</span>
                    ${isCurrent ? '<span class="badge-active-user">● Conectado</span>' : ''}
                  </div>
                  <div class="user-email-text">${u.email}</div>
                  <div class="user-permissions-chips">
                    ${allowedDivs.map(d => `
                      <span class="tag-perm-chip ${d.replace('_', '-')}">
                        ${divLabels[d] || d}
                      </span>
                    `).join('')}
                  </div>
                </div>
                <div class="user-card-actions" onclick="event.stopPropagation()">
                  ${isAdmin ? `
                    <button type="button" class="btn-card-edit" onclick="App.abrirFormEditarUsuario('${u.id}')" title="Editar permissões e dados deste usuário">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                      Editar
                    </button>
                  ` : ''}
                  ${!isCurrent ? `
                    <button type="button" class="btn btn-sm btn-primary" onclick="App.selecionarUsuarioSessao('${u.id}')" title="Conectar nesta conta">
                      Entrar
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join("")}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; flex-wrap: wrap; gap: 8px;">
          <div>
            ${isAdmin ? `
              <button type="button" class="btn btn-sm btn-primary" onclick="App.abrirFormNovoUsuario()">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: -1px; margin-right: 3px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Novo Usuário
              </button>
              <a href="precos.html?tab=usuarios" class="btn btn-sm btn-secondary" style="margin-left: 6px;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                Configurações & Usuários
              </a>
            ` : `
              <span class="field-hint" style="font-size: 12px;">Conectado como <strong>${current.name}</strong> (${current.email})</span>
            `}
          </div>

          <div style="display: flex; gap: 8px; align-items: center;">
            <button type="button" class="btn btn-sm btn-logout" onclick="Auth.logout()" title="Encerrar Sessão e Sair do Sistema" style="padding: 6px 10px;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
          </div>
        </div>
      `;

    } else if (App.userModalTab === "manage") {
      if (!isAdmin) {
        App.showToast("Apenas administradores podem gerenciar usuários.", "error");
        App.alternarAbaUsuario("switch");
        return;
      }

      const adminCount = users.filter(u => u.role === "admin").length;
      const projCount = users.length - adminCount;
      const divLabels = {
        sob_medida: "Sob Medida",
        incorporadora: "Incorporadora",
        internacional: "Internacional"
      };
      const stageLabels = {
        previa: "1. Prévia",
        galga: "2. Galga",
        desenho_tecnico: "3. Desenho Técnico"
      };

      container.innerHTML = `
        <div class="user-stats-strip">
          <div class="user-stat-item">
            <span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 3px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
              Membros na Equipe:
            </span>
            <span class="user-stat-val">${users.length}</span>
          </div>
          <div class="user-stat-item">
            <span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 3px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              Admins:
            </span>
            <span class="user-stat-val">${adminCount}</span>
          </div>
          <div class="user-stat-item">
            <span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 3px;"><path d="M2 12c2.5-3 5.5-3 8 0s5.5 3 8 0 3-1.5 4-1.5"></path></svg>
              Projetistas:
            </span>
            <span class="user-stat-val">${projCount}</span>
          </div>
          <div style="margin-left: auto;">
            <button type="button" class="btn btn-sm btn-primary" onclick="App.abrirFormNovoUsuario()">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: -1px; margin-right: 3px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Cadastrar Novo Usuário
            </button>
          </div>
        </div>

        <div class="users-management-list">
          ${users.map(u => {
            const isCurrent = u.id === current.id;
            const parts = (u.name || "U").trim().split(" ");
            const initials = parts.length > 1 
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() 
              : parts[0].slice(0, 2).toUpperCase();
            const allowedDivs = u.allowed_divisions || ["sob_medida"];
            const allowedStages = u.allowed_stages || ["previa", "galga", "desenho_tecnico"];

            return `
              <div class="user-manage-item">
                <div class="user-manage-left">
                  <div class="user-avatar" style="background: ${u.avatar_color || '#0284c7'}">${initials}</div>
                  <div class="user-info">
                    <div class="user-name-row">
                      <span class="user-name">${u.name}</span>
                      <span class="badge-role ${u.role === 'admin' ? 'admin' : ''}">${u.role === 'admin' ? 'Administrador' : 'Projetista'}</span>
                      ${isCurrent ? '<span class="badge-active-user">● Sessão Ativa</span>' : ''}
                    </div>
                    <div class="user-email-text">${u.email}</div>
                    <div class="user-permissions-chips">
                      ${allowedDivs.map(d => `
                        <span class="tag-perm-chip ${d.replace('_', '-')}">${divLabels[d] || d}</span>
                      `).join('')}
                      <span style="color: #94a3b8; font-size: 10px; margin: 0 2px;">•</span>
                      ${allowedStages.map(s => `
                        <span class="tag-perm-chip stage-chip">${stageLabels[s] || s}</span>
                      `).join('')}
                    </div>
                  </div>
                </div>

                <div class="user-manage-actions">
                  <button type="button" class="btn btn-sm btn-secondary" onclick="App.abrirFormEditarUsuario('${u.id}')">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 2px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Editar
                  </button>
                  ${!isCurrent ? `
                    <button type="button" class="btn btn-sm btn-danger" onclick="App.excluirUsuario('${u.id}')" title="Excluir usuário da equipe">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  ` : `
                    <button type="button" class="btn btn-sm btn-secondary" disabled title="Não é possível excluir o usuário ativo conectado" style="opacity: 0.4; cursor: not-allowed;">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;

    } else if (App.userModalTab === "edit") {
      if (!isAdmin) {
        App.showToast("Apenas administradores podem gerenciar usuários.", "error");
        App.alternarAbaUsuario("switch");
        return;
      }

      const u = App.editingUserId ? Auth.getUserById(App.editingUserId) : null;
      const isNew = !u;
      const user = u || {
        name: "",
        email: "",
        role: "user",
        allowed_divisions: ["sob_medida"],
        allowed_stages: ["previa", "galga", "desenho_tecnico"],
        avatar_color: "#0284c7"
      };

      App.selectedAvatarColor = user.avatar_color || "#0284c7";
      const colors = [
        { hex: "#0284c7", name: "Azul iGUi" },
        { hex: "#059669", name: "Verde Esmeralda" },
        { hex: "#ea580c", name: "Laranja Papa" },
        { hex: "#7c3aed", name: "Roxo" },
        { hex: "#dc2626", name: "Vermelho" },
        { hex: "#0891b2", name: "Ciano" },
        { hex: "#4f46e5", name: "Índigo" },
        { hex: "#d97706", name: "Âmbar" }
      ];

      const hasSob = (user.allowed_divisions || []).includes("sob_medida");
      const hasInc = (user.allowed_divisions || []).includes("incorporadora");
      const hasInt = (user.allowed_divisions || []).includes("internacional");

      const hasPrevia = (user.allowed_stages || []).includes("previa");
      const hasGalga = (user.allowed_stages || []).includes("galga");
      const hasDesenho = (user.allowed_stages || []).includes("desenho_tecnico");

      container.innerHTML = `
        <div class="user-form-card">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>${isNew ? 'Cadastrar Novo Usuário da Equipe' : `Editar Usuário & Permissões: ${user.name}`}</span>
            </h3>
            <button type="button" class="btn btn-sm btn-secondary" onclick="App.alternarAbaUsuario('manage')">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 2px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Voltar à Lista
            </button>
          </div>

          <div class="grid-2" style="gap: 12px; margin-top: 4px;">
            <div class="form-group">
              <label class="form-label font-bold">Nome Completo:</label>
              <input type="text" id="formUserName" class="form-control" value="${user.name}" placeholder="Ex: Roberto da Silva">
            </div>
            <div class="form-group">
              <label class="form-label font-bold">E-mail de Acesso (Login SketchUp & Web):</label>
              <input type="email" id="formUserEmail" class="form-control" value="${user.email}" placeholder="Ex: roberto@papa.com">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label font-bold">Perfil de Acesso / Papel:</label>
            <select id="formUserRole" class="form-control" onchange="App.onRoleChangeSelect()">
              <option value="user" ${user.role === 'user' ? 'selected' : ''}>Usuário Comum / Projetista (Acesso restrito às divisões e páginas selecionadas)</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador / Diretor (Acesso irrestrito a todas as 3 divisões, páginas, Dashboard e Preços)</option>
            </select>
          </div>

          <div>
            <div class="form-section-title">1. Divisões Autorizadas</div>
            <div class="interactive-perm-grid">
              <div class="interactive-perm-card ${hasSob ? 'checked' : ''}" id="cardDivSobMedida" onclick="App.togglePermCard('chkDivSobMedida', 'cardDivSobMedida')">
                <input type="checkbox" id="chkDivSobMedida" ${hasSob ? 'checked' : ''} style="margin-top: 3px;" onclick="event.stopPropagation(); App.syncCardCheck('chkDivSobMedida', 'cardDivSobMedida');">
                <span class="perm-card-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M2 12c2.5-3 5.5-3 8 0s5.5 3 8 0 3-1.5 4-1.5"></path>
                    <path d="M2 17c2.5-3 5.5-3 8 0s5.5 3 8 0 3-1.5 4-1.5"></path>
                  </svg>
                </span>
                <div class="perm-card-content">
                  <span class="perm-card-title">iGUi Sob Medida</span>
                  <span class="perm-card-desc">Projetos unitários personalizados (1 orçamento = 1 piscina)</span>
                </div>
              </div>

              <div class="interactive-perm-card ${hasInc ? 'checked' : ''}" id="cardDivInc" onclick="App.togglePermCard('chkDivInc', 'cardDivInc')">
                <input type="checkbox" id="chkDivInc" ${hasInc ? 'checked' : ''} style="margin-top: 3px;" onclick="event.stopPropagation(); App.syncCardCheck('chkDivInc', 'cardDivInc');">
                <span class="perm-card-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                    <path d="M9 22v-4h6v4"></path>
                    <line x1="8" y1="6" x2="10" y2="6"></line>
                    <line x1="14" y1="6" x2="16" y2="6"></line>
                  </svg>
                </span>
                <div class="perm-card-content">
                  <span class="perm-card-title">iGUi Incorporadora</span>
                  <span class="perm-card-desc">Múltiplos modelos, cálculo de moldes e divisão de unidades</span>
                </div>
              </div>

              <div class="interactive-perm-card ${hasInt ? 'checked' : ''}" id="cardDivInt" onclick="App.togglePermCard('chkDivInt', 'cardDivInt')">
                <input type="checkbox" id="chkDivInt" ${hasInt ? 'checked' : ''} style="margin-top: 3px;" onclick="event.stopPropagation(); App.syncCardCheck('chkDivInt', 'cardDivInt');">
                <span class="perm-card-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </span>
                <div class="perm-card-content">
                  <span class="perm-card-title">iGUi Internacional</span>
                  <span class="perm-card-desc">Orçamentos para exportação e projetos internacionais</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="form-section-title">2. Páginas / Etapas Autorizadas</div>
            <div class="interactive-perm-grid">
              <div class="interactive-perm-card ${hasPrevia ? 'checked' : ''}" id="cardStagePrevia" onclick="App.togglePermCard('chkStagePrevia', 'cardStagePrevia')">
                <input type="checkbox" id="chkStagePrevia" ${hasPrevia ? 'checked' : ''} style="margin-top: 3px;" onclick="event.stopPropagation(); App.syncCardCheck('chkStagePrevia', 'cardStagePrevia');">
                <span class="perm-card-icon" style="font-weight: 800; font-size: 14px; color: var(--igui-blue);">1</span>
                <div class="perm-card-content">
                  <span class="perm-card-title">Prévia</span>
                  <span class="perm-card-desc">Estimativa preliminar com margem (+5%)</span>
                </div>
              </div>

              <div class="interactive-perm-card ${hasGalga ? 'checked' : ''}" id="cardStageGalga" onclick="App.togglePermCard('chkStageGalga', 'cardStageGalga')">
                <input type="checkbox" id="chkStageGalga" ${hasGalga ? 'checked' : ''} style="margin-top: 3px;" onclick="event.stopPropagation(); App.syncCardCheck('chkStageGalga', 'cardStageGalga');">
                <span class="perm-card-icon" style="font-weight: 800; font-size: 14px; color: var(--igui-blue);">2</span>
                <div class="perm-card-content">
                  <span class="perm-card-title">Galga (Pré-venda)</span>
                  <span class="perm-card-desc">Quadro técnico pré-venda (0% margem)</span>
                </div>
              </div>

              <div class="interactive-perm-card ${hasDesenho ? 'checked' : ''}" id="cardStageDesenho" onclick="App.togglePermCard('chkStageDesenho', 'cardStageDesenho')">
                <input type="checkbox" id="chkStageDesenho" ${hasDesenho ? 'checked' : ''} style="margin-top: 3px;" onclick="event.stopPropagation(); App.syncCardCheck('chkStageDesenho', 'cardStageDesenho');">
                <span class="perm-card-icon" style="font-weight: 800; font-size: 14px; color: var(--igui-blue);">3</span>
                <div class="perm-card-content">
                  <span class="perm-card-title">Desenho Técnico (Venda)</span>
                  <span class="perm-card-desc">Documentação técnica executiva final</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="form-section-title">3. Cor do Avatar</div>
            <div class="color-swatches-row">
              ${colors.map(c => `
                <button type="button" 
                  class="color-swatch-btn ${App.selectedAvatarColor === c.hex ? 'selected' : ''}" 
                  style="background: ${c.hex};" 
                  title="${c.name}"
                  onclick="App.selecionarCorAvatar('${c.hex}')">
                </button>
              `).join('')}
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 14px; border-top: 1px solid #e2e8f0;">
            <div>
              ${(!isNew && user.id !== current.id) ? `
                <button type="button" class="btn btn-sm btn-danger" onclick="App.excluirUsuario('${user.id}')">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  Excluir Usuário
                </button>
              ` : ''}
            </div>

            <div style="display: flex; gap: 8px;">
              <button type="button" class="btn btn-secondary" onclick="App.alternarAbaUsuario('manage')">
                Cancelar
              </button>
              <button type="button" class="btn btn-primary" onclick="App.salvarUsuarioForm()">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                Salvar Permissões
              </button>
            </div>
          </div>
        </div>
      `;
    }
  },

  abrirFormEditarUsuario(userId) {
    App.editingUserId = userId;
    App.alternarAbaUsuario("edit");
  },

  abrirFormNovoUsuario() {
    App.editingUserId = null;
    App.alternarAbaUsuario("edit");
  },

  selecionarCorAvatar(hex) {
    App.selectedAvatarColor = hex;
    document.querySelectorAll(".color-swatch-btn").forEach(b => {
      b.classList.toggle("selected", b.getAttribute("title") === hex || b.style.backgroundColor === hex);
    });
    App.renderUserModalContent();
  },

  togglePermCard(checkboxId, cardId) {
    const chk = document.getElementById(checkboxId);
    if (!chk) return;
    chk.checked = !chk.checked;
    App.syncCardCheck(checkboxId, cardId);
  },

  syncCardCheck(checkboxId, cardId) {
    const chk = document.getElementById(checkboxId);
    const card = document.getElementById(cardId);
    if (chk && card) {
      card.classList.toggle("checked", chk.checked);
    }
  },

  onRoleChangeSelect() {
    const roleSel = document.getElementById("formUserRole");
    if (!roleSel) return;
    if (roleSel.value === "admin") {
      ["chkDivSobMedida", "chkDivInc", "chkDivInt", "chkStagePrevia", "chkStageGalga", "chkStageDesenho"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = true;
      });
      ["cardDivSobMedida", "cardDivInc", "cardDivInt", "cardStagePrevia", "cardStageGalga", "cardStageDesenho"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("checked");
      });
    }
  },

  salvarUsuarioForm() {
    const nomeEl = document.getElementById("formUserName");
    const emailEl = document.getElementById("formUserEmail");
    const roleEl = document.getElementById("formUserRole");

    if (!nomeEl || !emailEl || !roleEl) return;

    const name = nomeEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    const role = roleEl.value;

    if (!name) {
      App.showToast("Informe o nome completo do usuário.", "error");
      nomeEl.focus();
      return;
    }

    if (!email || !email.includes("@")) {
      App.showToast("Informe um e-mail válido para login.", "error");
      emailEl.focus();
      return;
    }

    const divs = [];
    if (document.getElementById("chkDivSobMedida")?.checked) divs.push("sob_medida");
    if (document.getElementById("chkDivInc")?.checked) divs.push("incorporadora");
    if (document.getElementById("chkDivInt")?.checked) divs.push("internacional");

    const stages = [];
    if (document.getElementById("chkStagePrevia")?.checked) stages.push("previa");
    if (document.getElementById("chkStageGalga")?.checked) stages.push("galga");
    if (document.getElementById("chkStageDesenho")?.checked) stages.push("desenho_tecnico");

    if (divs.length === 0) {
      App.showToast("Selecione ao menos 1 divisão autorizada.", "error");
      return;
    }

    if (stages.length === 0) {
      App.showToast("Selecione ao menos 1 etapa autorizada.", "error");
      return;
    }

    const userData = {
      name,
      email,
      role,
      allowed_divisions: divs,
      allowed_stages: stages,
      avatar_color: App.selectedAvatarColor || "#0284c7"
    };

    if (App.editingUserId) {
      userData.id = App.editingUserId;
    }

    Auth.saveUser(userData);
    App.showToast(`Usuário ${name} salvo com sucesso!`, "success");
    App.alternarAbaUsuario("manage");
  },

  async excluirUsuario(userId) {
    const user = Auth.getUserById(userId);
    const userName = user ? user.name : "este usuário";

    const ok = await PapaSysDialog.confirm({
      title: "Excluir Usuário",
      message: `Tem certeza que deseja excluir o usuário "${userName}"? Esta ação removerá os acessos deste perfil.`,
      confirmText: "Sim, Excluir",
      cancelText: "Cancelar",
      type: "danger"
    });
    if (!ok) return;

    if (Auth.deleteUser(userId)) {
      App.showToast(`Usuário "${userName}" excluído com sucesso.`, "success");
      App.alternarAbaUsuario("manage");
    }
  },

  async restaurarUsuariosPadrao() {
    const ok = await PapaSysDialog.confirm({
      title: "Restaurar Usuários Padrão",
      message: "Deseja restaurar a lista de usuários de fábrica (incluindo admin@papa.com e usuario@papa.com)?",
      confirmText: "Restaurar Padrões",
      cancelText: "Cancelar",
      type: "warning"
    });
    if (!ok) return;

    Auth.resetDefaultUsers();
    App.showToast("Usuários padrão restaurados com sucesso!", "success");
    App.alternarAbaUsuario(App.userModalTab);
  },

  selecionarUsuarioSessao(userId) {
    const u = Auth.getAllUsers().find(x => x.id === userId);
    if (u) {
      Auth.setCurrentUser(u);
      App.closeAllModals();
      App.showToast(`Sessão ativa: conectado como ${u.name}!`, "success");
    }
  },

  // Modal Novo Orçamento
  abrirModalNovoOrcamento() {
    const modal = document.getElementById("modalNovoOrcamento");
    if (modal) modal.style.display = "flex";
  },

  async criarNovoOrcamentoManual() {
    const cod = (document.getElementById("inputNovoCodigo")?.value || "").trim();
    const proj = document.getElementById("inputNovoProjNome").value.trim() || "Novo Empreendimento";
    const cli = document.getElementById("inputNovoCliNome").value.trim() || "Cliente Geral";
    const div = document.getElementById("selectNovoDivisao").value;
    const etapa = document.getElementById("selectNovoEtapa").value;

    const currentUser = Auth.getCurrentUser();

    const novo = await DB.saveBudget({
      budget_code: cod || undefined,
      project_name: proj,
      client_name: cli,
      division: div,
      stage: etapa,
      assigned_user_id: currentUser.id,
      assigned_user_name: currentUser.name,
      notes: "Orçamento criado diretamente na interface web."
    }, [
      {
        model_name: "Modelo iGUi Padrão 6x3m",
        units_count: 1,
        pool_type: "convencional",
        structure_type: "nao_autoportante",
        coating_type: "pastilha_15x15",
        has_mold: false,
        internal_area_m2: 24.0,
        lamination_area_m2: 30.0,
        internal_volume_m3: 16.0,
        internal_volume_liters: 16000,
        linear_corners_m: 20.0,
        alive_corners_count: 4
      }
    ]);

    App.closeAllModals();
    App.showToast(`Orçamento ${novo.budget_code} criado com sucesso!`, "success");
    await App.loadBudgets();
    window.location.href = `orcamento.html?id=${novo.id}`;
  },

  // Simular Envio do SketchUp
  async simularEnvioSketchUp() {
    const currentUser = Auth.getCurrentUser();
    const divisao = App.activeDivision === "dashboard_geral" ? "sob_medida" : App.activeDivision;
    const etapa = App.activeStage;

    const novo = await DB.saveBudget({
      project_name: `Piscina 3D ${divisao.toUpperCase()} #${Math.floor(100 + Math.random() * 900)}`,
      client_name: "Cliente Integrado 3D",
      division: divisao,
      stage: etapa,
      assigned_user_id: currentUser.id,
      assigned_user_name: currentUser.name,
      notes: "Sincronizado automaticamente via SketchUp com materiais Revestimento e Laminação."
    }, [
      {
        model_name: `Modelo iGUi ${divisao === 'incorporadora' ? 'Modular Incorporadora' : 'Sob Medida Special'}`,
        units_count: divisao === 'incorporadora' ? 12 : 1, // Se for Incorporadora, gera 12 un (disparando molde)
        pool_type: "convencional",
        structure_type: "autoportante",
        coating_type: "pastilha_15x15",
        has_mold: divisao === 'incorporadora',
        internal_area_m2: 26.50,
        lamination_area_m2: 34.20,
        internal_volume_m3: 19.80,
        internal_volume_liters: 19800,
        linear_corners_m: 23.60,
        alive_corners_count: 4
      }
    ]);

    App.showToast(`Projeto 3D simulado e recebido com sucesso na divisão ${divisao.toUpperCase()}!`, "success");
    await App.loadBudgets();
  },

  closeAllModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => {
      m.style.setProperty("display", "none", "important");
      m.style.display = "none";
    });
  },

  showToast(msg, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
