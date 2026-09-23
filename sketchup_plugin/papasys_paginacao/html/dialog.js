// PapaSys Paginação - Script de Interface (HTML <-> SketchUp Ruby v1.1.0)

const SUPABASE_CONFIG = {
  url: "https://bhbbpdvgkyjqxhghbmpe.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M"
};

let currentResult = null;
let autoSendAfterAdjust = false;
let currentOrigem = "centro";
let currentCantoRef = "inf_esq";
let currentPercentualPerda = 10;

document.addEventListener("DOMContentLoaded", () => {
  if (window.sketchup) {
    window.sketchup.ready();
  }
});

function initApp(config) {
  if (config.version) {
    document.getElementById("versionBadge").textContent = "v" + config.version;
  }
  if (config.server_url) {
    document.getElementById("inputServerUrl").value = config.server_url;
  }
  if (config.auto_update !== undefined) {
    document.getElementById("chkAutoUpdate").checked = config.auto_update;
  }
  if (config.largura_cm) {
    document.getElementById("inputLargura").value = config.largura_cm;
  }
  if (config.altura_cm) {
    document.getElementById("inputAltura").value = config.altura_cm;
  }
  if (config.rejunte_cm) {
    document.getElementById("inputRejunte").value = config.rejunte_cm;
  }
  if (config.info_selecao) {
    atualizarInfoSelecao(config.info_selecao);
  }
}

// Detecção Automática do 3D Selecionado
function solicitarInspecao(e) {
  if (e) e.stopPropagation();
  if (window.sketchup && window.sketchup.inspecionar_selecao) {
    window.sketchup.inspecionar_selecao();
  }
}

function atualizarInfoSelecao(info) {
  const chip = document.getElementById("selectionChip");
  const titleEl = document.getElementById("selectionStatusText");
  const dimsEl = document.getElementById("selectionDimsText");

  if (!chip || !titleEl || !dimsEl) return;

  console.log("[PapaSys JS] Info seleção:", info);

  if (info && info.has_selection) {
    chip.classList.remove("no-sel");
    chip.classList.add("has-sel");
    titleEl.textContent = "✓ " + (info.descricao || "Piscina 3D Selecionada");

    const comp = parseFloat(info.comprimento_m) || 0;
    const larg = parseFloat(info.largura_m) || 0;
    const prof = parseFloat(info.profundidade_m) || 0;

    if (comp > 0 && larg > 0) {
      dimsEl.textContent = `${comp.toFixed(2)}m × ${larg.toFixed(2)}m × ${prof.toFixed(2)}m`;
    } else {
      dimsEl.textContent = info.descricao || "Geometria da piscina pronta";
    }

    const badgeCurva = document.getElementById("badgeCurva");
    if (badgeCurva) {
      badgeCurva.style.display = (info.tem_curvas) ? "inline-flex" : "none";
    }

    // Preenche o nome do projeto automaticamente se o grupo possuir nome no SketchUp
    if (info.nome_sugerido && info.nome_sugerido.trim() !== "") {
      const projInput = document.getElementById("inputProjeto");
      if (projInput && (projInput.value === "Piscina Cliente PapaSys" || projInput.value === "" || projInput.value === "Piscina sem Nome")) {
        projInput.value = info.nome_sugerido.trim();
      }
    }
  } else {
    chip.classList.remove("has-sel");
    chip.classList.add("no-sel");
    titleEl.textContent = "Nenhuma piscina selecionada";

    const badgeCurva = document.getElementById("badgeCurva");
    if (badgeCurva) badgeCurva.style.display = "none";
    if (info && info.error) {
      dimsEl.textContent = "Aviso: " + info.error;
    } else {
      dimsEl.textContent = "Selecione o grupo ou faces no SketchUp";
    }
  }
}

// Seleção do Ponto de Origem da Modulação
function setOrigem(origem) {
  currentOrigem = origem;
  const btnCentro = document.getElementById("btnOrigemCentro");
  const btnCanto = document.getElementById("btnOrigemCanto");
  const cantoGroup = document.getElementById("cantoSelectorGroup");

  if (btnCentro) btnCentro.classList.toggle("active", origem === "centro");
  if (btnCanto) btnCanto.classList.toggle("active", origem === "canto");

  if (cantoGroup) {
    cantoGroup.style.display = (origem === "canto") ? "block" : "none";
  }
}

// Seleção do Canto de Partida (quando Origem = Canto)
function setCantoRef(canto) {
  currentCantoRef = canto;
  const cantos = {
    'sup_esq': 'btnCantoSupEsq',
    'sup_dir': 'btnCantoSupDir',
    'inf_esq': 'btnCantoInfEsq',
    'inf_dir': 'btnCantoInfDir'
  };
  Object.entries(cantos).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', key === canto);
  });
}

// Predefinições rápidas
function setPreset(larg, alt, rej) {
  document.getElementById("inputLargura").value = larg;
  document.getElementById("inputAltura").value = alt;
  document.getElementById("inputRejunte").value = rej;

  document.querySelectorAll(".btn-preset").forEach(btn => {
    btn.classList.remove("active");
  });
  if (window.event && window.event.target) {
    window.event.target.classList.add("active");
  }
}

// Margem de perda / sobra técnica
function setPercentualPerda(pct) {
  currentPercentualPerda = pct;
  const btn10 = document.getElementById("btnPerda10");
  const btn15 = document.getElementById("btnPerda15");

  if (btn10) btn10.classList.toggle("active", pct === 10);
  if (btn15) btn15.classList.toggle("active", pct === 15);

  recalcularPerda();
}

function recalcularPerda() {
  const inputArea = document.getElementById("inputAreaM2");
  const outEl = document.getElementById("statAreaComPerda");
  if (!inputArea || !outEl) return;

  const base = parseFloat(inputArea.value) || 0.0;
  const comPerda = (base * (1 + currentPercentualPerda / 100)).toFixed(2);
  outEl.textContent = comPerda + " m²";
}

// 1. Executa Ajuste e Envio imediato em 1 clique
function ajustarEEnviarTudo() {
  autoSendAfterAdjust = true;
  executarAjuste(true);
}

// 2. Executa o ajuste geométrico modular no SketchUp
function executarAjuste(autoSend = false) {
  autoSendAfterAdjust = autoSend;

  const btn = document.getElementById("btnAjustar");
  btn.disabled = true;
  btn.innerHTML = 'Modulando geometria...';

  const btnAll = document.getElementById("btnAjustarEEnviar");
  if (btnAll) {
    btnAll.disabled = true;
    btnAll.innerHTML = 'Ajustando e Sincronizando...';
  }

  const params = {
    largura: parseFloat(document.getElementById("inputLargura").value) || 15.0,
    altura: parseFloat(document.getElementById("inputAltura").value) || 15.0,
    rejunte: parseFloat(document.getElementById("inputRejunte").value) || 0.2,
    origem: currentOrigem,
    canto_ref: currentCantoRef,
    projeto: document.getElementById("inputProjeto").value || "Piscina sem Nome",
    cliente: document.getElementById("inputCliente").value || "Cliente Geral",
    notas: ""
  };

  if (window.sketchup) {
    window.sketchup.executar_ajuste(params);
  } else {
    setTimeout(() => {
      onAjusteSucesso({
        success: true,
        projeto: params.projeto,
        cliente: params.cliente,
        origem_modulacao: params.origem,
        area_interna_m2: 28.56,
        area_perda_10_m2: 31.42,
        area_perda_15_m2: 32.84,
        borda_perimetro_linear_m: 15.81,
        pontos_ajustados: 8,
        mod_horizontal_cm: (params.largura + params.rejunte).toFixed(1),
        mod_vertical_cm: (params.altura + params.rejunte).toFixed(1),
        dimensoes: { comprimento_m: 6.0, largura_m: 3.0, profundidade_m: 1.4 }
      });
    }, 400);
  }
}

function onAjusteSucesso(res) {
  const btn = document.getElementById("btnAjustar");
  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
    Apenas Ajustar Geometria 3D
  `;

  currentResult = res;

  const inputArea = document.getElementById("inputAreaM2");
  if (inputArea) {
    inputArea.value = Number(res.area_interna_m2).toFixed(2);
  }
  const inputBorda = document.getElementById("inputBordaM");
  if (inputBorda) {
    inputBorda.value = Number(res.borda_perimetro_linear_m).toFixed(2);
  }

  // Atualiza perda
  recalcularPerda();

  const snapBadge = document.getElementById("badgeSnapStatus");
  if (snapBadge) {
    snapBadge.textContent = (res.origem_modulacao === "canto") ? "Snap Canto OK" : "Snap Central OK";
  }

  document.getElementById("statVertices").textContent = `${res.pontos_ajustados} pts`;
  document.getElementById("statModulo").textContent = `${res.mod_horizontal_cm}×${res.mod_vertical_cm} cm`;

  const rowCurva = document.getElementById("rowCurvaInfo");
  const textCurva = document.getElementById("textCurvaInfo");
  if (rowCurva && textCurva) {
    if (res.tem_curvas && res.comprimento_curva_m > 0) {
      rowCurva.style.display = "flex";
      textCurva.textContent = `Parede Curva Preservada: ${res.comprimento_curva_m}m desenvolvidos (~${res.qtd_pastilhas_curva} peças inteiras no arco)`;
    } else {
      rowCurva.style.display = "none";
    }
  }

  document.getElementById("resultsCard").classList.remove("hidden");

  const origTxt = (res.origem_modulacao === "canto") ? "pelo canto inicial" : "pelo centro simétrico";
  const msgToast = res.tem_curvas 
    ? `Ajuste 3D concluído! Retas moduladas e curvaturas preservadas suavemente.`
    : `Ajuste 3D concluído com sucesso (${origTxt})!`;
  showToast(msgToast, "success");

  // Se o botão de 1 clique foi acionado, dispara o envio imediatamente
  if (autoSendAfterAdjust) {
    autoSendAfterAdjust = false;
    enviarParaWeb();
  } else {
    const btnAll = document.getElementById("btnAjustarEEnviar");
    if (btnAll) {
      btnAll.disabled = false;
      btnAll.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        Ajustar & Enviar para o PapaSys (1 Clique)
      `;
    }
  }
}

function onAjusteErro(errMsg) {
  const btn = document.getElementById("btnAjustar");
  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
      <polyline points="2 17 12 22 22 17"></polyline>
      <polyline points="2 12 12 17 22 12"></polyline>
    </svg>
    Apenas Ajustar Geometria 3D
  `;

  const btnAll = document.getElementById("btnAjustarEEnviar");
  if (btnAll) {
    btnAll.disabled = false;
    btnAll.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      Ajustar & Enviar para o PapaSys (1 Clique)
    `;
  }

  showToast(errMsg, "error");
}

async function enviarParaWeb() {
  if (!currentResult) {
    ajustarEEnviarTudo();
    return;
  }

  const btn = document.getElementById("btnEnviarWeb");
  const btnAll = document.getElementById("btnAjustarEEnviar");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Gravando no Supabase...';
  }
  if (btnAll) {
    btnAll.disabled = true;
    btnAll.innerHTML = 'Gravando no Supabase...';
  }

  const inputAreaEl = document.getElementById("inputAreaM2");
  const inputBordaEl = document.getElementById("inputBordaM");
  const areaM2 = inputAreaEl ? (parseFloat(inputAreaEl.value) || 0) : (currentResult ? currentResult.area_interna_m2 : 0);
  const bordaM = inputBordaEl ? (parseFloat(inputBordaEl.value) || 0) : (currentResult ? currentResult.borda_perimetro_linear_m : 0);
  const custoDireto = Math.round((areaM2 * 230.0 + bordaM * 175.0) * 100) / 100;
  const precoSugerido = Math.round((custoDireto * 1.25) * 100) / 100;

  const largPeca = parseFloat(document.getElementById("inputLargura").value) || 15.0;
  const altPeca = parseFloat(document.getElementById("inputAltura").value) || 15.0;
  const rejuntePeca = parseFloat(document.getElementById("inputRejunte").value) || 0.2;
  const nomeProj = document.getElementById("inputProjeto").value || "Piscina sem Nome";
  const nomeCli = document.getElementById("inputCliente").value || "Cliente Geral";

  const dim = currentResult.dimensoes || {};

  const payload = {
    project_name: nomeProj,
    client_name: nomeCli,
    tile_spec: `${largPeca}x${altPeca}`,
    tile_width_cm: largPeca,
    tile_height_cm: altPeca,
    grout_cm: rejuntePeca,
    internal_area_m2: areaM2,
    border_perimeter_linear_m: bordaM,
    pool_length_m: parseFloat(dim.comprimento_m || 0),
    pool_width_m: parseFloat(dim.largura_m || 0),
    pool_depth_m: parseFloat(dim.profundidade_m || 0),
    status: 'novo',
    total_cost: custoDireto,
    margin_percent: 25.0,
    total_price: precoSugerido,
    notes: `Paginação modular sem recortes (${currentOrigem}) gerada no SketchUp.`,
    plugin_version: '1.1.0'
  };

  const inputServerUrl = document.getElementById("inputServerUrl").value.trim().replace(/\/$/, "");
  const serverBase = inputServerUrl || SUPABASE_CONFIG.url;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`${serverBase}/rest/v1/projects`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_CONFIG.key,
        "Authorization": `Bearer ${SUPABASE_CONFIG.key}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const created = Array.isArray(data) ? data[0] : data;
    const projectId = created ? created.id : null;

    onEnvioSucesso({
      message: "Projeto sincronizado com sucesso com o PapaSys!",
      project_id: projectId
    });

    if (window.sketchup && window.sketchup.notificar_envio_concluido) {
      window.sketchup.notificar_envio_concluido({ id: projectId, nome: nomeProj });
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Envio via fetch CEF falhou, acionando fallback Ruby:", err);

    if (window.sketchup && window.sketchup.enviar_web) {
      window.sketchup.enviar_web(payload);
    } else {
      onEnvioErro("Erro de gravação: " + (err.name === 'AbortError' ? 'Tempo limite esgotado' : err.message));
    }
  }
}

function onEnvioSucesso(res) {
  const btn = document.getElementById("btnEnviarWeb");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      Reenviar para Nuvem Supabase
    `;
  }

  const btnAll = document.getElementById("btnAjustarEEnviar");
  if (btnAll) {
    btnAll.disabled = false;
    btnAll.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Sincronizado com Sucesso!
    `;
    setTimeout(() => {
      btnAll.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        Ajustar & Enviar para o PapaSys (1 Clique)
      `;
    }, 4000);
  }

  showToast("✅ Gravado no PapaSys com sucesso!", "success");
}

function onEnvioErro(errMsg) {
  const btn = document.getElementById("btnEnviarWeb");
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = 'Tentar Novamente';
  }

  const btnAll = document.getElementById("btnAjustarEEnviar");
  if (btnAll) {
    btnAll.disabled = false;
    btnAll.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      Ajustar & Enviar para o PapaSys (1 Clique)
    `;
  }

  showToast("Erro ao gravar: " + errMsg, "error");
}

function salvarConfiguracoes() {
  const serverUrl = document.getElementById("inputServerUrl").value;
  const autoUpdate = document.getElementById("chkAutoUpdate").checked;

  if (window.sketchup) {
    window.sketchup.salvar_config({
      server_url: serverUrl,
      auto_update: autoUpdate
    });
  } else {
    showToast("Configurações salvas!", "success");
  }
}

// Modal de Configurações (Conexão e Auto-Update)
function toggleModalConfig() {
  const modal = document.getElementById("modalConfig");
  if (!modal) return;
  if (modal.style.display === "none" || modal.style.display === "") {
    abrirModalConfig();
  } else {
    fecharModalConfig();
  }
}

function abrirModalConfig() {
  const modal = document.getElementById("modalConfig");
  if (modal) modal.style.display = "flex";
}

function fecharModalConfig() {
  const modal = document.getElementById("modalConfig");
  if (modal) modal.style.display = "none";
}

function fecharModalSeClicarFora(e) {
  if (e.target && e.target.id === "modalConfig") {
    fecharModalConfig();
  }
}

function salvarConfiguracoesEFechar() {
  salvarConfiguracoes();
  fecharModalConfig();
}

document.getElementById("btnCheckUpdate").addEventListener("click", verificarAtualizacaoManual);

function verificarAtualizacaoManual() {
  const btn = document.getElementById("btnCheckUpdate");
  if (btn) btn.classList.add("spinning");
  showToast("Verificando se há novas versões do PapaSys...", "info");
  if (window.sketchup) {
    window.sketchup.verificar_atualizacao();
  }
  setTimeout(() => {
    if (btn) btn.classList.remove("spinning");
  }, 4000);
}

// Monitoramento ativo e resiliente da seleção no SketchUp
window.addEventListener("focus", () => {
  solicitarInspecao();
});

setInterval(() => {
  solicitarInspecao();
}, 1200);

function showToast(text, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
