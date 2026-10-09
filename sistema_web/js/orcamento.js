// ==============================================================================
// CONTROLADOR DO EDITOR DE ORÇAMENTO DETALHADO iGUi
// Divisões: iGUi Sob Medida | iGUi Incorporadora | iGUi Internacional
// Fluxo por Etapas: Prévia (+5%) -> Galga (0% pré-venda) -> Desenho Técnico (0% venda)
// ==============================================================================

let currentBudget = null;
let currentBudgetPools = [];
let hasUnsavedManualEdits = false;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Guarda de autenticação da página (Seção 12.2)
  const user = await Auth.requireAuth();
  if (!user) return;

  const urlParams = new URLSearchParams(window.location.search);
  const budgetId = urlParams.get("id");

  await carregarOrcamento(budgetId);

  // 2. Verificação de permissão da divisão (Seção 12.5)
  if (currentBudget && !Auth.canAccessDivision(currentBudget.division)) {
    if (typeof PapaSysDialog !== "undefined") {
      await PapaSysDialog.alert({
        title: "Acesso Restrito",
        message: `Você não tem permissão para acessar orçamentos da divisão "${currentBudget.division}".`,
        type: "warning"
      });
    }
    window.location.href = "index.html";
    return;
  }

  // Inicializa componentes do usuário no header
  if (typeof Auth !== "undefined" && Auth.updateUserUI) {
    Auth.updateUserUI();
  }
});

// Carrega o orçamento do banco
async function carregarOrcamento(budgetId) {
  const poolsContainer = document.getElementById("poolsContainer");
  if (poolsContainer && typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.renderSkeletonLoading(poolsContainer, "Carregando engenharia 3D e precificação do orçamento...");
  }

  if (budgetId) {
    currentBudget = await DB.getBudgetById(budgetId);
  }

  // Se não encontrou ou não tem ID, pega o primeiro orçamento disponível
  if (!currentBudget) {
    const all = await DB.getBudgets();
    currentBudget = all[0] || null;
  }

  if (!currentBudget) {
    if (typeof PapaSysDialog !== "undefined") {
      await PapaSysDialog.alert({
        title: "Orçamento Não Encontrado",
        message: "Nenhum orçamento foi localizado com o identificador fornecido.",
        type: "warning"
      });
    }
    window.location.href = "index.html";
    return;
  }

  // Clona os modelos de piscinas associados
  currentBudgetPools = JSON.parse(JSON.stringify(currentBudget.pools || []));

  // FALLBACK SEGURO: Se não houver piscina gravada, sintetiza a piscina com base nos totais do orçamento
  if (currentBudgetPools.length === 0) {
    const areaRev = parseFloat(currentBudget.total_area_revestimento) || 28.0;
    const areaLam = parseFloat(currentBudget.total_area_laminacao) || 38.99;
    const volM3 = parseFloat(currentBudget.total_volume_m3) || 21.0;
    
    currentBudgetPools = [{
      id: `pool-${currentBudget.id}-1`,
      budget_id: currentBudget.id,
      model_name: currentBudget.project_name || "Piscina Sob Medida iGUi",
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
  } else {
    // Garante dimensões técnicas em cada piscina existente
    currentBudgetPools.forEach(p => {
      if (!p.comprimento_m) p.comprimento_m = 6.00;
      if (!p.largura_m) p.largura_m = 3.00;
      if (!p.profundidade_m) p.profundidade_m = 1.40;
    });
  }

  renderizarOrcamento();
}

// Renderiza todos os dados do orçamento na tela
function renderizarOrcamento() {
  const b = currentBudget;
  const isIncorporadora = b.division === "incorporadora";
  const isSobMedida = b.division === "sob_medida";

  // Header
  document.getElementById("txtHeaderTitulo").textContent = `${b.budget_code} • ${b.project_name || 'Orçamento'}`;
  const inputCodHeader = document.getElementById("inputCodigoOrcamento");
  const inputCodForm = document.getElementById("inputBudgetCode");
  const badgeCodigo = document.getElementById("badgeCodigo");
  if (inputCodHeader) inputCodHeader.value = b.budget_code || "";
  if (inputCodForm) inputCodForm.value = b.budget_code || "";
  if (badgeCodigo) badgeCodigo.textContent = b.budget_code || "";
  
  const badgeDiv = document.getElementById("badgeDivisao");
  const nomesDiv = { sob_medida: "iGUi Sob Medida", incorporadora: "iGUi Incorporadora", internacional: "iGUi Internacional" };
  badgeDiv.textContent = nomesDiv[b.division] || b.division;

  // Informações do Orçamento
  document.getElementById("inputProjNome").value = b.project_name || "";
  document.getElementById("inputCliNome").value = b.client_name || "";
  document.getElementById("selectDivisao").value = b.division || "sob_medida";
  document.getElementById("txtNotas").value = b.notes || "";

  // Responsável
  carregarSelectUsuarios(b.assigned_user_id);

  // Etapa Atual
  atualizarBotoesEtapa(b.stage);

  // Modelos de Piscinas
  renderizarModelosPiscina();

  // Se for etapa Desenho Técnico, mostra a seção de engenharia executiva
  const secDesenho = document.getElementById("secaoDesenhoTecnico");
  if (secDesenho) {
    secDesenho.style.display = b.stage === "desenho_tecnico" ? "block" : "none";
  }

  // Botão Adicionar Modelo (escondido para Sob Medida onde 1 orçamento = 1 piscina)
  const btnAddPool = document.getElementById("btnAddPoolModel");
  if (btnAddPool) {
    btnAddPool.style.display = isSobMedida ? "none" : "inline-flex";
  }

  // Recalcula totais
  recalcularTotais();

  // Micro-animações de entrada suave
  if (typeof PapaSysAnimation !== "undefined") {
    PapaSysAnimation.animateEntranceElements(document.querySelector(".main-content"));
  }
}

// Manipulador de edição manual do código/número do orçamento
function aoMudarCodigoOrcamento(novoCodigo) {
  const cod = (novoCodigo || "").trim();
  if (!cod) {
    showToast("O número do orçamento não pode ser vazio.", "error");
    const inputCodHeader = document.getElementById("inputCodigoOrcamento");
    const inputCodForm = document.getElementById("inputBudgetCode");
    if (inputCodHeader) inputCodHeader.value = currentBudget.budget_code || "";
    if (inputCodForm) inputCodForm.value = currentBudget.budget_code || "";
    return;
  }

  currentBudget.budget_code = cod;
  const inputCodHeader = document.getElementById("inputCodigoOrcamento");
  const inputCodForm = document.getElementById("inputBudgetCode");
  const badgeCodigo = document.getElementById("badgeCodigo");
  if (inputCodHeader) inputCodHeader.value = cod;
  if (inputCodForm) inputCodForm.value = cod;
  if (badgeCodigo) badgeCodigo.textContent = cod;

  document.getElementById("txtHeaderTitulo").textContent = `${cod} • ${currentBudget.project_name || "Orçamento"}`;
  registrarEdicaoManual();
  showToast(`Número do orçamento alterado para ${cod}. Clique em 'Salvar Alterações' para gravar.`, "info");
}

// Carrega dropdown de responsáveis
function carregarSelectUsuarios(assignedId) {
  const sel = document.getElementById("selectResponsavel");
  if (!sel) return;
  const users = Auth.getAllUsers();

  sel.innerHTML = users.map(u => `
    <option value="${u.id}" ${u.id === assignedId ? "selected" : ""}>
      ${u.name} (${u.role === 'admin' ? 'Admin' : 'Projetista'})
    </option>
  `).join("");
}

// Atualiza botões da etapa (Prévia -> Galga -> Desenho Técnico)
function atualizarBotoesEtapa(stage) {
  document.querySelectorAll(".stage-step-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-stage") === stage);
  });

  const banner = document.getElementById("bannerDesenhoTecnico");
  if (banner) {
    banner.style.display = stage === "desenho_tecnico" ? "block" : "none";
  }
}

// Solicita mudança de etapa no fluxo com validações técnicas
async function solicitarMudancaEtapa(novaEtapa) {
  if (novaEtapa === currentBudget.stage) return;

  // REGRA TÉCNICA DA GALGA:
  // "para o orçamento virar galga ele precisa ter a galga em si ,entao ao tentar mudar , coloque um aviso , se tem a galga e abare para editar as medidas da piscina , pois a piscina na previa tem uma medida e a galga é a confirmação com a fabrica se faz essas medidas com as aquelas pastilha , entao pode mudar um pouco as medidas , ai precisa confirmar essas medidas"
  if (novaEtapa === "galga") {
    abrirModalConfirmarGalga();
    return;
  }

  if (novaEtapa === "desenho_tecnico") {
    const ok = await PapaSysDialog.confirm({
      title: "Avançar para Desenho Técnico",
      message: "Deseja avançar este orçamento para a etapa de Desenho Técnico (Venda)? Nesta etapa a documentação executiva e memorial descritivo serão finalizados.",
      confirmText: "Avançar para Desenho Técnico",
      cancelText: "Cancelar",
      type: "info"
    });
    if (!ok) return;
    await mudarEtapa("desenho_tecnico");
    return;
  }

  if (novaEtapa === "previa") {
    const ok = await PapaSysDialog.confirm({
      title: "Retornar para Prévia",
      message: "Deseja retornar o orçamento para a etapa de Prévia? A margem de +5% será reaplicada sobre os valores base.",
      confirmText: "Retornar para Prévia",
      cancelText: "Cancelar",
      type: "warning"
    });
    if (!ok) return;
    await mudarEtapa("previa");
    return;
  }

  await mudarEtapa(novaEtapa);
}

// Muda efetivamente a etapa do orçamento
async function mudarEtapa(novaEtapa) {
  currentBudget.stage = novaEtapa;
  atualizarBotoesEtapa(novaEtapa);

  const secDesenho = document.getElementById("secaoDesenhoTecnico");
  if (secDesenho) {
    secDesenho.style.display = novaEtapa === "desenho_tecnico" ? "block" : "none";
  }

  recalcularTotais();
  showToast(`Etapa alterada para ${novaEtapa.replace('_', ' ').toUpperCase()}!`, "info");
}

// ==============================================================================
// MODAL DE CONFIRMAÇÃO DE GALGA TÉCNICA COM A FÁBRICA
// ==============================================================================
function abrirModalConfirmarGalga() {
  const modal = document.getElementById("modalConfirmarGalga");
  const container = document.getElementById("galgaPoolsFormContainer");
  const chk = document.getElementById("chkConfirmacaoGalgaFabrica");
  const btn = document.getElementById("btnConfirmarAvancoGalga");

  if (!modal || !container) return;

  if (chk) chk.checked = false;
  if (btn) btn.disabled = true;

  // Renderiza as medidas técnicas de cada modelo de piscina
  container.innerHTML = currentBudgetPools.map((p, idx) => {
    const comp = parseFloat(p.comprimento_m) || 6.00;
    const larg = parseFloat(p.largura_m) || 3.00;
    const prof = parseFloat(p.profundidade_m) || 1.40;
    const rev = parseFloat(p.internal_area_m2) || 28.00;
    const lam = parseFloat(p.lamination_area_m2) || 38.99;
    const vol = parseFloat(p.internal_volume_m3) || 21.00;

    return `
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">
          <strong style="color: #0f172a; font-size: 13.5px;">Modelo #${idx + 1}: ${p.model_name}</strong>
          <span style="font-size: 12px; color: #0284c7; font-weight: 600;">Revestimento: ${p.coating_type.replace('_', ' ')}</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 10px;">
          <div class="form-group">
            <label class="form-label" style="font-size: 12px;">Comprimento Final (m):</label>
            <input type="number" step="0.01" class="form-control" id="galgaComp_${idx}" value="${comp.toFixed(2)}" onchange="aoAjustarMedidaGalga(${idx})">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 12px;">Largura Final (m):</label>
            <input type="number" step="0.01" class="form-control" id="galgaLarg_${idx}" value="${larg.toFixed(2)}" onchange="aoAjustarMedidaGalga(${idx})">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 12px;">Profundidade Final (m):</label>
            <input type="number" step="0.01" class="form-control" id="galgaProf_${idx}" value="${prof.toFixed(2)}" onchange="aoAjustarMedidaGalga(${idx})">
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; padding: 8px; border-radius: 6px;">
          <div class="form-group">
            <label class="form-label" style="font-size: 11px; color: #64748b;">Área Revestimento (m²):</label>
            <input type="number" step="0.01" class="form-control" id="galgaRev_${idx}" value="${rev.toFixed(2)}">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 11px; color: #64748b;">Área Laminação (m²):</label>
            <input type="number" step="0.01" class="form-control" id="galgaLam_${idx}" value="${lam.toFixed(2)}">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size: 11px; color: #64748b;">Volume Interno (m³):</label>
            <input type="number" step="0.01" class="form-control" id="galgaVol_${idx}" value="${vol.toFixed(2)}">
          </div>
        </div>
      </div>
    `;
  }).join("");

  modal.style.display = "flex";
}

function aoAlternarCheckboxGalga(isChecked) {
  const btn = document.getElementById("btnConfirmarAvancoGalga");
  if (btn) btn.disabled = !isChecked;
}

function fecharModalConfirmarGalga() {
  const modal = document.getElementById("modalConfirmarGalga");
  if (modal) modal.style.display = "none";
}

// Ao alterar comprimento, largura ou profundidade no modal de galga, recalcula as áreas sugeridas
function aoAjustarMedidaGalga(idx) {
  const comp = parseFloat(document.getElementById(`galgaComp_${idx}`)?.value) || 0;
  const larg = parseFloat(document.getElementById(`galgaLarg_${idx}`)?.value) || 0;
  const prof = parseFloat(document.getElementById(`galgaProf_${idx}`)?.value) || 0;

  if (comp > 0 && larg > 0 && prof > 0) {
    const areaFundo = comp * larg;
    const areaParedes = 2 * (comp + larg) * prof;
    const areaRevest = areaFundo + areaParedes;
    const areaLamina = parseFloat((areaRevest * 1.15).toFixed(2)); // casco exterior + bordas
    const volM3 = parseFloat((comp * larg * prof).toFixed(2));

    const elRev = document.getElementById(`galgaRev_${idx}`);
    const elLam = document.getElementById(`galgaLam_${idx}`);
    const elVol = document.getElementById(`galgaVol_${idx}`);

    if (elRev) elRev.value = areaRevest.toFixed(2);
    if (elLam) elLam.value = areaLamina.toFixed(2);
    if (elVol) elVol.value = volM3.toFixed(2);
  }
}

// Executa a confirmação da galga técnica e avança a etapa
async function executarConfirmacaoGalga() {
  // Salva as medidas conferidas em cada piscina
  currentBudgetPools.forEach((p, idx) => {
    const comp = parseFloat(document.getElementById(`galgaComp_${idx}`)?.value);
    const larg = parseFloat(document.getElementById(`galgaLarg_${idx}`)?.value);
    const prof = parseFloat(document.getElementById(`galgaProf_${idx}`)?.value);
    const rev = parseFloat(document.getElementById(`galgaRev_${idx}`)?.value);
    const lam = parseFloat(document.getElementById(`galgaLam_${idx}`)?.value);
    const vol = parseFloat(document.getElementById(`galgaVol_${idx}`)?.value);

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

  fecharModalConfirmarGalga();

  // Avança para Galga (0% de margem)
  currentBudget.stage = "galga";
  atualizarBotoesEtapa("galga");

  renderizarModelosPiscina();
  recalcularTotais();

  // Notificação de Sucesso
  showToast("Galga confirmada com sucesso! Margem de 0% aplicada e medidas técnicas validadas.", "success");

  // Salva automaticamente o orçamento atualizado
  await salvarOrcamento();
}

// ==============================================================================
// RENDERIZAÇÃO DOS MODELOS DE PISCINAS DO ORÇAMENTO
// ==============================================================================
function renderizarModelosPiscina() {
  const container = document.getElementById("poolsContainer");
  if (!container) return;

  const isAdmin = typeof Auth !== "undefined" && Auth.isAdmin();
  const isSobMedida = currentBudget.division === "sob_medida";
  const isIncorporadora = currentBudget.division === "incorporadora";

  if (currentBudgetPools.length === 0) {
    container.innerHTML = `
      <div class="empty-state-mini">
        <p>Nenhuma piscina cadastrada neste orçamento.</p>
        <button class="btn btn-sm btn-primary" onclick="adicionarNovoModelo()">+ Adicionar Piscina</button>
      </div>
    `;
    return;
  }

  container.innerHTML = currentBudgetPools.map((p, idx) => {
    const calc = PricingEngine.calcularModeloPiscina(p, currentBudget.stage, currentBudget.division, currentBudgetPools);
    const acab = calc.finishes_details;
    const comp = parseFloat(p.comprimento_m) || 6.00;
    const larg = parseFloat(p.largura_m) || 3.00;
    const prof = parseFloat(p.profundidade_m) || 1.40;

    const isCollapsed = p._collapsed === true;
    const coatingNome = calc.coating_name || calc.coating_info?.nome || (p.coating_type ? p.coating_type.replace(/_/g, ' ') : 'Pastilha 15x15');
    const areaRevStr = (parseFloat(p.internal_area_m2) || parseFloat(calc.area_revestimento) || 0).toFixed(2);
    const areaLamStr = (parseFloat(p.lamination_area_m2) || parseFloat(calc.area_laminacao) || 0).toFixed(2);
    const volM3Str = (parseFloat(p.internal_volume_m3) || parseFloat(calc.volume_m3) || 0).toFixed(2);

    return `
      <div class="pool-model-card ${isCollapsed ? 'card-collapsed' : ''}" id="poolCard_${idx}">
        <div class="pool-card-header" onclick="togglePoolCard(${idx})">
          <div class="pool-title-group" style="display: flex; align-items: center; gap: 8px;">
            <button type="button" class="btn-toggle-pool" onclick="event.stopPropagation(); togglePoolCard(${idx});" title="${isCollapsed ? 'Expandir piscina' : 'Recolher piscina'}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" class="chevron-icon ${isCollapsed ? 'chevron-collapsed' : ''}">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            <span class="pool-index-badge">#${idx + 1}</span>
            <div style="position: relative; display: flex; align-items: center; min-width: 280px; max-width: 480px; flex: 1;">
              <input type="text" class="input-pool-title" value="${p.model_name}" onclick="event.stopPropagation()" onchange="atualizarCampoPiscina(${idx}, 'model_name', this.value)" title="Clique para editar o nome deste modelo (ex: Piscina Principal, Infantil, etc.)" style="padding-right: 24px; width: 100%;">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#94a3b8" stroke-width="2" style="position: absolute; right: 8px; pointer-events: none;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </div>
            <span class="badge badge-coating-highlight" style="font-size: 11px; padding: 3px 8px; border-radius: 6px; background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-weight: 700; white-space: nowrap;">
              🎨 ${coatingNome}
            </span>
            <span class="badge-dimensoes" style="background: #f1f5f9; color: #475569; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; border: 1px solid #e2e8f0; white-space: nowrap;">
              ${comp.toFixed(2)}m × ${larg.toFixed(2)}m × ${prof.toFixed(2)}m
            </span>
            <span class="badge-units-summary" style="background: #f1f5f9; color: #334155; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; white-space: nowrap;">
              ${p.units_count} ${p.units_count === 1 ? 'un' : 'unidades'}
            </span>
          </div>

          <div class="pool-header-actions" onclick="event.stopPropagation()">
            <button type="button" class="btn-sm btn-secondary" onclick="duplicarModelo(${idx})" title="Duplicar este modelo de piscina com 1 clique" style="font-size: 11px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Duplicar
            </button>
            ${(isIncorporadora || p.units_count > 1) ? `
              <button class="btn-sm btn-split-pool" onclick="abrirModalDividirUnidades(${idx})" title="Dividir unidades">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
                Dividir Unidades
              </button>
            ` : ''}

            ${!isSobMedida && currentBudgetPools.length > 1 ? `
              <button class="btn-sm btn-remove-pool" onclick="removerModelo(${idx})" title="Remover este modelo">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px; margin-right: 3px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Excluir
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Barra de Resumo quando Recolhido -->
        <div class="pool-card-summary-bar" style="display: ${isCollapsed ? 'flex' : 'none'};" onclick="togglePoolCard(${idx})">
          <div class="summary-pill"><strong>Revestimento:</strong> ${coatingNome}</div>
          <div class="summary-pill"><strong>Estrutura:</strong> ${p.structure_type === 'autoportante' ? 'Autoportante (+50%)' : 'Padrão'}</div>
          <div class="summary-pill"><strong>Área Revest.:</strong> ${areaRevStr} m²</div>
          <div class="summary-pill"><strong>Laminação:</strong> ${areaLamStr} m²</div>
          <div class="summary-pill"><strong>Volume:</strong> ${volM3Str} m³</div>
          <div class="summary-pill summary-price"><strong>Subtotal:</strong> ${PricingEngine.formatBRL(calc.preco_total_modelo)}</div>
          <span class="summary-hint">Clique para abrir detalhes ↓</span>
        </div>

        <div class="pool-card-grid" style="display: ${isCollapsed ? 'none' : 'grid'};">
          
          <!-- Coluna 1: Configuração Técnica -->
          <div class="pool-col-config">
            <h4 class="col-section-title">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              Configuração Técnica
            </h4>

            <div class="form-row-2">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Qtd Unidades:</label>
                <input type="number" class="form-control form-control-sm" value="${p.units_count}" min="1" onchange="atualizarCampoPiscina(${idx}, 'units_count', this.value)">
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Tipo de Piscina:</label>
                <select class="form-control form-control-sm" onchange="atualizarCampoPiscina(${idx}, 'pool_type', this.value)">
                  <option value="convencional" ${p.pool_type === 'convencional' ? 'selected' : ''}>Convencional</option>
                  <option value="especial" ${p.pool_type === 'especial' ? 'selected' : ''}>Especial</option>
                </select>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Estrutura:</label>
                <select class="form-control form-control-sm" onchange="atualizarCampoPiscina(${idx}, 'structure_type', this.value)">
                  <option value="nao_autoportante" ${p.structure_type === 'nao_autoportante' ? 'selected' : ''}>Não autoportante</option>
                  <option value="autoportante" ${p.structure_type === 'autoportante' ? 'selected' : ''}>Autoportante (+50%)</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Revestimento:</label>
                <select class="form-control form-control-sm" onchange="atualizarCampoPiscina(${idx}, 'coating_type', this.value)">
                  ${PricingEngine.getCoatingsList().map(c => `
                    <option value="${c.id}" ${normalizarChaveCoating(p.coating_type) === normalizarChaveCoating(c.id) ? 'selected' : ''}>${c.nome}</option>
                  `).join("")}
                </select>
              </div>
            </div>

            <!-- Medidas Técnicas da Piscina (Comprimento, Largura, Profundidade) -->
            <div class="pool-dim-box">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <span class="form-label" style="font-weight: 700; color: #334155; margin-bottom: 0;">Dimensões da Piscina:</span>
                <span style="font-size: 10px; color: #64748b;">(metros)</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
                <div>
                  <label class="form-label" style="font-size: 10px; margin-bottom: 1px;">Comp:</label>
                  <input type="number" step="0.01" class="form-control form-control-sm" value="${comp.toFixed(2)}" onchange="atualizarDimensaoPiscina(${idx}, 'comprimento_m', this.value)">
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px; margin-bottom: 1px;">Larg:</label>
                  <input type="number" step="0.01" class="form-control form-control-sm" value="${larg.toFixed(2)}" onchange="atualizarDimensaoPiscina(${idx}, 'largura_m', this.value)">
                </div>
                <div>
                  <label class="form-label" style="font-size: 10px; margin-bottom: 1px;">Prof:</label>
                  <input type="number" step="0.01" class="form-control form-control-sm" value="${prof.toFixed(2)}" onchange="atualizarDimensaoPiscina(${idx}, 'profundidade_m', this.value)">
                </div>
              </div>
              <button type="button" class="btn btn-xs btn-secondary" onclick="recalcularAreasPorDimensoes(${idx})" style="width: 100%; margin-top: 4px; font-size: 10.5px; padding: 2px 6px;" title="Atualizar áreas de revestimento, laminação e volume a partir das dimensões acima">
                Recalcular Áreas por Dimensões
              </button>
            </div>

            <!-- Toggle de Molde (Incorporadora) -->
            ${isIncorporadora ? `
              <div class="mold-toggle-row">
                <label class="switch-toggle" style="transform: scale(0.85); margin-left: -2px;">
                  <input type="checkbox" ${calc.has_mold ? 'checked' : ''} onchange="alternarMoldeManual(${idx}, this.checked)">
                  <span class="slider"></span>
                </label>
                <div>
                  <strong style="font-size: 11px;">Preço com Molde:</strong>
                  <span class="mold-sub" style="font-size: 10px;">${calc.has_mold ? 'Ativado (benefício de molde)' : 'Sem Molde'}</span>
                </div>
              </div>
            ` : ''}

          </div>

          <!-- Coluna 2: Quantitativos Geométricos -->
          <div class="pool-col-quants">
            <h4 class="col-section-title">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              Quantitativos 3D
            </h4>

            <div class="quants-table-grid">
              <div class="quant-input-box">
                <span class="q-label">Área Revestimento (Interna):</span>
                <div class="q-input-wrap">
                  <input type="number" step="0.01" value="${(p.internal_area_m2 || 0).toFixed(2)}" onchange="atualizarCampoPiscina(${idx}, 'internal_area_m2', this.value)">
                  <span>m²</span>
                </div>
              </div>

              <div class="quant-input-box">
                <span class="q-label">Área Laminação (Externa):</span>
                <div class="q-input-wrap">
                  <input type="number" step="0.01" value="${(p.lamination_area_m2 || 0).toFixed(2)}" onchange="atualizarCampoPiscina(${idx}, 'lamination_area_m2', this.value)">
                  <span>m²</span>
                </div>
              </div>

              <div class="quant-input-box">
                <span class="q-label">Volume Interno da Piscina:</span>
                <div class="q-input-wrap">
                  <input type="number" step="0.01" value="${(p.internal_volume_m3 || 0).toFixed(2)}" onchange="atualizarCampoPiscina(${idx}, 'internal_volume_m3', this.value)">
                  <span>m³</span>
                </div>
                <div class="q-sub">${Number((p.internal_volume_m3 || 0) * 1000).toLocaleString('pt-BR')} L</div>
              </div>

              <div class="quant-input-box">
                <span class="q-label">Cantos Lineares &amp; Quinas:</span>
                <div class="q-input-wrap">
                  <input type="number" step="0.01" value="${(p.linear_corners_m || 0).toFixed(2)}" onchange="atualizarCampoPiscina(${idx}, 'linear_corners_m', this.value)">
                  <span>m</span>
                </div>
                <div class="q-sub">${p.alive_corners_count || 4} quinas vivas</div>
              </div>
            </div>

            <!-- Peças de Acabamento Calculadas & Editáveis (Seção 14.2) -->
            <div class="finishes-review-box">
              <div>
                <div class="finishes-review-title">
                  <span>Peças de Acabamento Calculadas:</span>
                  <span class="badge-fin-tag">${acab.tipo_regra.toUpperCase()}</span>
                </div>
                
                ${acab.is_custom ? `
                  <div class="custom-coating-alert">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 3px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <strong>${acab.observacao}</strong>
                    <div>Cantos Lineares: ${acab.peca_linear.qtd}m &bull; Quinas Vivas: ${acab.peca_quina.qtd} un.</div>
                  </div>
                ` : `
                    <div class="finishes-review-list">
                      <div class="fin-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span>${acab.peca_linear.nome}</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                          <input type="number" step="0.5" class="form-control" style="width: 75px; text-align: right; padding: 2px 6px; font-weight: 700; height: 26px; font-size: 11.5px; ${(p.manual_finishes && p.manual_finishes.linear_qtd != null) ? 'border-color: #f59e0b; background: #fffbeb;' : ''}" value="${(p.manual_finishes && p.manual_finishes.linear_qtd != null) ? p.manual_finishes.linear_qtd : acab.peca_linear.qtd}" onchange="aoEditarAcabamentoManual(${idx}, 'linear_qtd', this.value)">
                          <span style="font-size: 10.5px; color: #64748b;">${acab.peca_linear.unit}</span>
                        </div>
                      </div>
                      <div class="fin-item" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span>${acab.peca_quina.nome}</span>
                        <div style="display: flex; align-items: center; gap: 4px;">
                          <input type="number" step="1" class="form-control" style="width: 75px; text-align: right; padding: 2px 6px; font-weight: 700; height: 26px; font-size: 11.5px; ${(p.manual_finishes && p.manual_finishes.quina_qtd != null) ? 'border-color: #f59e0b; background: #fffbeb;' : ''}" value="${(p.manual_finishes && p.manual_finishes.quina_qtd != null) ? p.manual_finishes.quina_qtd : acab.peca_quina.qtd}" onchange="aoEditarAcabamentoManual(${idx}, 'quina_qtd', this.value)">
                          <span style="font-size: 10.5px; color: #64748b;">${acab.peca_quina.unit}</span>
                        </div>
                      </div>
                    </div>
                  `}
                </div>

                ${(p.manual_finishes && (p.manual_finishes.linear_qtd != null || p.manual_finishes.quina_qtd != null)) ? `
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #fde68a;">
                    <span style="font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px; border: 1px solid #fde68a;">
                      ● editado manualmente
                    </span>
                    <button type="button" class="btn btn-xs btn-outline" style="font-size: 10px; padding: 2px 6px;" onclick="restaurarCalculoPluginAcabamentos(${idx})" title="Restaurar quantidades originais calculadas pelo plugin">
                      Restaurar cálculo do plugin
                    </button>
                  </div>
                ` : ''}

                <div style="font-size: 10px; color: #94a3b8; padding-top: 4px; border-top: 1px dashed #e2e8f0; margin-top: auto;">
                  Acabamentos inclusos no m² (Seção 9.1 & 14.2)
                </div>
              </div>

            </div>

            <!-- Coluna 3: Composição de Preço (Ordem Exata da Seção 9.4) -->
            <div class="pool-col-pricing">
              <h4 class="col-section-title">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                Cálculo do Orçamento (Seção 9.4)
              </h4>

              <div class="pricing-step-list">
                <div class="pricing-steps-top">
                  <!-- 1. Área de revestimento × preço do m² (Editável conforme solicitação do usuário) -->
                  <div class="pricing-step-item" style="align-items: flex-start;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                      <div class="step-label" style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                        <span>1. Preço Base (${calc.area_revestimento} m² &times;</span>
                        <span class="m2-price-tag-interactive" onclick="abrirAjustePrecoM2(${idx})" style="cursor: pointer; background: ${p.manual_m2_price != null ? '#e0f2fe' : '#f8fafc'}; color: ${p.manual_m2_price != null ? '#0369a1' : '#0f172a'}; border: 1px ${p.manual_m2_price != null ? 'solid #7dd3fc' : 'dashed #cbd5e1'}; border-radius: 4px; padding: 1px 6px; font-weight: 800; font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;" title="Clique para alterar o preço do m² desta piscina">
                          ${PricingEngine.formatBRL(calc.preco_m2_base || calc.preco_m2)}/m²
                          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </span>
                        <span>):</span>
                      </div>
                      ${p.manual_m2_price != null ? `
                        <div style="font-size: 10px; color: #0284c7; display: flex; align-items: center; gap: 4px; margin-top: 1px;">
                          <span>● Preço do m² editado</span>
                          <button type="button" class="btn btn-xs btn-outline" style="font-size: 9px; padding: 0 4px; height: 18px;" onclick="restaurarPrecoM2Padrao(${idx})" title="Voltar ao preço padrão da tabela">Restaurar padrão</button>
                        </div>
                      ` : ''}
                    </div>
                    <span class="step-val tabular-nums">${PricingEngine.formatBRL(calc.valor_base_revest)}</span>
                  </div>
                  <div class="step-sub-details">
                    Divisão: ${currentBudget.division === 'incorporadora' ? 'Incorporadora' : currentBudget.division === 'internacional' ? 'Internacional' : 'Sob Medida'} &bull; Tipo: ${calc.pool_type === 'especial' ? 'Especial' : 'Convencional'}
                  </div>

                  <!-- 2. − Desconto de Molde (Incorporadora) -->
                  ${calc.has_mold ? `
                    <div class="pricing-step-item" style="color: #16a34a;">
                      <span class="step-label">2. − Desconto Molde (-${PricingEngine.formatBRL(calc.desconto_molde_m2)}/m²):</span>
                      <span class="step-val tabular-nums">− ${PricingEngine.formatBRL(calc.valor_desconto_molde_unit)}</span>
                    </div>
                    <div class="step-sub-details" style="color: #16a34a;">
                      Subtotal com Molde: ${PricingEngine.formatBRL(calc.valor_apos_molde)}
                    </div>
                  ` : (currentBudget.division === 'incorporadora' ? `
                    <div class="pricing-step-item" style="color: #64748b;">
                      <span class="step-label">2. Desconto de Molde:</span>
                      <span class="step-val tabular-nums">Sem molde (R$ 0,00)</span>
                    </div>
                  ` : '')}

                  <!-- 3. + Acréscimo Autoportante -->
                  ${p.structure_type === 'autoportante' ? `
                    <div class="pricing-step-item auto">
                      <span class="step-label">3. + Autoportante (+${calc.pct_autoportante}%):</span>
                      <span class="step-val tabular-nums">+ ${PricingEngine.formatBRL(calc.valor_acrescimo_auto_unit)}</span>
                    </div>
                    <div class="step-sub-details">
                      Subtotal com Autoportante: ${PricingEngine.formatBRL(calc.valor_com_autoportante)}
                    </div>
                  ` : `
                    <div class="pricing-step-item">
                      <span class="step-label">3. Estrutura Padrão:</span>
                      <span class="step-val tabular-nums">Sem acréscimo</span>
                    </div>
                  `}

                  <!-- 4. + Acréscimo da Etapa -->
                  <div class="pricing-step-item">
                    <span class="step-label">4. + Acréscimo Etapa (${currentBudget.stage === 'previa' ? '+5%' : '0%'}):</span>
                    <span class="step-val tabular-nums">+ ${PricingEngine.formatBRL(calc.valor_acrescimo_etapa_unit)}</span>
                  </div>

                  <div class="pricing-step-divider"></div>

                  <!-- Valor Unitário da Piscina -->
                  <div class="pricing-step-item final">
                    <span class="step-label">Valor Unitário da Piscina:</span>
                    <span class="step-val final tabular-nums">${PricingEngine.formatBRL(calc.preco_final_unitario)}</span>
                  </div>
                </div>

                <div>
                  <!-- 5. × Quantidade de Unidades & Valor Ajustável (Seção 14.3) -->
                  <div class="pricing-model-total">
                    <div class="model-total-label">
                      5. Subtotal do Modelo (${p.units_count} ${p.units_count === 1 ? 'un' : 'unidades'}):
                      ${(p.manual_model_value != null) ? `
                        <span style="font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px; border: 1px solid #fde68a; margin-left: 4px;">
                          ● editado manualmente
                        </span>
                      ` : ''}
                    </div>

                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
                      ${(p.manual_model_value != null) ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 11.5px; color: #94a3b8; text-decoration: line-through;" title="Valor calculado pelo sistema">Calc: ${PricingEngine.formatBRL(calc.preco_total_modelo)}</span>
                          <span class="model-total-val tabular-nums" style="color: #0284c7;">${PricingEngine.formatBRL(parseFloat(p.manual_model_value))}</span>
                        </div>
                        <div style="font-size: 10px; color: #64748b;">
                          Ajustado por <strong>${p.price_edited_by || 'Colaborador'}</strong> ${p.price_edited_at ? `(${p.price_edited_at})` : ''}
                        </div>
                        <div style="display: flex; gap: 6px; margin-top: 2px;">
                          <button type="button" class="btn btn-xs btn-secondary" onclick="abrirAjusteValorModelo(${idx})" style="font-size: 10px; padding: 2px 6px;">
                            Alterar
                          </button>
                          <button type="button" class="btn btn-xs btn-outline" onclick="restaurarValorCalculadoModelo(${idx})" style="font-size: 10px; padding: 2px 6px;" title="Voltar ao valor original calculado">
                            Restaurar valor calculado
                          </button>
                        </div>
                      ` : `
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <div class="model-total-val tabular-nums">${PricingEngine.formatBRL(calc.preco_total_modelo)}</div>
                          <button type="button" class="btn btn-xs btn-secondary" onclick="abrirAjusteValorModelo(${idx})" style="font-size: 10px; padding: 2px 6px;" title="Ajustar valor deste modelo manualmente">
                            Ajustar Valor
                          </button>
                        </div>
                      `}
                    </div>
                  </div>

                  <div class="pricing-step-item" style="padding-top: 3px; margin-top: 3px; border-top: 1px dashed #e2e8f0;">
                    <span class="step-label" style="color: #64748b;">Status do Modelo:</span>
                    <span class="step-val" style="color: #16a34a; font-weight: 700;">Conferido</span>
                  </div>
                </div>
              </div>

            </div>

        </div>
      </div>
    `;
  }).join("");
}

// ==============================================================================
// CONTROLE DE ACCORDION (ABRE E FECHA DAS PISCINAS)
// ==============================================================================
function togglePoolCard(idx) {
  if (!currentBudgetPools[idx]) return;
  currentBudgetPools[idx]._collapsed = !currentBudgetPools[idx]._collapsed;
  renderizarModelosPiscina();
}

function expandirTodosModelos() {
  currentBudgetPools.forEach(p => p._collapsed = false);
  renderizarModelosPiscina();
  showToast("Todos os modelos de piscinas foram expandidos.", "info");
}

function recolherTodosModelos() {
  currentBudgetPools.forEach(p => p._collapsed = true);
  renderizarModelosPiscina();
  showToast("Todos os modelos de piscinas foram recolhidos.", "info");
}

// ==============================================================================
// MODAL DIVIDIR UNIDADES (INCORPORADORA / MULTI-UNIDADES)
// ==============================================================================
function abrirModalDividirUnidades(poolIndex) {
  const p = currentBudgetPools[poolIndex];
  if (!p) return;

  const currentUnits = parseInt(p.units_count) || 1;
  if (currentUnits <= 1) {
    if (typeof PapaSysDialog !== "undefined") {
      PapaSysDialog.alert({
        title: "Divisão de Unidades",
        message: "Para desmembrar unidades, este modelo precisa ter pelo menos 2 unidades cadastradas.",
        type: "warning"
      });
    } else {
      alert("Para desmembrar unidades, este modelo precisa ter pelo menos 2 unidades cadastradas.");
    }
    return;
  }

  const modal = document.getElementById("modalDividirUnidades");
  const container = document.getElementById("conteudoDividirUnidades");
  if (!modal || !container) return;

  const maxMove = currentUnits - 1;

  container.innerHTML = `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <strong style="color: #0f172a; font-size: 14px;">${p.model_name}</strong>
        <span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 700;">
          Total Atual: ${currentUnits} unidades
        </span>
      </div>
      <p style="font-size: 12px; color: #64748b; margin: 0;">
        Dimensões: ${parseFloat(p.comprimento_m || 6).toFixed(2)}m × ${parseFloat(p.largura_m || 3).toFixed(2)}m • Revestimento: ${p.coating_type.replace('_', ' ')}
      </p>
    </div>

    <div class="form-group" style="margin-bottom: 14px;">
      <label class="form-label" style="font-weight: 700; color: #1e293b;">Quantas unidades deseja desmembrar deste orçamento?</label>
      <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
        <input type="number" id="inputQtdDividir" class="form-control" style="width: 90px; font-size: 16px; font-weight: 800; text-align: center;" value="1" min="1" max="${maxMove}" oninput="aoMudarQtdDivisao(${currentUnits}, this.value)">
        <span style="font-size: 12.5px; color: #475569;" id="txtHintDivisao">
          Permanecerão <strong>${currentUnits - 1} un</strong> neste orçamento e <strong>1 un</strong> irá para o novo orçamento.
        </span>
      </div>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #1e40af; line-height: 1.45; margin-bottom: 16px;">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      Um novo orçamento filho será criado automaticamente com as unidades desmembradas, preservando as medidas técnicas, especificações de pastilhas e estrutura.
    </div>

    <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="fecharModalDividirUnidades()">Cancelar</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="executarDividirUnidades(${poolIndex})">
        Confirmar e Desmembrar
      </button>
    </div>
  `;

  modal.style.display = "flex";
}

function aoMudarQtdDivisao(total, val) {
  const v = Math.min(Math.max(1, parseInt(val) || 1), total - 1);
  const hint = document.getElementById("txtHintDivisao");
  if (hint) {
    hint.innerHTML = `Permanecerão <strong>${total - v} un</strong> neste orçamento e <strong>${v} un</strong> irá para o novo orçamento.`;
  }
}

function fecharModalDividirUnidades() {
  const modal = document.getElementById("modalDividirUnidades");
  if (modal) modal.style.display = "none";
}

async function executarDividirUnidades(poolIndex) {
  const p = currentBudgetPools[poolIndex];
  if (!p) return;

  const input = document.getElementById("inputQtdDividir");
  const unitsToMove = parseInt(input ? input.value : 1) || 1;

  fecharModalDividirUnidades();
  showToast("Desmembrando unidades e gerando novo orçamento...", "info");

  // Garante identificador persistente do pool
  const poolId = p.id || `pool-${currentBudget.id}-${poolIndex + 1}`;
  p.id = poolId;

  // Garante que o orçamento atual esteja gravado
  await DB.saveBudget(currentBudget, currentBudgetPools);

  const res = await DB.splitBudgetUnits(currentBudget.id, poolId, unitsToMove);
  if (res && res.destinationBudget) {
    currentBudget = res.sourceBudget;
    currentBudgetPools = currentBudget.pools || [];
    renderizarOrcamento();
    recalcularTotais();
    
    showToast(`Sucesso! ${unitsToMove} un desmembradas para o novo orçamento ${res.destinationBudget.budget_code}.`, "success");
    
    if (typeof PapaSysDialog !== "undefined") {
      const ok = await PapaSysDialog.confirm({
        title: "Unidades Desmembradas com Sucesso!",
        message: `As ${unitsToMove} unidades foram desmembradas para o novo orçamento ${res.destinationBudget.budget_code} (${res.destinationBudget.project_name}).\n\nDeseja abrir o novo orçamento agora?`,
        confirmText: "Abrir Novo Orçamento",
        cancelText: "Permanecer Neste Orçamento",
        type: "success"
      });
      if (ok) {
        window.location.href = `orcamento.html?id=${res.destinationBudget.id}`;
      }
    }
  } else {
    p.units_count = Math.max(1, p.units_count - unitsToMove);
    renderizarModelosPiscina();
    recalcularTotais();
    registrarEdicaoManual();
    showToast(`${unitsToMove} unidades reduzidas deste modelo.`, "success");
  }
}

// Atualiza campo geral de uma piscina e notifica alterações manuais
function atualizarCampoPiscina(index, campo, valor) {
  if (!currentBudgetPools[index]) return;

  if (campo === "units_count") {
    currentBudgetPools[index][campo] = Math.max(1, parseInt(valor) || 1);
  } else if (campo === "internal_area_m2" || campo === "lamination_area_m2" || campo === "internal_volume_m3" || campo === "linear_corners_m") {
    currentBudgetPools[index][campo] = Math.max(0, parseFloat(valor) || 0);
    if (campo === "internal_volume_m3") {
      currentBudgetPools[index].internal_volume_liters = currentBudgetPools[index][campo] * 1000;
    }
  } else {
    currentBudgetPools[index][campo] = valor;
  }

  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
}

// Atualiza dimensão da piscina (comprimento, largura, profundidade)
function atualizarDimensaoPiscina(index, campo, valor) {
  if (!currentBudgetPools[index]) return;
  const num = Math.max(0.1, parseFloat(valor) || 0);
  currentBudgetPools[index][campo] = num;

  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
}

// Recalcula áreas e volume a partir das dimensões informadas
function recalcularAreasPorDimensoes(index) {
  const p = currentBudgetPools[index];
  if (!p) return;

  const comp = parseFloat(p.comprimento_m) || 6.00;
  const larg = parseFloat(p.largura_m) || 3.00;
  const prof = parseFloat(p.profundidade_m) || 1.40;

  const areaFundo = comp * larg;
  const areaParedes = 2 * (comp + larg) * prof;
  const areaRevest = areaFundo + areaParedes;
  const areaLamina = parseFloat((areaRevest * 1.15).toFixed(2));
  const volM3 = parseFloat((comp * larg * prof).toFixed(2));
  const cantosM = parseFloat((2 * (comp + larg) + 4 * prof).toFixed(2));

  p.internal_area_m2 = parseFloat(areaRevest.toFixed(2));
  p.lamination_area_m2 = areaLamina;
  p.internal_volume_m3 = volM3;
  p.internal_volume_liters = volM3 * 1000;
  p.linear_corners_m = cantosM;

  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();

  showToast(`Áreas recalculadas: Revestimento ${p.internal_area_m2}m² | Laminação ${p.lamination_area_m2}m²`, "info");
}

// Ativa o banner de aviso de edição manual
function registrarEdicaoManual() {
  hasUnsavedManualEdits = true;
  const alerta = document.getElementById("alertaEdicaoManual");
  if (alerta) {
    alerta.style.display = "flex";
  }
}

function alternarMoldeManual(index, isChecked) {
  if (!currentBudgetPools[index]) return;
  currentBudgetPools[index].has_mold = isChecked;
  currentBudgetPools[index].mold_auto = false; // marca como manual
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
}

function adicionarNovoModelo() {
  currentBudgetPools.push({
    model_name: `Modelo ${String.fromCharCode(65 + currentBudgetPools.length)} iGUi Prime`,
    units_count: 1,
    pool_type: "convencional",
    structure_type: "nao_autoportante",
    coating_type: "pastilha_15x15",
    has_mold: false,
    comprimento_m: 6.00,
    largura_m: 3.00,
    profundidade_m: 1.40,
    internal_area_m2: 24.0,
    lamination_area_m2: 30.0,
    internal_volume_m3: 16.0,
    internal_volume_liters: 16000,
    linear_corners_m: 20.0,
    alive_corners_count: 4
  });
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
}

async function removerModelo(index) {
  const ok = await PapaSysDialog.confirm({
    title: "Remover Modelo",
    message: "Deseja realmente remover este modelo de piscina do orçamento?",
    confirmText: "Sim, Remover",
    cancelText: "Cancelar",
    type: "danger"
  });
  if (!ok) return;

  currentBudgetPools.splice(index, 1);
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
}

// Duplicar modelo de piscina com 1 clique (Melhoria de Produtividade)
function duplicarModelo(index) {
  const p = currentBudgetPools[index];
  if (!p) return;
  const clone = JSON.parse(JSON.stringify(p));
  clone.id = typeof DB !== "undefined" ? DB.generateUUID() : `pool-${Date.now()}`;
  clone.model_name = `${p.model_name} (Cópia)`;
  currentBudgetPools.push(clone);
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
  showToast(`Modelo '${p.model_name}' duplicado com sucesso!`, "success");
}

// ==============================================================================
// PREÇO DO M² EDITÁVEL NO ORÇAMENTO (SOLICITAÇÃO DO USUÁRIO)
// Permite alterar o preço base do m² (ex: R$ 1.600,00) por piscina
// ==============================================================================
function aoAlterarPrecoM2Manual(idx, valor) {
  if (!currentBudgetPools[idx]) return;
  const limpo = String(valor).replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(limpo);
  if (!isNaN(num) && num > 0) {
    currentBudgetPools[idx].manual_m2_price = num;
  } else {
    delete currentBudgetPools[idx].manual_m2_price;
  }
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
}

function restaurarPrecoM2Padrao(idx) {
  if (!currentBudgetPools[idx]) return;
  delete currentBudgetPools[idx].manual_m2_price;
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
  showToast("Preço do m² restaurado para o padrão oficial da tabela.", "info");
}

async function abrirAjustePrecoM2(idx) {
  const p = currentBudgetPools[idx];
  if (!p) return;
  const calc = PricingEngine.calcularModeloPiscina(p, currentBudget.stage, currentBudget.division, currentBudgetPools);
  const atual = p.manual_m2_price != null ? p.manual_m2_price : calc.preco_m2_padrao;

  const valorDigitado = await PapaSysDialog.prompt({
    title: `Preço do m² - ${p.model_name}`,
    message: `Preço padrão da tabela: ${PricingEngine.formatBRL(calc.preco_m2_padrao)}/m²\nInforme o novo preço do m² de revestimento para esta piscina (R$/m²):`,
    defaultValue: String(atual),
    placeholder: "Ex: 1600.00",
    confirmText: "Salvar Preço m²",
    cancelText: "Cancelar"
  });

  if (valorDigitado !== null && valorDigitado.trim() !== "") {
    aoAlterarPrecoM2Manual(idx, valorDigitado);
    showToast(`Preço do m² do modelo ${p.model_name} atualizado!`, "success");
  }
}

// ==============================================================================
// 14.2 CANTONEIRAS E ACABAMENTOS EDITÁVEIS NO ORÇAMENTO
// ==============================================================================
function aoEditarAcabamentoManual(idx, campo, valor) {
  if (!currentBudgetPools[idx]) return;
  if (!currentBudgetPools[idx].manual_finishes) {
    currentBudgetPools[idx].manual_finishes = {};
  }
  const num = Math.max(0, parseFloat(valor) || 0);
  currentBudgetPools[idx].manual_finishes[campo] = num;
  registrarEdicaoManual();
  renderizarModelosPiscina();
}

function restaurarCalculoPluginAcabamentos(idx) {
  const p = currentBudgetPools[idx];
  if (!p) return;
  if (p.manual_finishes) {
    delete p.manual_finishes;
  }
  registrarEdicaoManual();
  renderizarModelosPiscina();
  showToast("Quantidades originais de acabamento restauradas conforme cálculo do plugin.", "info");
}

// ==============================================================================
// 14.3 VALOR EDITÁVEL NO ORÇAMENTO (POR MODELO E TOTAL)
// ==============================================================================
async function abrirAjusteValorModelo(idx) {
  const p = currentBudgetPools[idx];
  if (!p) return;
  const calc = PricingEngine.calcularModeloPiscina(p, currentBudget.stage, currentBudget.division, currentBudgetPools);
  const atual = p.manual_model_value != null ? p.manual_model_value : calc.preco_total_modelo;

  const valorDigitado = await PapaSysDialog.prompt({
    title: `Ajustar Valor - ${p.model_name}`,
    message: `Valor calculado pelo sistema: ${PricingEngine.formatBRL(calc.preco_total_modelo)}\nInforme o novo valor ajustado para este modelo (R$):`,
    defaultValue: String(atual),
    placeholder: "Ex: 25000.00",
    confirmText: "Salvar Ajuste",
    cancelText: "Cancelar"
  });

  if (valorDigitado !== null && valorDigitado.trim() !== "") {
    const limpo = valorDigitado.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const novoValor = parseFloat(limpo);
    if (!isNaN(novoValor) && novoValor >= 0) {
      const user = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
      p.manual_model_value = novoValor;
      p.price_edited_by = user?.name || user?.email || "Colaborador";
      p.price_edited_at = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      registrarEdicaoManual();
      renderizarModelosPiscina();
      recalcularTotais();
      showToast(`Valor do modelo ${p.model_name} ajustado para ${PricingEngine.formatBRL(novoValor)}.`, "success");
    } else {
      showToast("Valor inválido informado.", "error");
    }
  }
}

function restaurarValorCalculadoModelo(idx) {
  const p = currentBudgetPools[idx];
  if (!p) return;
  delete p.manual_model_value;
  delete p.price_edited_by;
  delete p.price_edited_at;
  registrarEdicaoManual();
  renderizarModelosPiscina();
  recalcularTotais();
  showToast(`Valor calculado do modelo ${p.model_name} restaurado com sucesso.`, "info");
}

async function abrirModalAjustarTotalOrcamento() {
  const calc = PricingEngine.calcularOrcamentoCompleto(currentBudget, currentBudgetPools);
  const atual = currentBudget.manual_total_value != null ? currentBudget.manual_total_value : calc.total_price;

  const valorDigitado = await PapaSysDialog.prompt({
    title: "Ajustar Valor Total do Orçamento",
    message: `Valor total calculado pelo sistema: ${PricingEngine.formatBRL(calc.total_price)}\nInforme o valor total comercial ajustado para este orçamento (R$):`,
    defaultValue: String(atual),
    placeholder: "Ex: 125000.00",
    confirmText: "Salvar Total Ajustado",
    cancelText: "Cancelar"
  });

  if (valorDigitado !== null && valorDigitado.trim() !== "") {
    const limpo = valorDigitado.replace("R$", "").replace(/\./g, "").replace(",", ".").trim();
    const novoTotal = parseFloat(limpo);
    if (!isNaN(novoTotal) && novoTotal >= 0) {
      const user = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
      currentBudget.manual_total_value = novoTotal;
      currentBudget.total_price_edited_by = user?.name || user?.email || "Colaborador";
      currentBudget.total_price_edited_at = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      registrarEdicaoManual();
      recalcularTotais();
      showToast(`Valor total do orçamento ajustado para ${PricingEngine.formatBRL(novoTotal)}.`, "success");
    } else {
      showToast("Valor inválido informado.", "error");
    }
  }
}

function restaurarValorCalculadoTotal() {
  delete currentBudget.manual_total_value;
  delete currentBudget.total_price_edited_by;
  delete currentBudget.total_price_edited_at;
  registrarEdicaoManual();
  recalcularTotais();
  showToast("Valor total original recalculado pelo sistema.", "info");
}

// Recalcula totais consolidados do orçamento (Seção 14.3)
function recalcularTotais() {
  const calc = PricingEngine.calcularOrcamentoCompleto(currentBudget, currentBudgetPools);

  // Calcula total considerando modelos com valor manual se houver
  let totalComModelosAjustados = 0;
  let algumModeloAjustado = false;
  currentBudgetPools.forEach((p, idx) => {
    if (p.manual_model_value != null) {
      totalComModelosAjustados += parseFloat(p.manual_model_value);
      algumModeloAjustado = true;
    } else {
      const pCalc = calc.pools && calc.pools[idx] ? calc.pools[idx].calc : PricingEngine.calcularModeloPiscina(p, currentBudget.stage, currentBudget.division, currentBudgetPools);
      totalComModelosAjustados += pCalc.preco_total_modelo;
    }
  });

  // Valor final efetivo
  let valorFinalEfetivo = calc.total_price;
  if (currentBudget.manual_total_value != null) {
    valorFinalEfetivo = parseFloat(currentBudget.manual_total_value);
  } else if (algumModeloAjustado) {
    valorFinalEfetivo = totalComModelosAjustados;
  }
  currentBudget.total_price = valorFinalEfetivo;

  const tileValor = document.getElementById("statTileValor");
  if (tileValor) {
    tileValor.style.display = "flex";
  }

  const elValor = document.getElementById("statTotalValor");
  if (elValor) elValor.textContent = PricingEngine.formatBRL(valorFinalEfetivo);

  const elComp = document.getElementById("statTotalValorComparacao");
  if (elComp) {
    if (currentBudget.manual_total_value != null) {
      elComp.style.display = "block";
      elComp.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; margin-top: 2px;">
          <span style="color: #94a3b8; text-decoration: line-through;" title="Valor calculado pelo sistema">Calc: ${PricingEngine.formatBRL(calc.total_price)}</span>
          <span style="font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 1px 5px; border-radius: 4px; border: 1px solid #fde68a;">● total ajustado</span>
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
          Por <strong>${currentBudget.total_price_edited_by || 'Colaborador'}</strong> ${currentBudget.total_price_edited_at ? `(${currentBudget.total_price_edited_at})` : ''}
          <button type="button" class="btn btn-xs btn-outline" onclick="restaurarValorCalculadoTotal()" style="font-size: 9px; padding: 1px 4px; margin-left: 4px;" title="Restaurar valor original calculado">Restaurar</button>
        </div>
      `;
    } else if (algumModeloAjustado) {
      elComp.style.display = "block";
      elComp.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; margin-top: 2px;">
          <span style="color: #94a3b8; text-decoration: line-through;" title="Valor calculado original dos modelos">Original: ${PricingEngine.formatBRL(calc.total_price)}</span>
          <span style="font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 1px 5px; border-radius: 4px; border: 1px solid #fde68a;">● soma com modelos editados</span>
        </div>
      `;
    } else {
      elComp.style.display = "none";
      elComp.innerHTML = "";
    }
  }

  document.getElementById("statTotalRevest").textContent = `${calc.total_area_revestimento} m²`;
  document.getElementById("statTotalLamina").textContent = `${calc.total_area_laminacao} m²`;
  document.getElementById("statTotalVolume").textContent = `${calc.total_volume_m3} m³ (${Number(calc.total_volume_liters).toLocaleString('pt-BR')} L)`;

  const totalUnidades = currentBudgetPools.reduce((acc, p) => acc + (parseInt(p.units_count) || 1), 0);
  document.getElementById("statTotalUnidades").textContent = `${totalUnidades} ${totalUnidades === 1 ? 'unidade' : 'unidades'}`;

  // Atualiza Controle Interativo de Ativar / Desativar Revisão (Sugestão 4)
  const chkRev = document.getElementById("chkAtivarRevisao");
  const boxRev = document.getElementById("boxInputRevisao");
  const inpRev = document.getElementById("inputNomeRevisao");
  const previewRev = document.getElementById("badgeRevisaoPreview");
  const temRevisao = !!(currentBudget.budget_revision && currentBudget.budget_revision.trim());

  if (chkRev) chkRev.checked = temRevisao;
  if (boxRev) boxRev.style.display = temRevisao ? "inline-flex" : "none";
  if (inpRev && document.activeElement !== inpRev) inpRev.value = currentBudget.budget_revision || "";
  if (previewRev) previewRev.textContent = currentBudget.budget_revision || "REV";

  // Atualiza controles de Ajuste Comercial Dinâmico (Sugestão 2)
  const selTipo = document.getElementById("selTipoAjusteComercial");
  const boxVal = document.getElementById("boxValorAjusteComercial");
  const inpVal = document.getElementById("inpValorAjusteComercial");
  const lblUnid = document.getElementById("lblUnidadeAjusteComercial");
  const inpMotivo = document.getElementById("inpMotivoAjusteComercial");
  const tagResumo = document.getElementById("tagResumoAjusteComercial");

  const adj = currentBudget.commercial_adjustment;
  if (selTipo) {
    if (adj && parseFloat(adj.value) > 0) {
      if (document.activeElement !== selTipo) selTipo.value = adj.type || "discount_pct";
      if (boxVal) boxVal.style.display = "flex";
      if (inpVal && document.activeElement !== inpVal) inpVal.value = adj.value;
      if (lblUnid) lblUnid.textContent = (adj.type && adj.type.includes("pct")) ? "%" : "R$";
      if (inpMotivo && document.activeElement !== inpMotivo) inpMotivo.value = adj.description || "";
      if (tagResumo) {
        tagResumo.style.display = "inline-block";
        const isDesc = adj.type && adj.type.startsWith("discount");
        tagResumo.style.background = isDesc ? "#ecfdf5" : "#eff6ff";
        tagResumo.style.color = isDesc ? "#059669" : "#1d4ed8";
        tagResumo.style.border = `1px solid ${isDesc ? '#a7f3d0' : '#bfdbfe'}`;
        const sinal = isDesc ? "-" : "+";
        const valAbs = Math.abs(calc.commercial_adjustment_val || 0);
        tagResumo.textContent = `${sinal} ${PricingEngine.formatBRL(valAbs)} (${isDesc ? 'Desconto' : 'Acréscimo'})`;
      }
    } else {
      if (document.activeElement !== selTipo) selTipo.value = "none";
      if (boxVal) boxVal.style.display = "none";
      if (tagResumo) tagResumo.style.display = "none";
    }
  }
}

// Salva o orçamento no banco de dados
async function salvarOrcamento() {
  const inputCodHeader = document.getElementById("inputCodigoOrcamento");
  const inputCodForm = document.getElementById("inputBudgetCode");
  const novoCodigo = (inputCodHeader?.value || inputCodForm?.value || currentBudget.budget_code || "").trim();
  if (novoCodigo) {
    currentBudget.budget_code = novoCodigo;
  }

  currentBudget.project_name = document.getElementById("inputProjNome").value.trim();
  currentBudget.client_name = document.getElementById("inputCliNome").value.trim();
  currentBudget.division = document.getElementById("selectDivisao").value;
  currentBudget.notes = document.getElementById("txtNotas").value;
  
  const selUser = document.getElementById("selectResponsavel");
  if (selUser && selUser.selectedOptions[0]) {
    currentBudget.assigned_user_id = selUser.value;
    currentBudget.assigned_user_name = selUser.selectedOptions[0].text.split("(")[0].trim();
  }

  showToast("Gravando alterações no banco de dados...", "info");
  const saved = await DB.saveBudget(currentBudget, currentBudgetPools);

  if (saved) {
    currentBudget = saved;
    currentBudgetPools = saved.pools;
    hasUnsavedManualEdits = false;
    
    const alerta = document.getElementById("alertaEdicaoManual");
    if (alerta) alerta.style.display = "none";

    renderizarOrcamento();
    showToast("Orçamento salvo com sucesso!", "success");
  }
}

function abrirPropostaExecutiva() {
  window.location.href = `proposta.html?id=${currentBudget.id}`;
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

// ==============================================================================
// SUGESTÃO 2: CONTROLE DE AJUSTE COMERCIAL (DESCONTO / ACRÉSCIMO EM % OU R$)
// ==============================================================================
function aoMudarAjusteComercial() {
  const selTipo = document.getElementById("selTipoAjusteComercial");
  const boxVal = document.getElementById("boxValorAjusteComercial");
  const inpVal = document.getElementById("inpValorAjusteComercial");
  const lblUnid = document.getElementById("lblUnidadeAjusteComercial");
  const inpMotivo = document.getElementById("inpMotivoAjusteComercial");

  if (!selTipo) return;
  const tipo = selTipo.value;

  if (tipo === "none") {
    currentBudget.commercial_adjustment = null;
    if (boxVal) boxVal.style.display = "none";
  } else {
    if (boxVal) boxVal.style.display = "flex";
    if (lblUnid) lblUnid.textContent = tipo.includes("pct") ? "%" : "R$";

    const val = parseFloat(inpVal?.value) || 0;
    const motivo = (inpMotivo?.value || "").trim();

    currentBudget.commercial_adjustment = {
      type: tipo,
      value: val,
      description: motivo
    };
  }

  registrarEdicaoManual();
  renderizarCabecalhoTotais();
}

// ==============================================================================
// CONTROLE INTERATIVO DE ATIVAR / DESATIVAR REVISÃO (NOME LIVRE)
// ==============================================================================
function normalizarChaveCoating(c) {
  if (typeof PricingEngine !== "undefined" && PricingEngine.normalizarCoating) {
    return PricingEngine.normalizarCoating(c);
  }
  if (!c) return "pastilha_15x15";
  return String(c).trim().toLowerCase().replace(/[\s\.\,\-]+/g, "_");
}

function aoAlternarAtivarRevisao(isChecked) {
  const boxRev = document.getElementById("boxInputRevisao");
  const inpRev = document.getElementById("inputNomeRevisao");
  const previewRev = document.getElementById("badgeRevisaoPreview");

  if (isChecked) {
    if (boxRev) boxRev.style.display = "inline-flex";
    if (!currentBudget.budget_revision || !currentBudget.budget_revision.trim()) {
      currentBudget.budget_revision = "REV-B";
    }
    if (inpRev) {
      inpRev.value = currentBudget.budget_revision;
      inpRev.focus();
    }
    if (previewRev) previewRev.textContent = currentBudget.budget_revision;
    showToast(`Revisão "${currentBudget.budget_revision}" ativada para este orçamento.`, "info");
  } else {
    if (boxRev) boxRev.style.display = "none";
    currentBudget.budget_revision = "";
    if (inpRev) inpRev.value = "";
    if (previewRev) previewRev.textContent = "";
    showToast("Revisão desativada para este orçamento.", "info");
  }

  registrarEdicaoManual();
}

function aoAlterarNomeRevisao(novoNome) {
  const val = (novoNome || "").trim();
  currentBudget.budget_revision = val;
  const previewRev = document.getElementById("badgeRevisaoPreview");
  if (previewRev) previewRev.textContent = val || "REV";
  registrarEdicaoManual();
}

// ==============================================================================
// SUGESTÃO 4: HISTÓRICO DE REVISÕES DO ORÇAMENTO (NOME LIVRE)
// ==============================================================================
async function criarNovaRevisaoOrcamento() {
  if (hasUnsavedManualEdits) {
    const ok = await PapaSysDialog.confirm({
      title: "Salvar Alterações Antes de Criar Revisão?",
      message: "Existem edições pendentes neste orçamento. Deseja salvá-las antes de gerar a nova revisão?",
      type: "info"
    });
    if (ok) {
      await salvarOrcamento();
    }
  }

  const codAtual = currentBudget.budget_code || "ORC-0000";
  const revAtual = (currentBudget.budget_revision || "").trim();

  // Sugestão automática do próximo nome de revisão
  let sugestaoRev = "REV-B";
  const match = revAtual.match(/REV-?([A-Z0-9]+)$/i);
  if (match) {
    const val = match[1].toUpperCase();
    if (val.length === 1 && val >= 'A' && val < 'Z') {
      sugestaoRev = `REV-${String.fromCharCode(val.charCodeAt(0) + 1)}`;
    } else if (!isNaN(parseInt(val))) {
      sugestaoRev = `REV-${parseInt(val) + 1}`;
    } else {
      sugestaoRev = `REV-B`;
    }
  } else if (!revAtual) {
    sugestaoRev = "REV-B";
  }

  const nomeRevisao = await PapaSysDialog.prompt({
    title: "Criar Nova Revisão do Orçamento",
    message: `Informe a identificação da nova revisão para o orçamento #${codAtual}.\nVocê pode digitar qualquer nome livremente (Ex: REV-B, Rev 2, Opção Pastilha):`,
    defaultValue: sugestaoRev,
    placeholder: "Ex: REV-B, Rev 2, Opção Pastilha...",
    confirmText: "Criar Revisão",
    cancelText: "Cancelar"
  });

  if (!nomeRevisao || !nomeRevisao.trim()) return;

  const revFinal = nomeRevisao.trim().toUpperCase();
  const novoId = DB.generateUUID();
  const novoBudget = {
    ...currentBudget,
    id: novoId,
    budget_code: codAtual,
    budget_revision: revFinal,
    parent_budget_id: currentBudget.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const novosPools = currentBudgetPools.map(p => {
    const pId = DB.generateUUID();
    return { ...p, id: pId, budget_id: novoId };
  });

  showToast(`Criando revisão ${revFinal}...`, "info");
  const salvo = await DB.saveBudget(novoBudget, novosPools);

  if (salvo) {
    showToast(`Revisão ${revFinal} criada com sucesso!`, "success");
    setTimeout(() => {
      window.location.href = `orcamento.html?id=${novoId}`;
    }, 500);
  }
}

// ==============================================================================
// SUGESTÃO 3: COMPARADOR DE REVESTIMENTOS & CENÁRIOS COMERCIAIS
// ==============================================================================
function abrirComparadorRevestimentos() {
  const modal = document.getElementById("modalComparadorRevestimentos");
  const container = document.getElementById("conteudoComparadorRevestimentos");
  if (!modal || !container) return;

  const poolPrincipal = currentBudgetPools[0] || {};
  const coatingAtualKey = normalizarChaveCoating(poolPrincipal.coating_type);
  const precoM2Vigente = parseFloat(poolPrincipal.manual_m2_price) || PricingEngine.getPrecoM2(currentBudget.division, poolPrincipal.pool_type || "convencional");
  const areaTotal = currentBudgetPools.reduce((acc, p) => acc + (parseFloat(p.internal_area_m2) || 0) * (parseInt(p.units_count) || 1), 0);

  const cenarios = [
    {
      id: "pastilha_5x5",
      nome: "Pastilha Atlas 5x5 cm",
      desc: "Linha Tradicional - Flexibilidade máxima em cantos vivos e curvas",
      precoM2: precoM2Vigente,
      tipo_acab: "Cantoneiras BP11 e C3"
    },
    {
      id: "pastilha_7_5x7_5",
      nome: "Pastilha Atlas 7,5x7,5 cm",
      desc: "Linha Intermediária - Excelente harmonia estética e proporção visual",
      precoM2: precoM2Vigente,
      tipo_acab: "Boleada 7,5 cm e Quebra-canto"
    },
    {
      id: "pastilha_10x10",
      nome: "Pastilha Atlas 10x10 cm",
      desc: "Linha Moderna - Alto rendimento e visual contemporâneo",
      precoM2: precoM2Vigente,
      tipo_acab: "Cantoneiras BP11 e C3"
    },
    {
      id: "pastilha_15x15",
      nome: "Pastilha Atlas 15x15 cm",
      desc: "Padrão de Fábrica iGUi - Visual clássico de grandes módulos",
      precoM2: precoM2Vigente,
      tipo_acab: "Boleada 15 cm e Quebra-canto"
    },
    {
      id: "porcelanato_villagres",
      nome: "Porcelanato Villagres Especial",
      desc: "Linha Prime - Design sofisticado de grandes formatos",
      precoM2: Math.round(precoM2Vigente * 1.125),
      tipo_acab: "Boleadas e Quebra-cantos"
    },
    {
      id: "personalizado",
      nome: "Revestimento Sob Cotação Especial",
      desc: "Cenário com especificação personalizada de fábrica",
      precoM2: Math.round(precoM2Vigente * 1.21875),
      tipo_acab: "Acabamentos especiais"
    }
  ];

  const htmlCenarios = cenarios.map(cen => {
    const cenKey = normalizarChaveCoating(cen.id);
    const isAtual = (cenKey === coatingAtualKey);

    const poolsSimulados = currentBudgetPools.map(p => ({
      ...p,
      coating_type: cen.id,
      manual_m2_price: cen.precoM2
    }));

    const calcSimulado = PricingEngine.calcularOrcamentoCompleto(currentBudget, poolsSimulados);
    const precoTotalSim = calcSimulado.total_price;
    const diff = precoTotalSim - currentBudget.total_price;

    return `
      <div style="border: 2px solid ${isAtual ? '#1E6FD9' : '#e2e8f0'}; border-radius: 10px; padding: 14px; margin-bottom: 12px; background: ${isAtual ? '#f0f7ff' : '#ffffff'}; position: relative; box-shadow: ${isAtual ? '0 2px 8px rgba(30, 111, 217, 0.12)' : '0 1px 3px rgba(0,0,0,0.03)'};">
        ${isAtual ? '<span style="position: absolute; right: 14px; top: 14px; background: #1E6FD9; color: #fff; font-size: 10.5px; font-weight: 800; padding: 3px 10px; border-radius: 5px; letter-spacing: 0.4px;">● REVESTIMENTO ATUAL DO ORÇAMENTO</span>' : ''}
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 260px;">
            <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: #0f172a;">${cen.nome}</h4>
            <p style="margin: 3px 0 0 0; font-size: 12px; color: #64748b;">${cen.desc} &bull; <strong>${cen.tipo_acab}</strong></p>
            <div style="margin-top: 6px; font-size: 12px; color: #334155;">
              Preço Base: <strong>${PricingEngine.formatBRL(cen.precoM2)}/m²</strong> &bull; Área Total: <strong>${areaTotal.toFixed(2)} m²</strong>
            </div>
          </div>

          <div style="text-align: right; min-width: 220px;">
            <div style="font-size: 17px; font-weight: 800; color: ${isAtual ? '#0284c7' : '#1E6FD9'};">${PricingEngine.formatBRL(precoTotalSim)}</div>
            ${isAtual ? `
              <div style="font-size: 11.5px; margin-top: 2px; font-weight: 700; color: #0284c7;">
                (Valor Vigente deste Orçamento)
              </div>
            ` : Math.abs(diff) < 0.01 ? `
              <div style="font-size: 11.5px; margin-top: 2px; font-weight: 600; color: #475569;">
                Mesmo valor de tabela (R$ 0,00 de diferença)
              </div>
            ` : diff > 0 ? `
              <div style="font-size: 11.5px; margin-top: 2px; font-weight: 700; color: #b45309;">
                + ${PricingEngine.formatBRL(diff)}
              </div>
            ` : `
              <div style="font-size: 11.5px; margin-top: 2px; font-weight: 700; color: #059669;">
                - ${PricingEngine.formatBRL(Math.abs(diff))}
              </div>
            `}
            <div style="margin-top: 6px; font-size: 11px; color: #64748b;">
              Entrada 40%: <strong>${PricingEngine.formatBRL(precoTotalSim * 0.4)}</strong> | 2x 30%: <strong>${PricingEngine.formatBRL(precoTotalSim * 0.3)}</strong>
            </div>
            ${isAtual ? `
              <div style="margin-top: 8px;">
                <span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 4px 10px; border-radius: 4px; display: inline-block;">Opção Selecionada</span>
              </div>
            ` : Math.abs(diff) < 0.01 ? `
              <button type="button" class="btn btn-xs btn-outline" onclick="aplicarCenarioRevestimento('${cen.id}', ${cen.precoM2})" style="margin-top: 8px; padding: 4px 10px; font-weight: 700; border-color: #1E6FD9; color: #1E6FD9;">
                Alterar para este Revestimento
              </button>
            ` : `
              <button type="button" class="btn btn-xs btn-primary" onclick="aplicarCenarioRevestimento('${cen.id}', ${cen.precoM2})" style="margin-top: 8px; padding: 4px 10px;">
                Aplicar ao Orçamento
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div style="padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; font-size: 12.5px; color: #475569;">
      <strong>Projeto:</strong> ${currentBudget.project_name || 'Sem nome'} &bull; <strong>Total de Modelos:</strong> ${currentBudgetPools.length} &bull; <strong>Área Total:</strong> ${areaTotal.toFixed(2)} m²
    </div>
    <div style="max-height: calc(85vh - 180px); overflow-y: auto; padding-right: 4px;">
      ${htmlCenarios}
    </div>
  `;

  modal.style.display = "flex";
}

function fecharModalComparadorRevestimentos() {
  const modal = document.getElementById("modalComparadorRevestimentos");
  if (modal) modal.style.display = "none";
}

function aplicarCenarioRevestimento(novoRevestimento, precoM2) {
  currentBudgetPools.forEach(p => {
    p.coating_type = novoRevestimento;
    p.manual_m2_price = precoM2;
  });

  registrarEdicaoManual();
  renderizarOrcamento();
  fecharModalComparadorRevestimentos();
  showToast(`Revestimento atualizado em todos os modelos (${PricingEngine.formatBRL(precoM2)}/m²)!`, "success");
}
