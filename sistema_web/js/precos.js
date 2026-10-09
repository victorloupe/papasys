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
  // 1. Guarda de autenticação da página (Seção 12.2)
  const user = await Auth.requireAuth();
  if (!user) return;

  // Verifica se o usuário ativo é administrador
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
// SEÇÃO A: PREÇOS & REGRAS DE CÁLCULO (SEÇÃO 9)
// ==============================================================================

function carregarConfiguracoesNaTela() {
  const settings = PricingEngine.getSettings();

  // 1. Tabela de Preço do m² por Divisão e Tipo de Piscina (Convencional / Especial) - Seção 9.1 & 9.5
  const elSmConv = document.getElementById("preco_m2_sob_medida_convencional");
  const elSmEsp = document.getElementById("preco_m2_sob_medida_especial");
  const elIncConv = document.getElementById("preco_m2_incorporadora_convencional");
  const elIncEsp = document.getElementById("preco_m2_incorporadora_especial");
  const elIntConv = document.getElementById("preco_m2_internacional_convencional");
  const elIntEsp = document.getElementById("preco_m2_internacional_especial");

  if (elSmConv) elSmConv.value = (settings.m2_prices?.sob_medida?.convencional ?? 140.00).toFixed(2);
  if (elSmEsp) elSmEsp.value = (settings.m2_prices?.sob_medida?.especial ?? 175.00).toFixed(2);
  if (elIncConv) elIncConv.value = (settings.m2_prices?.incorporadora?.convencional ?? 120.00).toFixed(2);
  if (elIncEsp) elIncEsp.value = (settings.m2_prices?.incorporadora?.especial ?? 150.00).toFixed(2);
  if (elIntConv) elIntConv.value = (settings.m2_prices?.internacional?.convencional ?? 150.00).toFixed(2);
  if (elIntEsp) elIntEsp.value = (settings.m2_prices?.internacional?.especial ?? 185.00).toFixed(2);

  // 2. Regra de Molde da Incorporadora (Seção 9.2 & 9.5)
  const elMoldeConv = document.getElementById("regra_preco_molde_convencional");
  const elMoldeEsp = document.getElementById("regra_preco_molde_especial");
  const elMinMolde = document.getElementById("regra_min_molde");

  const incConvPadrao = settings.m2_prices?.incorporadora?.convencional ?? 120.00;
  const incEspPadrao = settings.m2_prices?.incorporadora?.especial ?? 150.00;

  const precoMoldeConv = settings.molde?.preco_m2_convencional !== undefined 
    ? settings.molde.preco_m2_convencional 
    : (incConvPadrao - (settings.molde?.desconto_m2 || 20.00));

  const precoMoldeEsp = settings.molde?.preco_m2_especial !== undefined 
    ? settings.molde.preco_m2_especial 
    : (incEspPadrao - (settings.molde?.desconto_m2 || 20.00));

  if (elMoldeConv) elMoldeConv.value = parseFloat(precoMoldeConv).toFixed(2);
  if (elMoldeEsp) elMoldeEsp.value = parseFloat(precoMoldeEsp).toFixed(2);
  if (elMinMolde) elMinMolde.value = settings.molde?.min_unidades ?? 10;

  // 3. Regras de Acréscimo e Etapas (Seção 9.3 & 9.5)
  const elAuto = document.getElementById("regra_pct_autoportante");
  const elPrevia = document.getElementById("regra_pct_previa");
  const elGalga = document.getElementById("regra_pct_galga");
  const elDesenho = document.getElementById("regra_pct_desenho");

  if (elAuto) elAuto.value = settings.acrescimos?.autoportante_pct ?? 50.0;
  if (elPrevia) elPrevia.value = settings.acrescimos?.etapas?.previa ?? 5.0;
  if (elGalga) elGalga.value = settings.acrescimos?.etapas?.galga ?? 0.0;
  if (elDesenho) elDesenho.value = settings.acrescimos?.etapas?.desenho_tecnico ?? 0.0;
}

// Salva todos os preços e regras configuradas (Somente Admin - Seção 9.5)
function salvarConfiguracoesPreco() {
  const current = PricingEngine.getSettings();

  const incConv = parseFloat(document.getElementById("preco_m2_incorporadora_convencional")?.value) || 120.00;
  const incEsp = parseFloat(document.getElementById("preco_m2_incorporadora_especial")?.value) || 150.00;

  const precoMoldeConv = parseFloat(document.getElementById("regra_preco_molde_convencional")?.value) || (incConv - 20.00);
  const precoMoldeEsp = parseFloat(document.getElementById("regra_preco_molde_especial")?.value) || (incEsp - 20.00);

  const updated = {
    m2_prices: {
      sob_medida: {
        convencional: parseFloat(document.getElementById("preco_m2_sob_medida_convencional")?.value) || 140.00,
        especial: parseFloat(document.getElementById("preco_m2_sob_medida_especial")?.value) || 175.00
      },
      incorporadora: {
        convencional: incConv,
        especial: incEsp
      },
      internacional: {
        convencional: parseFloat(document.getElementById("preco_m2_internacional_convencional")?.value) || 150.00,
        especial: parseFloat(document.getElementById("preco_m2_internacional_especial")?.value) || 185.00
      }
    },
    molde: {
      preco_m2_convencional: precoMoldeConv,
      preco_m2_especial: precoMoldeEsp,
      desconto_m2: Math.max(0, parseFloat((incConv - precoMoldeConv).toFixed(2))),
      min_unidades: parseInt(document.getElementById("regra_min_molde")?.value) || 10
    },
    acrescimos: {
      autoportante_pct: parseFloat(document.getElementById("regra_pct_autoportante")?.value) || 50.0,
      etapas: {
        previa: parseFloat(document.getElementById("regra_pct_previa")?.value) || 5.0,
        galga: parseFloat(document.getElementById("regra_pct_galga")?.value) || 0.0,
        desenho_tecnico: parseFloat(document.getElementById("regra_pct_desenho")?.value) || 0.0
      }
    },
    revestimentos: current.revestimentos || PricingEngine.DEFAULT_SETTINGS.revestimentos
  };

  const ok = PricingEngine.saveSettings(updated);
  if (ok) {
    showToast("Configurações de Preços, Molde e Acréscimos salvas com sucesso!", "success");
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
    message: "Deseja restaurar as tabelas de preços do m², regras de molde e percentuais de acréscimo para a configuração padrão original?",
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

async function carregarTabelaUsuarios() {
  const tbody = document.getElementById("tbodyUsuarios");
  const lblTotal = document.getElementById("lblTotalUsuarios");
  if (!tbody) return;

  const users = await Auth.fetchUsers();
  const current = Auth.getCurrentUser() || {};

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
      <tr style="${u.active === false ? 'opacity: 0.65;' : ''}">
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
          <div class="users-actions-cell" style="justify-content: flex-end; gap: 4px; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalEditarUsuario('${u.id}')" title="Editar permissões">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Editar
            </button>

            <!-- Botão Enviar Redefinição de Senha (Seção 12.4) -->
            <button type="button" class="btn btn-secondary btn-sm" onclick="enviarRedefinicaoSenha('${u.email}')" title="Enviar e-mail para redefinir senha">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Senha
            </button>

            ${!isCurrent ? `
              <!-- Botão Desativar / Reativar Usuário (Seção 12.4) -->
              <button type="button" class="btn btn-secondary btn-sm" onclick="alternarAtivoUsuario('${u.id}', ${u.active === false})" title="${u.active !== false ? 'Desativar acesso' : 'Reativar acesso'}">
                ${u.active !== false ? 'Desativar' : 'Reativar'}
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

  const grpPass = document.getElementById("grpEditUserPassword");
  if (grpPass) grpPass.style.display = "block";
  const inputPass = document.getElementById("editUserPassword");
  if (inputPass) {
    inputPass.value = "";
    inputPass.required = true;
  }

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

  const grpPass = document.getElementById("grpEditUserPassword");
  if (grpPass) grpPass.style.display = "none";
  const inputPass = document.getElementById("editUserPassword");
  if (inputPass) {
    inputPass.value = "";
    inputPass.required = false;
  }

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
  const pass = document.getElementById("editUserPassword") ? document.getElementById("editUserPassword").value : "";

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

  const btnSubmit = document.getElementById("btnSalvarUsuario");
  btnSubmit.disabled = true;
  btnSubmit.style.opacity = "0.7";

  try {
    if (!id) {
      // Criação de Usuário (Seção 12.4: Supabase Edge Function ou Vercel API)
      if (!pass || pass.length < 8) {
        await PapaSysDialog.alert({
          title: "Senha Curta",
          message: "Para cadastrar um novo usuário, informe uma senha inicial com no mínimo 8 caracteres.",
          type: "warning"
        });
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = "1";
        return;
      }

      const res = await Auth.adminCreateUser(userData, pass);
      if (!res.success) {
        await PapaSysDialog.alert({
          title: "Erro ao Cadastrar Usuário",
          message: res.message || "Não foi possível criar o usuário no Supabase Auth.",
          type: "danger"
        });
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = "1";
        return;
      }
    } else {
      // Edição de Usuário Existente
      await Auth.saveUser(userData);
    }

    fecharModalUserForm();
    carregarTabelaUsuarios();
    showToast(`Usuário "${name}" salvo com sucesso!`, "success");
  } catch (err) {
    console.error("[precos.js] Erro ao salvar usuário:", err);
    showToast("Erro ao processar usuário.", "error");
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.style.opacity = "1";
  }
}

// Seção 12.4: Desativar e Reativar Usuário
async function alternarAtivoUsuario(userId, novoStatus) {
  const user = Auth.getUserById(userId);
  if (!user) return;
  const acao = novoStatus ? "reativar" : "desativar";
  const ok = await PapaSysDialog.confirm({
    title: `${novoStatus ? 'Reativar' : 'Desativar'} Usuário`,
    message: `Deseja realmente ${acao} o usuário "${user.name}" (${user.email})?`,
    confirmText: `Sim, ${novoStatus ? 'Reativar' : 'Desativar'}`,
    cancelText: "Cancelar",
    type: novoStatus ? "info" : "warning"
  });

  if (!ok) return;

  await Auth.toggleUserActive(userId, novoStatus);
  carregarTabelaUsuarios();
  showToast(`Usuário "${user.name}" foi ${novoStatus ? 'reativado' : 'desativado'}.`, "info");
}

// Seção 12.4: Enviar redefinição de senha para o usuário
async function enviarRedefinicaoSenha(email) {
  const ok = await PapaSysDialog.confirm({
    title: "Enviar Redefinição de Senha",
    message: `Deseja enviar um link de redefinição de senha para ${email}?`,
    confirmText: "Enviar E-mail",
    cancelText: "Cancelar",
    type: "info"
  });

  if (!ok) return;

  const res = await Auth.sendPasswordResetToUser(email);
  if (res.success) {
    showToast(`E-mail de redefinição enviado para ${email}!`, "success");
  } else {
    PapaSysDialog.alert({
      title: "Falha no Envio",
      message: res.message || "Não foi possível enviar o e-mail.",
      type: "warning"
    });
  }
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

// Atualiza a tabela sempre que houver sincronização remota com Supabase
window.addEventListener("igui-users-synced", () => carregarTabelaUsuarios());
