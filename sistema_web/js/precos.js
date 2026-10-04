// ==============================================================================
// CONTROLADOR DA CENTRAL DE CONFIGURAÇÕES & USUÁRIOS (SOMENTE ADMIN)
// Gestão de Preços, Molde, Acréscimos e Equipe
// ==============================================================================

let currentActiveTab = "precos"; // 'precos' | 'usuarios'
let selectedAvatarColor = "#0284c7";

const AVATAR_COLORS = [
  "#0284c7", // Azul iGUi
  "#10b981", // Verde Esmeralda
  "#f97316", // Laranja Primário
  "#8b5cf6", // Roxo Royal
  "#ef4444", // Vermelho Coral
  "#06b6d4", // Ciano Mar
  "#6366f1", // Índigo
  "#d97706"  // Âmbar
];

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Verifica se o usuário ativo é administrador
  if (!Auth.isAdmin()) {
    if (typeof PapaSysDialog !== "undefined") {
      await PapaSysDialog.alert({
        title: "Acesso Restrito",
        message: "Apenas Administradores e a Diretoria têm acesso à Central de Configurações.",
        type: "warning"
      });
    }
    window.location.href = "index.html";
    return;
  }

  // 2. Monta o seletor de cores do avatar
  renderAvatarColorPicker();

  // 3. Carrega valores de preços
  carregarConfiguracoesNaTela();

  // 4. Carrega a tabela de usuários
  carregarTabelaUsuarios();

  // 5. Verifica se a URL veio com ?tab=usuarios
  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") === "usuarios") {
    alternarAbaConfig("usuarios");
  }

  // 6. Atualiza dados do usuário no header
  if (typeof Auth !== "undefined" && Auth.updateUserUI) {
    Auth.updateUserUI();
  }
});

// Alterna entre a aba de Preços e a aba de Usuários
function alternarAbaConfig(aba) {
  currentActiveTab = aba;

  const btnPrecos = document.getElementById("tabBtnPrecos");
  const btnUsuarios = document.getElementById("tabBtnUsuarios");
  const painelPrecos = document.getElementById("painelPrecos");
  const painelUsuarios = document.getElementById("painelUsuarios");
  const acoesPrecos = document.getElementById("acoesAbaPrecos");
  const acoesUsuarios = document.getElementById("acoesAbaUsuarios");

  if (aba === "precos") {
    btnPrecos.classList.add("active");
    btnUsuarios.classList.remove("active");
    painelPrecos.style.display = "grid";
    painelUsuarios.style.display = "none";
    if (acoesPrecos) acoesPrecos.style.display = "inline-flex";
    if (acoesUsuarios) acoesUsuarios.style.display = "none";
  } else {
    btnPrecos.classList.remove("active");
    btnUsuarios.classList.add("active");
    painelPrecos.style.display = "none";
    painelUsuarios.style.display = "block";
    if (acoesPrecos) acoesPrecos.style.display = "none";
    if (acoesUsuarios) acoesUsuarios.style.display = "inline-flex";
    carregarTabelaUsuarios();
  }
}

// ==============================================================================
// ==============================================================================
// SEÇÃO A: PREÇOS & REGRAS DE CÁLCULO (SEÇÕES 9, 10, 11)
// ==============================================================================

function carregarConfiguracoesNaTela() {
  const settings = PricingEngine.getSettings();

  // 1. Renderiza a tabela dinâmica de Revestimentos / Pastilhas
  renderizarTabelaRevestimentos();

  // 2. Peças de Acabamento (R$/unidade)
  document.getElementById("preco_acab_bp11").value = settings.acabamento.bp11 || 18.50;
  document.getElementById("preco_acab_c3").value = settings.acabamento.c3 || 14.00;
  document.getElementById("preco_acab_boleada_7_5").value = settings.acabamento.boleada_7_5 || 8.50;
  document.getElementById("preco_acab_boleada_15").value = settings.acabamento.boleada_15 || 12.00;
  document.getElementById("preco_acab_quebra_canto").value = settings.acabamento.quebra_canto || 15.00;

  // 3. Laminação (R$/m² fixo - sem distinção de molde na laminação)
  const elLam = document.getElementById("preco_lam_m2");
  if (elLam) {
    elLam.value = (settings.laminacao.preco_m2 !== undefined) ? settings.laminacao.preco_m2 : (settings.laminacao.sem_molde || 95.00);
  }

  // 4. Parâmetros e Regras (Seção 9, 10, 11)
  document.getElementById("regra_min_molde").value = settings.regras.min_unidades_molde || 10;
  document.getElementById("regra_pct_autoportante").value = settings.regras.acrescimo_autoportante_pct || 50.0;
  document.getElementById("regra_pct_previa").value = settings.regras.margem_previa_pct || 5.0;
  document.getElementById("regra_pct_galga").value = settings.regras.margem_galga_pct || 0.0;
  document.getElementById("regra_pct_desenho").value = settings.regras.margem_desenho_tecnico_pct || 0.0;

  // 5. Insumos complementares
  const elArg = document.getElementById("preco_insumo_argamassa");
  const elRej = document.getElementById("preco_insumo_rejunte");
  if (elArg) elArg.value = settings.insumos.argamassa_m2 || 10.50;
  if (elRej) elRej.value = settings.insumos.rejunte_m2 || 6.80;
}

// Renderiza a lista de pastilhas com visual moderno em cards (Sem Molde & Com Molde)
function renderizarTabelaRevestimentos() {
  const container = document.getElementById("listaRevestimentosContainer");
  const tbody = document.getElementById("listaRevestimentosTabela");
  if (!container && !tbody) return;

  const coatings = PricingEngine.getCoatingsList();
  const finishLabels = {
    bp11_c3: "Cantoneira BP11 + C3",
    boleada_7_5: "Boleada 7,5 + Quebra-canto",
    boleada_15: "Boleada 15 + Quebra-canto",
    personalizado: "Personalizado"
  };

  if (container) {
    container.innerHTML = coatings.map((c) => {
      const precoSem = (c.preco_sem_molde !== undefined ? c.preco_sem_molde : 0).toFixed(2);
      const precoCom = (c.preco_com_molde !== undefined ? c.preco_com_molde : 0).toFixed(2);
      const finishText = finishLabels[c.acabamento] || c.acabamento;

      return `
        <div class="coating-item-card" id="card_coating_${c.id}">
          <div class="coating-item-header">
            <div class="coating-item-info">
              <div class="coating-item-icon">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </div>
              <span class="coating-item-title">${c.nome}</span>
              ${c.is_custom ? '<span class="coating-custom-badge">Personalizado</span>' : ''}
            </div>
            
            <div class="coating-item-header-right">
              <span class="coating-finish-pill" title="Regra de acabamento">${finishText}</span>
              ${c.is_custom ? `
                <button type="button" class="btn-del-coating" onclick="excluirRevestimento('${c.id}', '${c.nome}')" title="Excluir esta pastilha">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              ` : ''}
            </div>
          </div>

          <div class="coating-item-prices-grid">
            <div class="coating-price-field sem-molde">
              <span class="coating-price-tag">Sem Molde:</span>
              <div class="config-input-group price-field-group">
                <span class="config-prefix">R$</span>
                <input type="number" id="preco_sem_molde_${c.id}" class="config-input price-card-input" step="0.50" min="0" value="${precoSem}" placeholder="0.00">
                <span class="config-suffix">/m²</span>
              </div>
            </div>

            <div class="coating-price-field com-molde">
              <span class="coating-price-tag">Com Molde:</span>
              <div class="config-input-group price-field-group">
                <span class="config-prefix">R$</span>
                <input type="number" id="preco_com_molde_${c.id}" class="config-input price-card-input" step="0.50" min="0" value="${precoCom}" placeholder="0.00">
                <span class="config-suffix">/m²</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
}

// Salva todos os preços configurados
function salvarConfiguracoesPreco() {
  const coatings = PricingEngine.getCoatingsList().map(c => {
    const elSem = document.getElementById(`preco_sem_molde_${c.id}`);
    const elCom = document.getElementById(`preco_com_molde_${c.id}`);
    const sem = elSem ? (parseFloat(elSem.value) || 0) : c.preco_sem_molde;
    const com = elCom ? (parseFloat(elCom.value) || 0) : c.preco_com_molde;
    return {
      ...c,
      preco_sem_molde: sem,
      preco_com_molde: com
    };
  });

  const elLam = document.getElementById("preco_lam_m2");
  const precoLam = elLam ? (parseFloat(elLam.value) || 95.00) : 95.00;

  const elArg = document.getElementById("preco_insumo_argamassa");
  const elRej = document.getElementById("preco_insumo_rejunte");

  const updated = {
    revestimentos: coatings,
    revestimento: coatings.reduce((acc, c) => { acc[c.id] = c.preco_sem_molde; return acc; }, {}),
    acabamento: {
      bp11: parseFloat(document.getElementById("preco_acab_bp11").value) || 18.50,
      c3: parseFloat(document.getElementById("preco_acab_c3").value) || 14.00,
      boleada_7_5: parseFloat(document.getElementById("preco_acab_boleada_7_5").value) || 8.50,
      boleada_15: parseFloat(document.getElementById("preco_acab_boleada_15").value) || 12.00,
      quebra_canto: parseFloat(document.getElementById("preco_acab_quebra_canto").value) || 15.00
    },
    laminacao: {
      preco_m2: precoLam,
      sem_molde: precoLam,
      com_molde: precoLam
    },
    insumos: {
      argamassa_m2: elArg ? (parseFloat(elArg.value) || 10.50) : 10.50,
      rejunte_m2: elRej ? (parseFloat(elRej.value) || 6.80) : 6.80
    },
    regras: {
      min_unidades_molde: parseInt(document.getElementById("regra_min_molde").value) || 10,
      acrescimo_autoportante_pct: parseFloat(document.getElementById("regra_pct_autoportante").value) || 50.0,
      margem_previa_pct: parseFloat(document.getElementById("regra_pct_previa").value) || 5.0,
      margem_galga_pct: parseFloat(document.getElementById("regra_pct_galga").value) || 0.0,
      margem_desenho_tecnico_pct: parseFloat(document.getElementById("regra_pct_desenho").value) || 0.0
    }
  };

  const ok = PricingEngine.saveSettings(updated);
  if (ok) {
    showToast("Todas as tabelas de preços e regras foram salvas com sucesso!", "success");
    carregarConfiguracoesNaTela();
  } else {
    showToast("Falha ao salvar configurações de preço.", "error");
  }
}

// Modal de Adicionar Nova Pastilha / Revestimento
function abrirModalNovoRevestimento() {
  const m = document.getElementById("modalNovoRevestimento");
  if (!m) return;
  document.getElementById("inputNovoRevNome").value = "";
  document.getElementById("inputNovoRevPrecoSemMolde").value = "";
  document.getElementById("inputNovoRevPrecoComMolde").value = "";
  document.getElementById("selectNovoRevAcabamento").value = "bp11_c3";
  m.style.display = "flex";
}

function fecharModalNovoRevestimento() {
  const m = document.getElementById("modalNovoRevestimento");
  if (m) m.style.display = "none";
}

function confirmarAdicionarNovoRevestimento() {
  const nome = (document.getElementById("inputNovoRevNome").value || "").trim();
  const acabamento = document.getElementById("selectNovoRevAcabamento").value;
  const precoSem = parseFloat(document.getElementById("inputNovoRevPrecoSemMolde").value);
  const precoCom = parseFloat(document.getElementById("inputNovoRevPrecoComMolde").value);

  if (!nome) {
    showToast("Digite o nome da nova pastilha / revestimento.", "error");
    document.getElementById("inputNovoRevNome").focus();
    return;
  }

  if (isNaN(precoSem) || isNaN(precoCom)) {
    showToast("Informe os preços por m² (Sem Molde e Com Molde).", "error");
    return;
  }

  PricingEngine.addCoating({
    nome: nome,
    acabamento: acabamento,
    preco_sem_molde: precoSem,
    preco_com_molde: precoCom
  });

  fecharModalNovoRevestimento();
  carregarConfiguracoesNaTela();
  showToast(`Nova pastilha "${nome}" adicionada com sucesso!`, "success");
}

async function excluirRevestimento(id, nome) {
  const ok = await PapaSysDialog.confirm({
    title: "Excluir Pastilha",
    message: `Deseja realmente remover o revestimento "${nome}" das configurações?`,
    confirmText: "Sim, Excluir",
    cancelText: "Cancelar",
    type: "danger"
  });
  if (!ok) return;

  PricingEngine.removeCoating(id);
  carregarConfiguracoesNaTela();
  showToast(`Revestimento "${nome}" removido.`, "info");
}

async function restaurarPadroes() {
  const ok = await PapaSysDialog.confirm({
    title: "Restaurar Padrões de Preço",
    message: "Deseja restaurar todos os valores unitários de pastilhas, insumos e percentuais para a tabela padrão original?",
    confirmText: "Sim, Restaurar",
    cancelText: "Cancelar",
    type: "warning"
  });
  if (!ok) return;

  PricingEngine.saveSettings(PricingEngine.DEFAULT_SETTINGS);
  carregarConfiguracoesNaTela();
  showToast("Valores e percentuais restaurados para os padrões de fábrica!", "success");
}

// ==============================================================================
// SEÇÃO B: GESTÃO DE USUÁRIOS & PERMISSÕES (SEÇÃO 3)
// ==============================================================================

function carregarTabelaUsuarios() {
  const tbody = document.getElementById("tbodyUsuarios");
  const lblTotal = document.getElementById("lblTotalUsuarios");
  if (!tbody) return;

  const users = Auth.getAllUsers();
  const current = Auth.getCurrentUser();

  if (lblTotal) {
    lblTotal.textContent = `${users.length} ${users.length === 1 ? 'colaborador' : 'colaboradores'}`;
  }

  const divNames = {
    sob_medida: "Sob Medida",
    incorporadora: "Incorporadora",
    internacional: "Internacional"
  };

  const stageNames = {
    previa: "1. Prévia",
    galga: "2. Galga",
    desenho_tecnico: "3. Desenho Técnico"
  };

  tbody.innerHTML = users.map(u => {
    const isCurrent = u.id === current.id;
    const parts = (u.name || "U").trim().split(" ");
    const initials = parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();

    const roleBadge = u.role === "admin"
      ? '<span class="badge-role admin">Administrador (Total)</span>'
      : '<span class="badge-role">Projetista / Usuário</span>';

    const divsPills = (u.allowed_divisions || []).map(d => {
      const cls = d === "sob_medida" ? "sob-medida" : d;
      return `<span class="badge-perm-pill ${cls}">${divNames[d] || d}</span>`;
    }).join("");

    const stagesPills = (u.allowed_stages || []).map(s => {
      return `<span class="badge-stage-pill">${stageNames[s] || s}</span>`;
    }).join("");

    const statusPill = u.active !== false
      ? '<span class="status-indicator-pill active">● Ativo</span>'
      : '<span class="status-indicator-pill inactive">○ Inativo</span>';

    return `
      <tr>
        <td>
          <div class="user-cell-wrap">
            <div class="user-circle-avatar" style="background: ${u.avatar_color || '#0284c7'};">
              ${initials}
            </div>
            <div>
              <div class="user-name-title">${u.name} ${isCurrent ? '<span style="font-size: 10px; color: var(--igui-blue); font-weight: 800;">(Você)</span>' : ''}</div>
              <div class="user-email-subtitle">${u.email}</div>
            </div>
          </div>
        </td>
        <td>${roleBadge}</td>
        <td>
          <div style="display: flex; flex-wrap: wrap; max-width: 280px;">
            ${divsPills || '<span style="color: #94a3b8; font-size: 11px;">Nenhuma</span>'}
          </div>
        </td>
        <td>
          <div style="display: flex; flex-wrap: wrap; max-width: 250px;">
            ${stagesPills || '<span style="color: #94a3b8; font-size: 11px;">Nenhuma</span>'}
          </div>
        </td>
        <td>${statusPill}</td>
        <td style="text-align: right;">
          <div class="users-actions-cell" style="justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalEditarUsuario('${u.id}')" title="Editar permissões">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Editar
            </button>

            ${!isCurrent ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="alternarSessaoPara('${u.id}')" title="Conectar como este usuário para testar">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                  <polyline points="10 17 15 12 10 7"></polyline>
                  <line x1="15" y1="12" x2="3" y2="12"></line>
                </svg>
                Entrar
              </button>

              <button type="button" class="btn btn-danger-ghost" onclick="excluirUsuario('${u.id}')" title="Remover usuário">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAvatarColorPicker() {
  const wrap = document.getElementById("avatarColorPickerWrap");
  if (!wrap) return;

  wrap.innerHTML = AVATAR_COLORS.map(color => `
    <button type="button" class="color-picker-dot ${color === selectedAvatarColor ? 'selected' : ''}" 
      style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${color === selectedAvatarColor ? '#0f172a' : 'transparent'}; background: ${color}; cursor: pointer; padding: 0;"
      onclick="selecionarCorAvatar('${color}')" title="${color}">
    </button>
  `).join("");
}

function selecionarCorAvatar(color) {
  selectedAvatarColor = color;
  renderAvatarColorPicker();
}

function abrirModalNovoUsuario() {
  document.getElementById("editUserId").value = "";
  document.getElementById("editUserName").value = "";
  document.getElementById("editUserEmail").value = "";
  document.getElementById("editUserRole").value = "user";
  document.getElementById("chkUserAtivo").checked = true;

  document.getElementById("chkDivSobMedida").checked = true;
  document.getElementById("chkDivIncorporadora").checked = false;
  document.getElementById("chkDivInternacional").checked = false;

  document.getElementById("chkStagePrevia").checked = true;
  document.getElementById("chkStageGalga").checked = true;
  document.getElementById("chkStageDesenho").checked = true;

  selectedAvatarColor = "#f97316";
  renderAvatarColorPicker();

  document.getElementById("lblModalUserTitulo").textContent = "Adicionar Novo Usuário à Equipe";
  document.getElementById("btnSalvarUsuario").textContent = "Criar Usuário";
  document.getElementById("modalUserForm").style.display = "flex";
}

function abrirModalEditarUsuario(id) {
  const user = Auth.getUserById(id);
  if (!user) return;

  document.getElementById("editUserId").value = user.id;
  document.getElementById("editUserName").value = user.name;
  document.getElementById("editUserEmail").value = user.email;
  document.getElementById("editUserRole").value = user.role || "user";
  document.getElementById("chkUserAtivo").checked = user.active !== false;

  const divs = user.allowed_divisions || [];
  document.getElementById("chkDivSobMedida").checked = divs.includes("sob_medida");
  document.getElementById("chkDivIncorporadora").checked = divs.includes("incorporadora");
  document.getElementById("chkDivInternacional").checked = divs.includes("internacional");

  const stages = user.allowed_stages || [];
  document.getElementById("chkStagePrevia").checked = stages.includes("previa");
  document.getElementById("chkStageGalga").checked = stages.includes("galga");
  document.getElementById("chkStageDesenho").checked = stages.includes("desenho_tecnico");

  selectedAvatarColor = user.avatar_color || "#0284c7";
  renderAvatarColorPicker();

  document.getElementById("lblModalUserTitulo").textContent = `Editar Permissões: ${user.name}`;
  document.getElementById("btnSalvarUsuario").textContent = "Salvar Permissões";
  document.getElementById("modalUserForm").style.display = "flex";
}

function fecharModalUserForm() {
  document.getElementById("modalUserForm").style.display = "none";
}

function aoMudarRoleUsuario(role) {
  if (role === "admin") {
    // Admin tem acesso a todas as divisões e etapas
    document.getElementById("chkDivSobMedida").checked = true;
    document.getElementById("chkDivIncorporadora").checked = true;
    document.getElementById("chkDivInternacional").checked = true;
    document.getElementById("chkStagePrevia").checked = true;
    document.getElementById("chkStageGalga").checked = true;
    document.getElementById("chkStageDesenho").checked = true;
  }
}

async function salvarUsuario(event) {
  event.preventDefault();

  const id = document.getElementById("editUserId").value;
  const name = document.getElementById("editUserName").value.trim();
  const email = document.getElementById("editUserEmail").value.trim().toLowerCase();
  const role = document.getElementById("editUserRole").value;
  const active = document.getElementById("chkUserAtivo").checked;

  const allowed_divisions = [];
  if (document.getElementById("chkDivSobMedida").checked) allowed_divisions.push("sob_medida");
  if (document.getElementById("chkDivIncorporadora").checked) allowed_divisions.push("incorporadora");
  if (document.getElementById("chkDivInternacional").checked) allowed_divisions.push("internacional");

  const allowed_stages = [];
  if (document.getElementById("chkStagePrevia").checked) allowed_stages.push("previa");
  if (document.getElementById("chkStageGalga").checked) allowed_stages.push("galga");
  if (document.getElementById("chkStageDesenho").checked) allowed_stages.push("desenho_tecnico");

  if (allowed_divisions.length === 0) {
    await PapaSysDialog.alert({
      title: "Selecione ao menos 1 Divisão",
      message: "O colaborador precisa ter acesso liberado a pelo menos uma divisão do sistema.",
      type: "warning"
    });
    return;
  }

  if (allowed_stages.length === 0) {
    await PapaSysDialog.alert({
      title: "Selecione ao menos 1 Etapa",
      message: "O colaborador precisa ter acesso liberado a pelo menos uma página de fluxo (Prévia, Galga ou Desenho Técnico).",
      type: "warning"
    });
    return;
  }

  const userData = {
    id: id || undefined,
    name,
    email,
    role,
    allowed_divisions,
    allowed_stages,
    avatar_color: selectedAvatarColor,
    active
  };

  Auth.saveUser(userData);
  fecharModalUserForm();
  carregarTabelaUsuarios();
  showToast(`Usuário "${name}" salvo com sucesso!`, "success");
}

async function excluirUsuario(userId) {
  const user = Auth.getUserById(userId);
  if (!user) return;

  const ok = await PapaSysDialog.confirm({
    title: "Excluir Usuário",
    message: `Tem certeza que deseja remover o usuário "${user.name}" (${user.email}) do sistema?`,
    confirmText: "Sim, Excluir",
    cancelText: "Cancelar",
    type: "danger"
  });

  if (!ok) return;

  const deleted = Auth.deleteUser(userId);
  if (deleted) {
    carregarTabelaUsuarios();
    showToast(`Usuário "${user.name}" removido com sucesso.`, "info");
  }
}

function alternarSessaoPara(userId) {
  const user = Auth.getUserById(userId);
  if (!user) return;

  Auth.setCurrentUser(user);
  showToast(`Sessão alterada para ${user.name}. Redirecionando para o painel...`, "info");
  setTimeout(() => {
    window.location.href = "index.html";
  }, 700);
}

async function restaurarUsuariosPadrao() {
  const ok = await PapaSysDialog.confirm({
    title: "Restaurar Contas Padrão",
    message: "Deseja restaurar as contas de demonstração (Administrador e Victor Lourenço) para as permissões originais?",
    confirmText: "Sim, Restaurar",
    cancelText: "Cancelar",
    type: "warning"
  });

  if (!ok) return;

  Auth.resetDefaultUsers();
  carregarTabelaUsuarios();
  showToast("Usuários padrão restaurados com sucesso!", "success");
}

function showToast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
