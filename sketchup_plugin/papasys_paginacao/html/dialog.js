// ==============================================================================
// iGUi Orçamentos 3D - Controlador Frontend HtmlDialog (Abas 1, 2 e 3)
// ==============================================================================

const appState = {
  version: "2.0.9",
  serverUrl: "https://bhbbpdvgkyjqxhghbmpe.supabase.co",
  active_tab: 1,
  user: {
    id: "usr-victor",
    name: "Victor Lourenço",
    email: "victor@igui.com",
    role: "user",
    allowed_divisions: ["sob_medida"]
  },
  allUsers: [
    {
      id: "77b65d92-3aa2-47a6-9dbb-033fd48f7b30",
      name: "Administrador (PapaSys)",
      email: "admin@papa.com",
      role: "admin",
      allowed_divisions: ["sob_medida", "incorporadora", "internacional"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#0284c7"
    },
    {
      id: "a0f528a8-ce32-4f4e-85b1-6c15612fda18",
      name: "Victor Lourenço",
      email: "usuario@papa.com",
      role: "user",
      allowed_divisions: ["sob_medida"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#f97316"
    },
    {
      id: "usr-admin",
      name: "Administrador / Diretor",
      email: "diretoria@igui.com",
      role: "admin",
      allowed_divisions: ["sob_medida", "incorporadora", "internacional"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#0284c7"
    },
    {
      id: "usr-victor",
      name: "Victor Lourenço (iGUi)",
      email: "victor@igui.com",
      role: "user",
      allowed_divisions: ["sob_medida"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#f97316"
    }
  ],
  selected_division: "sob_medida", // 'sob_medida', 'incorporadora', 'internacional'
  modo_orcamento: "novo", // 'novo' ou 'existente'
  budget_code: "", // Digitado manualmente pelo usuário (vem do e-mail do cliente)
  orcamentosExistentes: [],
  orcamentoExistenteSelecionado: null,
  
  // Configuração Técnica da Piscina
  stage: "previa", // 'previa' (+5%) ou 'galga' (0%)
  pool_type: "convencional", // 'convencional' ou 'especial'
  structure_type: "nao_autoportante", // 'nao_autoportante' ou 'autoportante'
  coating_type: "pastilha_15x15",
  has_mold: false,
  mold_manual_override: false,
  units_count: 1,

  // Quantitativos 3D detectados
  quantitativos: {
    area_revestimento_m2: 0.0,
    area_laminacao_m2: 0.0,
    volume_m3: 0.0,
    volume_litros: 0,
    cantos_lineares_m: 0.0,
    cantos_lineares_cm: 0.0,
    quinas_vivas_count: 0,
    finishes: {},
    has_explicit_revest: false,
    has_explicit_lamina: false,
    dimensoes: { comprimento_m: 0.0, largura_m: 0.0, profundidade_m: 0.0 }
  },

  // Tabela de Preços e Regras (Seção 9)
  precos: {
    m2_prices: {
      sob_medida: { convencional: 140.0, especial: 175.0 },
      incorporadora: { convencional: 120.0, especial: 150.0 },
      internacional: { convencional: 150.0, especial: 185.0 }
    },
    molde: {
      preco_m2_convencional: 100.0,
      preco_m2_especial: 130.0,
      desconto_m2: 20.0,
      min_unidades: 10
    },
    acrescimos: {
      autoportante_pct: 50.0,
      etapas: {
        previa: 5.0,
        galga: 0.0,
        desenho_tecnico: 0.0
      }
    },
    revestimentos: [
      { id: "pastilha_5x5", nome: "Pastilha 5x5", acabamento: "bp11_c3" },
      { id: "pastilha_7_5x7_5", nome: "Pastilha 7,5x7,5", acabamento: "boleada_7_5" },
      { id: "pastilha_10x10", nome: "Pastilha 10x10", acabamento: "bp11_c3" },
      { id: "pastilha_15x15", nome: "Pastilha 15x15", acabamento: "boleada_15" },
      { id: "porcelanato_villagres", nome: "Porcelanato Villagres", acabamento: "personalizado" },
      { id: "personalizado", nome: "Personalizado", acabamento: "personalizado" }
    ]
  },

  selectionInfo: null,
  valoresCalculados: {}
};

// ==============================================================================
// INICIALIZAÇÃO
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
  if (window.sketchup) {
    window.sketchup.ready();
    window.sketchup.buscar_usuarios();
  } else {
    // Modo de teste / navegador local
    initApp({
      version: "2.0.0",
      user: appState.user,
      selected_division: "sob_medida",
      info_selecao: { has_selection: true, descricao: "Piscina Teste 3D" }
    });
  }
});

function initApp(dados) {
  if (!dados) return;

  if (dados.version) {
    appState.version = dados.version;
    const badge = document.getElementById("versionBadge");
    if (badge) badge.textContent = `v${dados.version}`;
  }

  if (dados.user) {
    aplicarUsuarioAtivo(dados.user);
  }

  if (dados.users && Array.isArray(dados.users) && dados.users.length > 0) {
    appState.allUsers = dados.users;
    renderizarListaUsuariosModal();
  }

  if (dados.selected_division) {
    selecionarDivisao(dados.selected_division);
  }

  if (dados.info_selecao) {
    atualizarInfoSelecao(dados.info_selecao);
  }

  if (dados.pendentes_count !== undefined) {
    atualizarStatusFilaLocal(dados.pendentes_count);
  }

  // Executa análise inicial
  executarAnaliseGeometrica(false);
}

// ==============================================================================
// CONTROLE DE ABAS 1, 2 E 3 (ZERO SCROLL)
// ==============================================================================
function switchTab(num) {
  appState.active_tab = num;

  // Atualiza classes dos botões das abas
  for (let i = 1; i <= 3; i++) {
    const btn = document.getElementById(`tabBtn${i}`);
    const panel = document.getElementById(`tabPanel${i}`);
    if (btn) btn.classList.toggle("active", i === num);
    if (panel) {
      if (i === num) {
        panel.style.display = "block";
        panel.classList.add("active");
      } else {
        panel.style.display = "none";
        panel.classList.remove("active");
      }
    }
  }

  // Se for para a aba 3, garante que os cálculos e acabamentos estejam recalculados
  if (num === 3) {
    if (appState.selectionInfo && appState.selectionInfo.has_selection && (!appState.quantitativos.area_revestimento_m2 || parseFloat(appState.quantitativos.area_revestimento_m2) <= 0)) {
      executarAnaliseGeometrica(false);
    }
    recalcularPecasAcabamento();
    atualizarCalculosFinanceiros();
  }
}

// ==============================================================================
// USUÁRIOS E PERMISSÕES (SEÇÃO 3 E 4)
// ==============================================================================
function aplicarUsuarioAtivo(user) {
  appState.user = user;

  const lblNome = document.getElementById("lblUserName");
  const lblRole = document.getElementById("lblUserRole");
  const lblDivs = document.getElementById("lblUserDivisions");
  const avatar = document.getElementById("userAvatar");

  if (lblNome) lblNome.textContent = user.name || "Usuário iGUi";
  
  const isAdmin = user.role === "admin";
  if (lblRole) {
    lblRole.textContent = isAdmin ? "Diretoria / Admin" : "Projetista";
    lblRole.className = `badge-role ${isAdmin ? "admin" : ""}`;
  }

  // Iniciais do Avatar
  const parts = (user.name || "U").trim().split(" ");
  const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
  if (avatar) {
    avatar.textContent = initials;
    if (user.avatar_color) avatar.style.background = user.avatar_color;
  }

  // Formata texto de divisões
  const allowed = user.allowed_divisions || ["sob_medida"];
  const nomesDivs = {
    sob_medida: "Sob Medida",
    incorporadora: "Incorporadora",
    internacional: "Internacional"
  };
  if (lblDivs) {
    lblDivs.textContent = isAdmin ? "Acesso: Todas as Divisões (Admin)" : `Acesso: ${allowed.map(d => nomesDivs[d] || d).join(", ")}`;
  }

  // Ativa/Desativa botões conforme permissões
  atualizarBotoesDivisoesPorPermissao();
}

function atualizarBotoesDivisoesPorPermissao() {
  const user = appState.user;
  const isAdmin = user.role === "admin";
  const allowed = user.allowed_divisions || ["sob_medida"];

  const bSob = document.getElementById("btnDivSobMedida");
  const bInc = document.getElementById("btnDivIncorporadora");
  const bInt = document.getElementById("btnDivInternacional");

  const checkDiv = (btn, divKey) => {
    if (!btn) return;
    const permitida = isAdmin || allowed.includes(divKey);
    btn.disabled = !permitida;
    if (permitida) {
      btn.classList.remove("disabled");
      btn.title = "Clique para selecionar esta divisão";
    } else {
      btn.classList.add("disabled");
      btn.title = `Acesso restrito: o usuário ${user.name} não possui acesso a esta divisão.`;
    }
  };

  checkDiv(bSob, "sob_medida");
  checkDiv(bInc, "incorporadora");
  checkDiv(bInt, "internacional");

  // Se a divisão atual não for permitida, troca para a primeira permitida
  if (!isAdmin && !allowed.includes(appState.selected_division)) {
    const primeira = allowed[0] || "sob_medida";
    selecionarDivisao(primeira);
  }
}

function onUsuariosCarregados(usuarios) {
  if (Array.isArray(usuarios)) {
    appState.allUsers = usuarios;
    renderizarListaUsuariosModal();
  }
}

function renderizarListaUsuariosModal() {
  const container = document.getElementById("listaUsuariosLogin");
  if (!container) return;

  const users = appState.allUsers.length > 0 ? appState.allUsers : [appState.user];
  container.innerHTML = users.map(u => {
    const isCurrent = u.id === appState.user.id || u.email === appState.user.email;
    const parts = (u.name || "U").trim().split(" ");
    const init = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    const isAdmin = u.role === "admin";

    return `
      <div class="user-select-card ${isCurrent ? 'active' : ''}" onclick="selecionarUsuarioLogin('${u.id || u.email}')">
        <div class="user-avatar" style="background: ${u.avatar_color || '#0284c7'}">${init}</div>
        <div class="user-info">
          <div class="user-name-row">
            <span class="user-name">${u.name}</span>
            <span class="badge-role ${isAdmin ? 'admin' : ''}">${isAdmin ? 'Admin' : 'Usuário'}</span>
          </div>
          <div class="user-permissions">${u.email} &bull; ${(u.allowed_divisions || []).join(', ')}</div>
        </div>
      </div>
    `;
  }).join("");
}

function selecionarUsuarioLogin(userIdOrEmail) {
  const u = appState.allUsers.find(x => x.id === userIdOrEmail || x.email === userIdOrEmail);
  if (!u) return;

  if (window.sketchup) {
    window.sketchup.login(u);
  } else {
    aplicarUsuarioAtivo(u);
    fecharModalUser();
    showToast(`Usuário alternado para ${u.name}!`, "success");
  }
}

function onLoginSucesso(userData) {
  const btn = document.getElementById("btnSkLogin");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Autenticar no Supabase";
  }
  aplicarUsuarioAtivo(userData);
  fecharModalUser();
  showToast(`Sessão ativa: ${userData.name}!`, "success");
}

function executarLoginSupabase() {
  const email = (document.getElementById("skLoginEmail")?.value || "").trim();
  const pass = document.getElementById("skLoginPassword")?.value || "";
  const errBox = document.getElementById("skLoginErrorMsg");
  const btn = document.getElementById("btnSkLogin");

  if (!email || !pass) {
    if (errBox) {
      errBox.textContent = "Preencha o e-mail e a senha.";
      errBox.style.display = "block";
    }
    return;
  }

  if (errBox) errBox.style.display = "none";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Autenticando...";
  }

  if (window.sketchup && window.sketchup.login_supabase) {
    window.sketchup.login_supabase({ email, password: pass });
  } else if (window.sketchup && window.sketchup.login) {
    const u = appState.allUsers.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (u) {
      window.sketchup.login(u);
    } else {
      onLoginErro("Usuário não encontrado.");
    }
  } else {
    onLoginSucesso({
      name: email.split("@")[0],
      email: email,
      role: email.includes("admin") ? "admin" : "user",
      allowed_divisions: ["sob_medida", "incorporadora", "internacional"]
    });
  }
}

function onLoginErro(msg) {
  const errBox = document.getElementById("skLoginErrorMsg");
  const btn = document.getElementById("btnSkLogin");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "Autenticar no Supabase";
  }
  if (errBox) {
    errBox.textContent = msg || "Falha na autenticação.";
    errBox.style.display = "block";
  }
  showToast(msg || "Falha ao autenticar no Supabase.", "error");
}

function toggleModalUser() {
  const m = document.getElementById("modalUser");
  if (!m) return;
  const isVis = m.style.display !== "none";
  m.style.display = isVis ? "none" : "flex";
  if (!isVis) renderizarListaUsuariosModal();
}

function fecharModalUser() {
  const m = document.getElementById("modalUser");
  if (m) m.style.display = "none";
}

function fecharModalUserSeClicarFora(e) {
  if (e.target.id === "modalUser") fecharModalUser();
}

// ==============================================================================
// NAVEGAÇÃO DE DIVISÕES (SEÇÃO 2 E 4)
// ==============================================================================
function selecionarDivisao(divisao) {
  const user = appState.user;
  const isAdmin = user.role === "admin";
  const allowed = user.allowed_divisions || ["sob_medida"];

  if (!isAdmin && !allowed.includes(divisao)) {
    showToast(`Acesso restrito: ${user.name} não possui acesso a esta divisão.`, "error");
    return;
  }

  appState.selected_division = divisao;
  if (window.sketchup) {
    window.sketchup.selecionar_divisao(divisao);
  }

  // Atualiza classes ativas dos 3 botões
  const bSob = document.getElementById("btnDivSobMedida");
  const bInc = document.getElementById("btnDivIncorporadora");
  const bInt = document.getElementById("btnDivInternacional");
  if (bSob) bSob.classList.toggle("active", divisao === "sob_medida");
  if (bInc) bInc.classList.toggle("active", divisao === "incorporadora");
  if (bInt) bInt.classList.toggle("active", divisao === "internacional");

  // Regras específicas de cada divisão (Seção 5 e 10)
  const inputUnidades = document.getElementById("inputUnidades");
  const badgeLock = document.getElementById("badgeSobMedidaUnidade");
  const rowMolde = document.getElementById("rowMoldeIncorporadora");
  const btnEnvio = document.getElementById("lblTextoBotaoEnvio");

  if (divisao === "sob_medida") {
    // 14.4 Sob Medida: quantidade padrão 1 unidade, mas totalmente editável!
    if (inputUnidades) {
      inputUnidades.disabled = false;
      if (!inputUnidades.value || parseInt(inputUnidades.value) < 1) {
        inputUnidades.value = 1;
      }
      appState.units_count = Math.max(1, parseInt(inputUnidades.value) || 1);
    }
    if (badgeLock) badgeLock.style.display = "none";
    if (rowMolde) rowMolde.style.display = "none";
    if (btnEnvio) btnEnvio.textContent = "Enviar para iGUi Sob Medida";
  } else if (divisao === "incorporadora") {
    // Incorporadora: múltiplos modelos/unidades e regra de molde
    if (inputUnidades) {
      inputUnidades.disabled = false;
      appState.units_count = Math.max(1, parseInt(inputUnidades.value) || 1);
    }
    if (badgeLock) badgeLock.style.display = "none";
    if (rowMolde) rowMolde.style.display = "block";
    if (btnEnvio) btnEnvio.textContent = "Enviar para iGUi Incorporadora";
    verificarRegraMoldeIncorporadora();
  } else {
    // Internacional
    if (inputUnidades) {
      inputUnidades.disabled = false;
      appState.units_count = Math.max(1, parseInt(inputUnidades.value) || 1);
    }
    if (badgeLock) badgeLock.style.display = "none";
    if (rowMolde) rowMolde.style.display = "none";
    if (btnEnvio) btnEnvio.textContent = "Enviar para iGUi Internacional";
  }

  // Limpa feedback de pesquisa anterior
  const boxStatus = document.getElementById("boxStatusBuscaOrcamento");
  if (boxStatus) boxStatus.style.display = "none";

  if (appState.modo_orcamento === "existente") {
    carregarOrcamentosExistentes();
  }

  atualizarCalculosFinanceiros();
}

// ==============================================================================
// IDENTIFICAÇÃO DO ORÇAMENTO (NÚMERO MANUAL & PESQUISA INTELIGENTE)
// ==============================================================================
function setModoOrcamento(modo) {
  appState.modo_orcamento = modo;
  const tabNovo = document.getElementById("tabModoNovo");
  const tabExistente = document.getElementById("tabModoExistente");
  const tabGalga = document.getElementById("tabModoGalga");
  const blocoExistente = document.getElementById("blocoOrcamentoExistente");

  if (tabNovo) tabNovo.classList.toggle("active", modo === "novo");
  if (tabExistente) tabExistente.classList.toggle("active", modo === "existente");
  if (tabGalga) tabGalga.classList.toggle("active", modo === "galga");

  const precisaExistente = modo === "existente" || modo === "galga";
  if (blocoExistente) blocoExistente.style.display = precisaExistente ? "block" : "none";

  const boxStatus = document.getElementById("boxStatusBuscaOrcamento");
  if (boxStatus) boxStatus.style.display = "none";

  const btnEnvioText = document.getElementById("lblTextoBotaoEnvio");

  if (modo === "galga") {
    // Galga: define etapa como galga (0% de margem)
    setEtapa("galga");
    carregarOrcamentosExistentes();
    if (btnEnvioText) btnEnvioText.textContent = "Substituir Piscina e Enviar Galga (0%)";
  } else if (modo === "existente") {
    carregarOrcamentosExistentes();
    if (btnEnvioText) btnEnvioText.textContent = "Adicionar Piscina a Existente";
  } else {
    // Modo novo
    const divNomes = { sob_medida: "iGUi Sob Medida", incorporadora: "iGUi Incorporadora", internacional: "iGUi Internacional" };
    if (btnEnvioText) btnEnvioText.textContent = `Enviar para ${divNomes[appState.selected_division] || "iGUi"}`;
  }
}

// Pesquisa orçamento pelo número digitado pelo usuário (vem do e-mail do cliente)
function pesquisarOrcamentoPorNumero() {
  const inputCod = document.getElementById("inputNumeroOrcamento");
  const codigo = inputCod ? inputCod.value.trim() : "";
  const boxStatus = document.getElementById("boxStatusBuscaOrcamento");

  if (!codigo) {
    showToast("Digite o número do orçamento para pesquisar.", "error");
    if (inputCod) inputCod.focus();
    return;
  }

  appState.budget_code = codigo;
  if (boxStatus) {
    boxStatus.style.display = "block";
    boxStatus.className = "budget-status-box searching";
    boxStatus.innerHTML = `
      <div class="budget-status-inner">
        <div class="budget-status-loading">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
          <span>Pesquisando orçamento nº <strong>${codigo}</strong>...</span>
        </div>
      </div>
    `;
  }

  if (window.sketchup) {
    window.sketchup.buscar_orcamento_codigo({
      codigo: codigo,
      divisao: appState.selected_division
    });
  } else {
    // Mock local para testes
    setTimeout(() => {
      if (codigo.includes("84") || codigo.includes("2026")) {
        onResultadoBuscaOrcamento(true, [{
          id: "orc-mock-found",
          budget_code: codigo,
          project_name: "Residencial Grand Park",
          client_name: "Cyrela Construtora",
          division: appState.selected_division,
          stage: "previa"
        }]);
      } else {
        onResultadoBuscaOrcamento(false, []);
      }
    }, 400);
  }
}

// Callback invocado após a busca no Supabase
function onResultadoBuscaOrcamento(sucesso, resultados) {
  const boxStatus = document.getElementById("boxStatusBuscaOrcamento");
  if (!boxStatus) return;

  const codigo = (appState.budget_code || "").trim();

  if (sucesso && Array.isArray(resultados) && resultados.length > 0) {
    // Orçamento ENCONTRADO!
    const orc = resultados[0];
    appState.orcamentoExistenteSelecionado = orc;
    appState.budget_code = orc.budget_code || codigo;
    
    // Preenche os campos do projeto e cliente
    const inputProj = document.getElementById("inputProjeto");
    const inputCli = document.getElementById("inputCliente");
    if (inputProj && orc.project_name) inputProj.value = orc.project_name;
    if (inputCli && orc.client_name) inputCli.value = orc.client_name;

    // Define modo como existente
    setModoOrcamento("existente");

    boxStatus.style.display = "block";
    boxStatus.className = "budget-status-box found";
    boxStatus.innerHTML = `
      <div class="budget-status-inner">
        <div class="status-badge-row">
          <span class="status-pill status-pill-success">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Orçamento Encontrado
          </span>
          <span class="status-code">#${orc.budget_code}</span>
        </div>
        <div class="status-project-title">${orc.project_name || 'Sem nome'}</div>
        <div class="status-client-name">Cliente: ${orc.client_name || 'Geral'}</div>
        <div class="status-hint">Esta piscina será acumulada neste orçamento no envio.</div>
        <div class="status-actions">
          <button type="button" class="btn btn-sm btn-primary-igui" onclick="switchTab(2)">
            Avançar para Configuração
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
    `;
    showToast(`Orçamento #${orc.budget_code} localizado com sucesso!`, "success");

  } else {
    // Orçamento NÃO ENCONTRADO! Pergunta se deseja criar um novo com este número
    appState.orcamentoExistenteSelecionado = null;

    boxStatus.style.display = "block";
    boxStatus.className = "budget-status-box not-found";
    boxStatus.innerHTML = `
      <div class="budget-status-inner">
        <div class="status-badge-row">
          <span class="status-pill status-pill-warning">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Não Encontrado
          </span>
        </div>
        <div class="status-not-found-msg">
          Nenhum orçamento encontrado com o número <strong>${codigo}</strong>.
        </div>
        <div class="status-prompt">
          Deseja criar um novo orçamento com este número?
        </div>
        <div class="status-actions">
          <button type="button" class="btn btn-sm btn-primary-igui" onclick="confirmarCriarNovoComNumero('${codigo}')">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Sim, criar novo orçamento nº ${codigo}
          </button>
        </div>
      </div>
    `;
  }
}

// Confirma a criação de novo orçamento com o número digitado
function confirmarCriarNovoComNumero(codigo) {
  appState.modo_orcamento = "novo";
  appState.budget_code = codigo;
  appState.orcamentoExistenteSelecionado = null;

  setModoOrcamento("novo");

  const inputCod = document.getElementById("inputNumeroOrcamento");
  if (inputCod) inputCod.value = codigo;

  const boxStatus = document.getElementById("boxStatusBuscaOrcamento");
  if (boxStatus) {
    boxStatus.className = "budget-status-box found";
    boxStatus.innerHTML = `
      <div class="budget-status-inner">
        <div class="status-badge-row">
          <span class="status-pill status-pill-success">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Novo Orçamento Definido
          </span>
          <span class="status-code">#${codigo}</span>
        </div>
        <div class="status-hint">O número <strong>${codigo}</strong> será atribuído a este novo orçamento.</div>
      </div>
    `;
  }

  showToast(`Criando novo orçamento com o número ${codigo}.`, "success");
}

function carregarOrcamentosExistentes() {
  const sel = document.getElementById("selectOrcamentoExistente");
  if (!sel) return;
  sel.innerHTML = '<option value="">Carregando orçamentos da nuvem...</option>';

  if (window.sketchup) {
    window.sketchup.listar_orcamentos(appState.selected_division);
  } else {
    setTimeout(() => {
      onOrcamentosCarregados([
        { id: "orc-mock-1", budget_code: "84920", project_name: "Residencial Grand Park", client_name: "Cyrela Construtora" },
        { id: "orc-mock-2", budget_code: "84921", project_name: "Edifício Horizon", client_name: "Gafisa Incorporações" }
      ]);
    }, 300);
  }
}

function onOrcamentosCarregados(orcamentos) {
  appState.orcamentosExistentes = orcamentos || [];
  const sel = document.getElementById("selectOrcamentoExistente");
  if (!sel) return;

  if (!orcamentos || orcamentos.length === 0) {
    sel.innerHTML = '<option value="">Nenhum orçamento encontrado nesta divisão</option>';
    return;
  }

  sel.innerHTML = '<option value="">-- Selecione o Orçamento Existente --</option>' +
    orcamentos.map(o => `
      <option value="${o.id}">
        #${o.budget_code} &bull; ${o.project_name} (${o.client_name || 'Geral'})
      </option>
    `).join("");
}

function aoSelecionarOrcamentoExistente() {
  const sel = document.getElementById("selectOrcamentoExistente");
  if (!sel) return;
  const id = sel.value;
  const found = appState.orcamentosExistentes.find(o => o.id === id);
  appState.orcamentoExistenteSelecionado = found || null;

  if (found) {
    appState.budget_code = found.budget_code || "";
    const inputCod = document.getElementById("inputNumeroOrcamento");
    const inputProj = document.getElementById("inputProjeto");
    const inputCli = document.getElementById("inputCliente");
    if (inputCod) inputCod.value = found.budget_code || "";
    if (inputProj && found.project_name) inputProj.value = found.project_name;
    if (inputCli && found.client_name) inputCli.value = found.client_name;
  }
}

// ==============================================================================
// CONFIGURAÇÃO TÉCNICA DA PISCINA (SEÇÃO 6)
// ==============================================================================
function setEtapa(etapa) {
  appState.stage = etapa;
  const bPrevia = document.getElementById("btnEtapaPrevia");
  const bGalga = document.getElementById("btnEtapaGalga");
  if (bPrevia) bPrevia.classList.toggle("active", etapa === "previa");
  if (bGalga) bGalga.classList.toggle("active", etapa === "galga");

  const lblMargem = document.getElementById("lblMargemPct");
  if (lblMargem) lblMargem.textContent = etapa === "previa" ? "Prévia +5%" : "Galga 0%";

  atualizarCalculosFinanceiros();
}

function setTipoPiscina(tipo) {
  appState.pool_type = tipo;
  const lConv = document.getElementById("lblTipoConvencional");
  const lEsp = document.getElementById("lblTipoEspecial");
  if (lConv) lConv.classList.toggle("active", tipo === "convencional");
  if (lEsp) lEsp.classList.toggle("active", tipo === "especial");
}

function setEstrutura(estrutura) {
  appState.structure_type = estrutura;
  const lNao = document.getElementById("lblEstNaoAuto");
  const lAuto = document.getElementById("lblEstAuto");
  if (lNao) lNao.classList.toggle("active", estrutura === "nao_autoportante");
  if (lAuto) lAuto.classList.toggle("active", estrutura === "autoportante");

  const rowAuto = document.getElementById("rowAutoAcrescimo");
  if (rowAuto) rowAuto.style.display = estrutura === "autoportante" ? "flex" : "none";

  atualizarCalculosFinanceiros();
}

function setRevestimento(rev) {
  appState.coating_type = rev;
  document.querySelectorAll(".btn-coating").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-val") === rev);
  });

  recalcularPecasAcabamento();
  atualizarCalculosFinanceiros();
}

// Regra de Molde da Incorporadora (Seção 10.2)
function verificarRegraMoldeIncorporadora() {
  if (appState.selected_division !== "incorporadora") return;

  const minMolde = appState.precos.regras.min_unidades_molde || 10;
  const inputUnidades = document.getElementById("inputUnidades");
  const unidades = parseInt(inputUnidades ? inputUnidades.value : 1) || 1;
  const chk = document.getElementById("chkHasMold");
  const lbl = document.getElementById("lblMoldeStatus");

  if (!appState.mold_manual_override && chk && lbl) {
    if (unidades >= minMolde) {
      appState.has_mold = true;
      chk.checked = true;
      lbl.textContent = `Ativado automaticamente: ≥ ${minMolde} unidades viram molde`;
      lbl.style.color = "var(--green-600)";
    } else {
      appState.has_mold = false;
      chk.checked = false;
      lbl.textContent = `Sem molde: menos de ${minMolde} unidades (editável)`;
      lbl.style.color = "var(--slate-500)";
    }
  }
}

function aoAlternarMoldeManual() {
  const chk = document.getElementById("chkHasMold");
  if (!chk) return;
  appState.has_mold = chk.checked;
  appState.mold_manual_override = true;
  const lbl = document.getElementById("lblMoldeStatus");
  if (lbl) {
    lbl.textContent = chk.checked ? "Com Molde (selecionado manualmente)" : "Sem Molde (selecionado manualmente)";
    lbl.style.color = "var(--igui-blue-dark)";
  }
  atualizarCalculosFinanceiros();
}

// ==============================================================================
// DETECÇÃO GEOMÉTRICA & QUANTITATIVOS (SEÇÃO 7 E 8)
// ==============================================================================
function solicitarInspecao() {
  if (window.sketchup) {
    window.sketchup.inspecionar_selecao();
    executarAnaliseGeometrica(true);
  }
}

function atualizarInfoSelecao(info) {
  appState.selectionInfo = info;
  const chip = document.getElementById("selectionChip");
  const lblTitle = document.getElementById("selectionStatusText");
  const lblDims = document.getElementById("selectionDimsText");
  const badgeCurva = document.getElementById("badgeCurva");

  if (!info || !info.has_selection) {
    if (chip) chip.className = "selection-chip no-sel";
    if (lblTitle) lblTitle.textContent = "Nenhuma piscina selecionada";
    if (lblDims) lblDims.textContent = "Selecione o grupo da piscina no SketchUp para quantificar";
    if (badgeCurva) badgeCurva.style.display = "none";
    return;
  }

  if (chip) chip.className = "selection-chip has-sel";
  if (lblTitle) lblTitle.textContent = info.descricao || "Piscina Selecionada no SketchUp";
  
  if (lblDims) {
    if (info.comprimento_m && info.largura_m) {
      lblDims.textContent = `${info.comprimento_m}m × ${info.largura_m}m (Prof: ${info.profundidade_m || 1.4}m)`;
    } else {
      lblDims.textContent = `${info.count || 1} elementos selecionados`;
    }
  }

  if (badgeCurva) badgeCurva.style.display = info.tem_curvas ? "inline-block" : "none";

  // Se sugeriu nome de grupo/modelo
  if (info.nome_sugerido && info.nome_sugerido.trim().length > 0) {
    const inputMod = document.getElementById("inputModelo");
    if (inputMod) inputMod.value = info.nome_sugerido;
  }

  // DISPARO AUTOMÁTICO: sempre que uma piscina for selecionada, calcula imediatamente
  executarAnaliseGeometrica(false);
}

function executarAnaliseGeometrica(mostrarToast = false) {
  const lblMatRev = document.getElementById("lblStatusMatRevest");
  const lblMatLam = document.getElementById("lblStatusMatLamina");
  if (lblMatRev && (!appState.quantitativos.area_revestimento_m2 || parseFloat(appState.quantitativos.area_revestimento_m2) <= 0)) {
    lblMatRev.textContent = "Calculando...";
  }
  if (lblMatLam && (!appState.quantitativos.area_laminacao_m2 || parseFloat(appState.quantitativos.area_laminacao_m2) <= 0)) {
    lblMatLam.textContent = "Calculando...";
  }

  if (window.sketchup) {
    window.sketchup.executar_ajuste({
      largura: 15.0,
      altura: 15.0,
      rejunte: 0.2,
      modificar_3d: false, // Apenas quantifica, sem alterar malha 3D desnecessariamente
      revestimento: appState.coating_type,
      structure_type: appState.structure_type,
      stage: appState.stage
    });
  } else {
    // Mock para desenvolvimento local
    onAjusteSucesso({
      area_revestimento_m2: 24.50,
      area_laminacao_m2: 38.99,
      volume_m3: 18.20,
      volume_litros: 18200,
      linear_corners_m: 2.80,
      linear_corners_cm: 280.0,
      alive_corners_count: 1, // Exatamente 1 quina viva conforme geometria da escada
      has_explicit_revest: true,
      has_explicit_lamina: true
    });
  }
}

function onAjusteSucesso(res) {
  let areaRev = parseFloat(res.area_revestimento_m2 || res.area_interna_m2 || 0);
  let areaLam = parseFloat(res.area_laminacao_m2 || 0);
  let volM3 = parseFloat(res.volume_m3 || res.internal_volume_m3 || 0);
  let volL = parseInt(res.volume_litros || res.internal_volume_liters || 0);
  let cantosM = parseFloat(res.linear_corners_m || 0);
  let cantosCm = parseFloat(res.linear_corners_cm || (cantosM * 100.0) || 0);
  let quinas = parseInt(res.alive_corners_count !== undefined ? res.alive_corners_count : 0);



  appState.quantitativos = {
    area_revestimento_m2: areaRev.toFixed(2),
    area_laminacao_m2: areaLam.toFixed(2),
    volume_m3: volM3.toFixed(2),
    volume_litros: volL,
    cantos_lineares_m: cantosM.toFixed(2),
    cantos_lineares_cm: cantosCm.toFixed(1),
    quinas_vivas_count: quinas,
    finishes: res.finishes || {},
    has_explicit_revest: !!res.has_explicit_revest || areaRev > 0,
    has_explicit_lamina: !!res.has_explicit_lamina || areaLam > 0,
    dimensoes: res.dimensoes || {}
  };

  // Atualiza indicadores de Materiais (Seção 8)
  const lblMatRev = document.getElementById("lblStatusMatRevest");
  const lblMatLam = document.getElementById("lblStatusMatLamina");

  if (lblMatRev) {
    lblMatRev.textContent = res.has_explicit_revest ? `Detectado (${appState.quantitativos.area_revestimento_m2} m²)` : `Automático (${appState.quantitativos.area_revestimento_m2} m²)`;
    lblMatRev.style.color = res.has_explicit_revest ? "var(--green-600)" : "var(--slate-700)";
  }

  if (lblMatLam) {
    lblMatLam.textContent = res.has_explicit_lamina ? `Detectado (${appState.quantitativos.area_laminacao_m2} m²)` : `Estimado (${appState.quantitativos.area_laminacao_m2} m²)`;
    lblMatLam.style.color = res.has_explicit_lamina ? "var(--green-600)" : "var(--slate-700)";
  }

  // Atualiza valores nas caixas
  const elAreaRev = document.getElementById("statAreaRevest");
  const elAreaLam = document.getElementById("statAreaLamina");
  const elVolM3 = document.getElementById("statVolumeM3");
  const elVolL = document.getElementById("statVolumeLitros");
  const elCantos = document.getElementById("statCantosLineares");
  const elQuinas = document.getElementById("statQuinasVivas");

  if (elAreaRev) elAreaRev.textContent = appState.quantitativos.area_revestimento_m2;
  if (elAreaLam) elAreaLam.textContent = appState.quantitativos.area_laminacao_m2;
  if (elVolM3) elVolM3.textContent = appState.quantitativos.volume_m3;
  if (elVolL) elVolL.textContent = `${Number(appState.quantitativos.volume_litros).toLocaleString('pt-BR')} L`;
  if (elCantos) elCantos.textContent = appState.quantitativos.cantos_lineares_m;
  if (elQuinas) {
    const qCount = parseInt(appState.quantitativos.quinas_vivas_count) || 0;
    elQuinas.textContent = qCount > 0 ? `${qCount} quina(s) viva(s)` : "0 quinas vivas";
  }

  // Sincroniza campos de input editáveis
  const elInputAreaRev = document.getElementById("inputAreaRevest");
  const elInputAreaLam = document.getElementById("inputAreaLamina");
  const elInputVolM3 = document.getElementById("inputVolumeM3");
  const elInputCantos = document.getElementById("inputCantosLineares");
  const elInputQuinas = document.getElementById("inputQuinasVivas");

  if (elInputAreaRev && document.activeElement !== elInputAreaRev) {
    elInputAreaRev.value = appState.quantitativos.area_revestimento_m2;
  }
  if (elInputAreaLam && document.activeElement !== elInputAreaLam) {
    elInputAreaLam.value = appState.quantitativos.area_laminacao_m2;
  }
  if (elInputVolM3 && document.activeElement !== elInputVolM3) {
    elInputVolM3.value = appState.quantitativos.volume_m3;
  }
  if (elInputCantos && document.activeElement !== elInputCantos) {
    elInputCantos.value = appState.quantitativos.cantos_lineares_m;
  }
  if (elInputQuinas && document.activeElement !== elInputQuinas) {
    elInputQuinas.value = appState.quantitativos.quinas_vivas_count;
  }

  // Limpa overrides de peças caso venha uma nova detecção do 3D
  delete appState.quantitativos.finish_linear_override;
  delete appState.quantitativos.finish_quina_override;

  recalcularPecasAcabamento();
  atualizarCalculosFinanceiros();
}

// Edição manual de Áreas, Volume, Cantos e Quinas
function aoEditarAreaRevest(val) {
  const m = parseFloat(val) || 0.0;
  appState.quantitativos.area_revestimento_m2 = m.toFixed(2);
  const el = document.getElementById("statAreaRevest");
  if (el) el.textContent = appState.quantitativos.area_revestimento_m2;
  atualizarCalculosFinanceiros();
}

function aoEditarAreaLamina(val) {
  const m = parseFloat(val) || 0.0;
  appState.quantitativos.area_laminacao_m2 = m.toFixed(2);
  const el = document.getElementById("statAreaLamina");
  if (el) el.textContent = appState.quantitativos.area_laminacao_m2;
  atualizarCalculosFinanceiros();
}

function aoEditarVolumeM3(val) {
  const m = parseFloat(val) || 0.0;
  const litros = Math.round(m * 1000);
  appState.quantitativos.volume_m3 = m.toFixed(2);
  appState.quantitativos.volume_litros = litros;
  const elVolM3 = document.getElementById("statVolumeM3");
  const elVolL = document.getElementById("statVolumeLitros");
  if (elVolM3) elVolM3.textContent = appState.quantitativos.volume_m3;
  if (elVolL) elVolL.textContent = `${litros.toLocaleString('pt-BR')} L`;
}

function aoEditarCantosLineares(val) {
  const m = parseFloat(val) || 0.0;
  appState.quantitativos.cantos_lineares_m = m.toFixed(2);
  appState.quantitativos.cantos_lineares_cm = (m * 100.0).toFixed(1);
  delete appState.quantitativos.finish_linear_override;
  const elCantos = document.getElementById("statCantosLineares");
  if (elCantos) elCantos.textContent = appState.quantitativos.cantos_lineares_m;
  recalcularPecasAcabamento();
  atualizarCalculosFinanceiros();
}

function aoEditarQuinasVivas(val) {
  const q = parseInt(val) || 0;
  appState.quantitativos.quinas_vivas_count = q;
  delete appState.quantitativos.finish_quina_override;
  const elQuinas = document.getElementById("statQuinasVivas");
  if (elQuinas) elQuinas.textContent = q > 0 ? `${q} quina(s) viva(s)` : "0 quinas vivas";
  recalcularPecasAcabamento();
  atualizarCalculosFinanceiros();
}

// Edição direta de peças de acabamento (quantidade de peças)
function aoEditarFinishLinear(val) {
  const q = parseInt(val) || 0;
  appState.quantitativos.finish_linear_override = q;
  const el = document.getElementById("lblFinishLinearQtd");
  if (el) el.textContent = `${q} un`;
  atualizarCalculosFinanceiros();
}

function aoEditarFinishQuina(val) {
  const q = parseInt(val) || 0;
  appState.quantitativos.finish_quina_override = q;
  const el = document.getElementById("lblFinishQuinaQtd");
  if (el) el.textContent = `${q} un`;
  atualizarCalculosFinanceiros();
}

// Funções de Copiar para Área de Transferência
function copiarValorQuant(inputId, label, sufixo = "") {
  const input = document.getElementById(inputId);
  if (!input) return;
  const val = input.value || "0";
  copiarParaClipboard(val, `${label}: ${val}${sufixo}`);
}

function copiarTexto(elementId, label, sufixo = "") {
  const el = document.getElementById(elementId);
  if (!el) return;
  const val = (el.textContent || el.innerText || "").trim();
  copiarParaClipboard(val, `${label}: ${val}${sufixo}`);
}

function copiarParaClipboard(texto, labelFeedback) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(texto).then(() => {
      showToast(`${labelFeedback} copiado!`, "success");
    }).catch(() => {
      fallbackCopiar(texto, labelFeedback);
    });
  } else {
    fallbackCopiar(texto, labelFeedback);
  }
}

function fallbackCopiar(texto, labelFeedback) {
  try {
    const tempInput = document.createElement("input");
    tempInput.style.position = "fixed";
    tempInput.style.opacity = "0";
    tempInput.value = texto;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    showToast(`${labelFeedback} copiado!`, "success");
  } catch (e) {
    showToast(`Copiado: ${texto}`, "info");
  }
}

function onAjusteErro(erro) {
  const lblMatRev = document.getElementById("lblStatusMatRevest");
  const lblMatLam = document.getElementById("lblStatusMatLamina");
  if (lblMatRev && (!appState.quantitativos.area_revestimento_m2 || parseFloat(appState.quantitativos.area_revestimento_m2) <= 0)) {
    lblMatRev.textContent = "Não detectado";
  }
  if (lblMatLam && (!appState.quantitativos.area_laminacao_m2 || parseFloat(appState.quantitativos.area_laminacao_m2) <= 0)) {
    lblMatLam.textContent = "Não detectado";
  }
  showToast(erro || "Falha na análise geométrica.", "error");
}

function aplicarLaminacaoTotal() {
  if (window.sketchup) {
    if (window.sketchup.aplicar_laminacao) {
      window.sketchup.aplicar_laminacao();
    } else {
      window.sketchup.aplicar_materiais_padrao();
    }
  } else {
    showToast("Todo o componente da piscina foi pintado de cinza (Laminação)!", "success");
  }
}

function aplicarMateriaisPadrao() {
  aplicarLaminacaoTotal();
}

function destacarLaminacao3D() {
  if (window.sketchup && window.sketchup.selecionar_faces_laminacao) {
    window.sketchup.selecionar_faces_laminacao();
  } else {
    showToast("Faces de laminação (borda + paredes externas) destacadas no 3D!", "info");
  }
}

function destacarRevestimento3D() {
  if (window.sketchup && window.sketchup.selecionar_faces_revestimento) {
    window.sketchup.selecionar_faces_revestimento();
  } else {
    showToast("Faces de revestimento interno destacadas no 3D!", "info");
  }
}

// ==============================================================================
// RECALCULO DE PEÇAS DE ACABAMENTO (SEÇÃO 7)
// ==============================================================================
function recalcularPecasAcabamento() {
  const rev = appState.coating_type;
  const cantosCm = parseFloat(appState.quantitativos.cantos_lineares_cm) || (parseFloat(appState.quantitativos.cantos_lineares_m) * 100.0) || 0;
  const quinas = parseInt(appState.quantitativos.quinas_vivas_count) || 0;

  const boxNorm = document.getElementById("finishDetailsNormal");
  const boxAlert = document.getElementById("alertPersonalizado");
  const badgeRule = document.getElementById("badgeFinishRule");

  const lblLinearNome = document.getElementById("lblFinishLinearNome");
  const lblLinearQtd = document.getElementById("lblFinishLinearQtd");
  const lblQuinaNome = document.getElementById("lblFinishQuinaNome");
  const lblQuinaQtd = document.getElementById("lblFinishQuinaQtd");

  const cInfo = (appState.precos.revestimentos || []).find(r => r.id === rev) || { acabamento: "personalizado" };
  const regra = cInfo.acabamento || (rev === "porcelanato_villagres" || rev === "personalizado" ? "personalizado" : (rev === "pastilha_7_5x7_5" ? "boleada_7_5" : (rev === "pastilha_15x15" ? "boleada_15" : "bp11_c3")));

  if (regra === "personalizado") {
    // Porcelanato Villagres ou Personalizado:
    // Informa metragens e quinas, mas sem cálculo prévio de peças
    if (boxNorm) boxNorm.style.display = "none";
    if (boxAlert) boxAlert.style.display = "flex";
    if (badgeRule) {
      badgeRule.textContent = "Personalizado";
      badgeRule.style.background = "#fef3c7";
      badgeRule.style.color = "#92400e";
    }
  } else {
    if (boxNorm) boxNorm.style.display = "flex";
    if (boxAlert) boxAlert.style.display = "none";

    if (regra === "bp11_c3") {
      // Cantoneira BP11 (20 cm cada) -> ceil(comprimento ÷ 20 cm) + 1 C3 por quina viva
      const qtdBp11Calc = Math.ceil(cantosCm / 20.0);
      const qtdC3Calc = quinas * 1;
      const qtdBp11 = appState.quantitativos.finish_linear_override !== undefined ? appState.quantitativos.finish_linear_override : qtdBp11Calc;
      const qtdC3 = appState.quantitativos.finish_quina_override !== undefined ? appState.quantitativos.finish_quina_override : qtdC3Calc;

      if (badgeRule) {
        badgeRule.textContent = "BP11 + C3";
        badgeRule.style.background = "#e0f2fe";
        badgeRule.style.color = "#0369a1";
      }
      if (lblLinearNome) lblLinearNome.textContent = "Cantoneira BP11 (20 cm cada)";
      if (lblLinearQtd) lblLinearQtd.textContent = `${qtdBp11} un`;
      if (lblQuinaNome) lblQuinaNome.textContent = "Peça C3 (quina viva)";
      if (lblQuinaQtd) lblQuinaQtd.textContent = `${qtdC3} un`;

      const elInputLin = document.getElementById("inputFinishLinearQtd");
      const elInputQui = document.getElementById("inputFinishQuinaQtd");
      if (elInputLin && document.activeElement !== elInputLin) elInputLin.value = qtdBp11;
      if (elInputQui && document.activeElement !== elInputQui) elInputQui.value = qtdC3;

    } else if (regra === "boleada_7_5") {
      // Boleada reta 7,5cm -> ceil(comprimento ÷ 7,5 cm) + 1 quebra-canto por quina
      const qtdBoleadaCalc = Math.ceil(cantosCm / 7.5);
      const qtdQuebraCalc = quinas * 1;
      const qtdBoleada = appState.quantitativos.finish_linear_override !== undefined ? appState.quantitativos.finish_linear_override : qtdBoleadaCalc;
      const qtdQuebra = appState.quantitativos.finish_quina_override !== undefined ? appState.quantitativos.finish_quina_override : qtdQuebraCalc;

      if (badgeRule) {
        badgeRule.textContent = "Boleada 7,5 + Quebra-canto";
        badgeRule.style.background = "#e0f2fe";
        badgeRule.style.color = "#0369a1";
      }
      if (lblLinearNome) lblLinearNome.textContent = "Pastilha Boleada Reta 7,5x7,5 cm";
      if (lblLinearQtd) lblLinearQtd.textContent = `${qtdBoleada} un`;
      if (lblQuinaNome) lblQuinaNome.textContent = "Peça Quebra-canto (quina viva)";
      if (lblQuinaQtd) lblQuinaQtd.textContent = `${qtdQuebra} un`;

      const elInputLin = document.getElementById("inputFinishLinearQtd");
      const elInputQui = document.getElementById("inputFinishQuinaQtd");
      if (elInputLin && document.activeElement !== elInputLin) elInputLin.value = qtdBoleada;
      if (elInputQui && document.activeElement !== elInputQui) elInputQui.value = qtdQuebra;

    } else if (regra === "boleada_15") {
      // Boleada reta 15cm -> ceil(comprimento ÷ 15 cm) + 1 quebra-canto por quina
      const qtdBoleadaCalc = Math.ceil(cantosCm / 15.0);
      const qtdQuebraCalc = quinas * 1;
      const qtdBoleada = appState.quantitativos.finish_linear_override !== undefined ? appState.quantitativos.finish_linear_override : qtdBoleadaCalc;
      const qtdQuebra = appState.quantitativos.finish_quina_override !== undefined ? appState.quantitativos.finish_quina_override : qtdQuebraCalc;

      if (badgeRule) {
        badgeRule.textContent = "Boleada 15 + Quebra-canto";
        badgeRule.style.background = "#e0f2fe";
        badgeRule.style.color = "#0369a1";
      }
      if (lblLinearNome) lblLinearNome.textContent = "Pastilha Boleada Reta 15x15 cm";
      if (lblLinearQtd) lblLinearQtd.textContent = `${qtdBoleada} un`;
      if (lblQuinaNome) lblQuinaNome.textContent = "Peça Quebra-canto (quina viva)";
      if (lblQuinaQtd) lblQuinaQtd.textContent = `${qtdQuebra} un`;

      const elInputLin = document.getElementById("inputFinishLinearQtd");
      const elInputQui = document.getElementById("inputFinishQuinaQtd");
      if (elInputLin && document.activeElement !== elInputLin) elInputLin.value = qtdBoleada;
      if (elInputQui && document.activeElement !== elInputQui) elInputQui.value = qtdQuebra;
    }
  }
}

// ==============================================================================
// MOTOR DE PRECIFICAÇÃO E REGRAS (SEÇÃO 9 E 11)
// ==============================================================================
// MOTOR DE PRECIFICAÇÃO E REGRAS (SEÇÃO 9)
// ==============================================================================
function atualizarCalculosFinanceiros() {
  verificarRegraMoldeIncorporadora();

  const areaRevest = parseFloat(appState.quantitativos.area_revestimento_m2) || 0.0;
  const divisao = (appState.selected_division || "sob_medida").toLowerCase();
  const poolType = (appState.pool_type || "convencional").toLowerCase();

  // 1. Área de revestimento × preço do m² (conforme divisão e tipo) - Seção 9.1 & 9.4
  const divPrecos = appState.precos.m2_prices?.[divisao] || { convencional: 140.0, especial: 175.0 };
  const precoM2Padrao = parseFloat(divPrecos[poolType]) || 140.0;
  let precoM2Efetivo = precoM2Padrao;
  let descontoM2 = 0.0;
  let valorDescontoMolde = 0.0;

  // 2. Regra de Molde (Incorporadora): se com molde, usa diretamente o valor configurado para molde
  const isIncorporadora = divisao === "incorporadora";
  if (isIncorporadora && appState.has_mold) {
    if (poolType === "especial") {
      precoM2Efetivo = parseFloat(appState.precos.molde?.preco_m2_especial) || (precoM2Padrao - (parseFloat(appState.precos.molde?.desconto_m2) || 20.0));
    } else {
      precoM2Efetivo = parseFloat(appState.precos.molde?.preco_m2_convencional) || (precoM2Padrao - (parseFloat(appState.precos.molde?.desconto_m2) || 20.0));
    }
    descontoM2 = Math.max(0, precoM2Padrao - precoM2Efetivo);
    valorDescontoMolde = areaRevest * descontoM2;
  }

  const valorBaseRevest = areaRevest * precoM2Padrao;
  const valorAposMolde = areaRevest * precoM2Efetivo;

  // 3. + Acréscimo de autoportante (se aplicável, +50%) - Seção 9.3 & 9.4
  const isAuto = appState.structure_type === "autoportante";
  const pctAuto = isAuto ? (parseFloat(appState.precos.acrescimos?.autoportante_pct) || 50.0) : 0.0;
  const diffAuto = valorAposMolde * (pctAuto / 100.0);
  const valorComAuto = valorAposMolde + diffAuto;

  // 4. + Acréscimo da etapa (Prévia: +5% ou Galga: 0%) - Seção 9.3 & 9.4
  const pctEtapa = appState.stage === "previa" 
    ? (parseFloat(appState.precos.acrescimos?.etapas?.previa) ?? 5.0) 
    : (parseFloat(appState.precos.acrescimos?.etapas?.galga) ?? 0.0);
  const diffMargem = valorComAuto * (pctEtapa / 100.0);
  const valorFinalUnitario = valorComAuto + diffMargem;

  // 5. × Quantidade de unidades do modelo - Seção 9.4
  const inputUnidades = document.getElementById("inputUnidades");
  const unidades = isIncorporadora ? Math.max(1, parseInt(inputUnidades ? inputUnidades.value : 1) || 1) : 1;
  const valorTotalGeral = valorFinalUnitario * unidades;

  // Atualiza Valores na UI
  const formatBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const lblBase = document.getElementById("lblValorBase");
  const lblDescontoMolde = document.getElementById("lblValorDescontoMolde");
  const rowMolde = document.getElementById("rowDescontoMolde");
  const lblAuto = document.getElementById("lblValorAuto");
  const rowAuto = document.getElementById("rowAutoAcrescimo");
  const lblMarg = document.getElementById("lblValorMargem");
  const lblUnit = document.getElementById("lblValorUnitario");
  const lblCount = document.getElementById("lblTotalUnitsCount");
  const lblTotal = document.getElementById("lblValorTotalGeral");
  const lblMargemPct = document.getElementById("lblMargemPct");

  if (lblBase) lblBase.textContent = `${formatBRL(valorAposMolde)} (${areaRevest.toFixed(2)}m² × ${formatBRL(precoM2Efetivo)}/m²)`;
  if (rowMolde) rowMolde.style.display = (isIncorporadora && appState.has_mold && valorDescontoMolde > 0) ? "flex" : "none";
  if (lblDescontoMolde) lblDescontoMolde.textContent = `− ${formatBRL(valorDescontoMolde)} (Preço com Molde: ${formatBRL(precoM2Efetivo)}/m²)`;
  if (rowAuto) rowAuto.style.display = isAuto ? "flex" : "none";
  if (lblAuto) lblAuto.textContent = `+ ${formatBRL(diffAuto)}`;
  if (lblMargemPct) lblMargemPct.textContent = appState.stage === "previa" ? "Prévia +5%" : "Galga 0%";
  if (lblMarg) lblMarg.textContent = `+ ${formatBRL(diffMargem)}`;
  if (lblUnit) lblUnit.textContent = formatBRL(valorFinalUnitario);
  if (lblCount) lblCount.textContent = `${unidades} un`;
  if (lblTotal) lblTotal.textContent = formatBRL(valorTotalGeral);

  appState.valoresCalculados = {
    unit_base_value: valorBaseRevest,
    unit_molde_discount: valorDescontoMolde,
    unit_autoportante_value: diffAuto,
    unit_stage_margin_value: diffMargem,
    unit_final_value: valorFinalUnitario,
    total_model_value: valorTotalGeral,
    units_count: unidades
  };
}

// ==============================================================================
// ENVIO PARA O SISTEMA WEB (SEÇÃO 4 E 5)
// ==============================================================================
function enviarParaSistemaWeb() {
  const modo = appState.modo_orcamento;
  const divisao = appState.selected_division;
  const etapa = appState.stage;

  // Validação obrigatória do número do orçamento digitado pelo usuário (vem do e-mail)
  const inputCod = document.getElementById("inputNumeroOrcamento");
  const budgetCode = (inputCod ? inputCod.value : "").trim();
  if (!budgetCode) {
    showToast("Por favor, digite o número do orçamento (fornecido por e-mail).", "error");
    switchTab(1);
    if (inputCod) inputCod.focus();
    return;
  }

  const inputProj = document.getElementById("inputProjeto");
  const inputCli = document.getElementById("inputCliente");
  const inputMod = document.getElementById("inputModelo");
  const inputUnid = document.getElementById("inputUnidades");

  let projNome = inputProj ? inputProj.value.trim() : "";
  let cliNome = inputCli ? inputCli.value.trim() : "";
  const modeloNome = (inputMod ? inputMod.value.trim() : "") || "Modelo iGUi 3D";
  const unidades = appState.selected_division === "sob_medida" ? 1 : Math.max(1, parseInt(inputUnid ? inputUnid.value : 1) || 1);

  let budgetId = null;
  if (modo === "existente" || modo === "galga") {
    if (appState.orcamentoExistenteSelecionado) {
      budgetId = appState.orcamentoExistenteSelecionado.id;
      projNome = appState.orcamentoExistenteSelecionado.project_name || projNome;
      cliNome = appState.orcamentoExistenteSelecionado.client_name || cliNome;
    } else {
      const sel = document.getElementById("selectOrcamentoExistente");
      budgetId = sel ? sel.value : null;
    }
  }

  const payload = {
    modo_orcamento: modo,
    budget_code: budgetCode,
    budget_id: budgetId,
    division: divisao,
    stage: etapa,
    project_name: projNome || `Projeto ${budgetCode}`,
    client_name: cliNome || "Cliente Geral",
    model_name: modeloNome,
    units_count: unidades,
    pool_type: appState.pool_type,
    structure_type: appState.structure_type,
    coating_type: appState.coating_type,
    has_mold: appState.has_mold,
    
    // Quantitativos 3D
    area_revestimento_m2: parseFloat(appState.quantitativos.area_revestimento_m2),
    area_laminacao_m2: parseFloat(appState.quantitativos.area_laminacao_m2),
    internal_volume_m3: parseFloat(appState.quantitativos.volume_m3),
    internal_volume_liters: parseInt(appState.quantitativos.volume_litros),
    linear_corners_m: parseFloat(appState.quantitativos.cantos_lineares_m),
    linear_corners_cm: parseFloat(appState.quantitativos.cantos_lineares_cm),
    alive_corners_count: parseInt(appState.quantitativos.quinas_vivas_count),
    finishes: appState.quantitativos.finishes,

    // Valores
    unit_base_value: appState.valoresCalculados.unit_base_value || 0,
    unit_autoportante_value: appState.valoresCalculados.unit_autoportante_value || 0,
    unit_final_value: appState.valoresCalculados.unit_final_value || 0,
    total_model_value: appState.valoresCalculados.total_model_value || 0,

    // Usuário
    user_id: appState.user.id,
    user_name: appState.user.name
  };

  showToast("Enviando orçamento para a nuvem iGUi...", "info");

  const strip = document.getElementById("syncStatusStrip");
  const stripText = document.getElementById("syncStatusText");
  const stripIcon = document.getElementById("syncStatusIcon");
  if (strip) {
    strip.style.display = "flex";
    strip.className = "plugin-sync-status-strip status-pendente";
    if (stripIcon) stripIcon.textContent = "⏳";
    if (stripText) stripText.textContent = "Enviando para a nuvem iGUi...";
  }

  if (window.sketchup) {
    window.sketchup.enviar_orcamento(payload);
  } else {
    setTimeout(() => {
      onEnvioSucesso({
        success: true,
        budget_id: "orc-mock-saved",
        queue_count: 0,
        message: `Orçamento nº ${budgetCode} enviado com sucesso para ${divisao.toUpperCase()} (${etapa.toUpperCase()})!`,
        project_url: `orcamento.html?id=mock`
      });
    }, 600);
  }
}

function onEnvioSucesso(res) {
  showToast(res.message || "Orçamento enviado com sucesso!", "success");

  const strip = document.getElementById("syncStatusStrip");
  const stripText = document.getElementById("syncStatusText");
  const stripIcon = document.getElementById("syncStatusIcon");
  if (strip) {
    strip.style.display = "flex";
    strip.className = "plugin-sync-status-strip status-enviado";
    if (stripIcon) stripIcon.textContent = "✅";
    if (stripText) stripText.textContent = "Enviado com sucesso";
  }

  atualizarStatusFilaLocal(res.queue_count || 0);

  setTimeout(() => {
    if (confirm("Orçamento sincronizado com sucesso!\n\nDeseja abrir a página do orçamento no sistema web agora?")) {
      const url = res.project_url || `index.html?divisao=${appState.selected_division}&etapa=${appState.stage}`;
      if (window.sketchup) {
        window.sketchup.abrir_url(url);
      } else {
        window.open(`../${url}`, "_blank");
      }
    }
  }, 400);
}

function onEnvioErro(res) {
  const erroMsg = typeof res === "object" ? (res.error || res.message || "Falha ao enviar") : String(res);
  showToast(erroMsg, "error");

  const strip = document.getElementById("syncStatusStrip");
  const stripText = document.getElementById("syncStatusText");
  const stripIcon = document.getElementById("syncStatusIcon");
  if (strip) {
    strip.style.display = "flex";
    if (typeof res === "object" && res.pendente) {
      strip.className = "plugin-sync-status-strip status-pendente";
      if (stripIcon) stripIcon.textContent = "⏳";
      if (stripText) stripText.textContent = `Pendente na fila local (salvo para reenvio)`;
    } else {
      strip.className = "plugin-sync-status-strip status-erro";
      if (stripIcon) stripIcon.textContent = "❌";
      if (stripText) stripText.textContent = `Erro: ${erroMsg}`;
    }
  }

  const queueCount = (typeof res === "object" && res.queue_count !== undefined) ? res.queue_count : (appState.pendentes_count || 1);
  atualizarStatusFilaLocal(queueCount);
}

// ==============================================================================
// FILA LOCAL E REENVIO DE PENDENTES (SEÇÃO 14.1)
// ==============================================================================
function atualizarStatusFilaLocal(count) {
  const qtd = parseInt(count) || 0;
  appState.pendentes_count = qtd;

  const topBanner = document.getElementById("pluginSyncBanner");
  const topCount = document.getElementById("topPendentesCount");
  const btnTop = document.getElementById("btnPluginReenviarTop");
  const countSpan = document.getElementById("countPendentes");
  const btnAba3 = document.getElementById("btnReenviarPendentes");

  if (topCount) topCount.textContent = qtd;
  if (countSpan) countSpan.textContent = qtd;

  if (qtd > 0) {
    if (topBanner) topBanner.style.display = "flex";
    if (btnTop) btnTop.style.display = "inline-block";
    if (btnAba3) btnAba3.style.display = "inline-block";
  } else {
    if (topBanner) topBanner.style.display = "none";
    if (btnTop) btnTop.style.display = "none";
    if (btnAba3) btnAba3.style.display = "none";
  }
}

function solicitarReenvioPendentes() {
  showToast("Reenviando orçamentos pendentes na fila local...", "info");
  const strip = document.getElementById("syncStatusStrip");
  const stripText = document.getElementById("syncStatusText");
  const stripIcon = document.getElementById("syncStatusIcon");
  if (strip) {
    strip.style.display = "flex";
    strip.className = "plugin-sync-status-strip status-pendente";
    if (stripIcon) stripIcon.textContent = "⏳";
    if (stripText) stripText.textContent = "Reenviando orçamentos pendentes...";
  }

  if (window.sketchup && window.sketchup.reenviar_pendentes) {
    window.sketchup.reenviar_pendentes();
  } else {
    setTimeout(() => {
      onReenvioPendentes({
        success: true,
        message: "Fila processada com sucesso!",
        reenviados: 1,
        restantes: 0
      });
    }, 1000);
  }
}

function onReenvioPendentes(res) {
  if (res && res.message) {
    showToast(res.message, res.success ? "success" : "warning");
  }
  atualizarStatusFilaLocal(res.restantes || 0);

  const strip = document.getElementById("syncStatusStrip");
  const stripText = document.getElementById("syncStatusText");
  const stripIcon = document.getElementById("syncStatusIcon");

  if (strip) {
    strip.style.display = "flex";
    if ((res.restantes || 0) === 0) {
      strip.className = "plugin-sync-status-strip status-enviado";
      if (stripIcon) stripIcon.textContent = "✅";
      if (stripText) stripText.textContent = "Todos os pendentes foram enviados com sucesso!";
    } else {
      strip.className = "plugin-sync-status-strip status-pendente";
      if (stripIcon) stripIcon.textContent = "⏳";
      if (stripText) stripText.textContent = `${res.restantes} orçamento(s) ainda pendente(s).`;
    }
  }
}

// ==============================================================================
// TOAST NOTIFICATIONS
// ==============================================================================
function showToast(msg, tipo = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.remove();
  }, 3500);
}
