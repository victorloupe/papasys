// ==============================================================================
// SISTEMA DE SINCRONIZAÇÃO E REALTIME COM FALLBACK (SEÇÃO 13)
// - Supabase Realtime WebSocket com fallback automático para REST Polling (15s)
// - Fila de envio offline em IndexedDB com UUID gerado no cliente
// - Indicador visual de status: 🟢 Sincronizado | 🟡 Sincronizando | 🔴 Offline
// - Diagnóstico detalhado de erros de conexão e firewall
// ==============================================================================

const PapaSysSync = {
  DB_NAME: "PapaSysOfflineDB",
  DB_VERSION: 1,
  STORE_QUEUE: "sync_queue",

  status: "syncing", // 'synced' | 'syncing' | 'offline'
  connectionType: "unknown", // 'websocket' | 'polling' | 'offline'
  realtimeChannel: null,
  pollingTimer: null,
  isProcessingQueue: false,
  lastSuccessfulSync: null,
  lastKnownRemoteTimestamp: null,

  // 1. Inicialização do Banco de Dados Offline (IndexedDB)
  async openDB() {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        resolve(null);
        return;
      }
      const req = window.indexedDB.open(PapaSysSync.DB_NAME, PapaSysSync.DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(PapaSysSync.STORE_QUEUE)) {
          db.createObjectStore(PapaSysSync.STORE_QUEUE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.error("[PapaSys Sync] Falha ao abrir IndexedDB:", req.error);
        resolve(null);
      };
    });
  },

  // 2. Fila Offline: Adicionar item pendente
  async enqueueItem(table, payload, action = "upsert") {
    const db = await PapaSysSync.openDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([PapaSysSync.STORE_QUEUE], "readwrite");
        const store = tx.objectStore(PapaSysSync.STORE_QUEUE);
        const queueEntry = {
          id: payload.id || DB.generateUUID(),
          table: table,
          action: action,
          payload: payload,
          created_at: new Date().toISOString(),
          attempts: 0,
          last_error: null
        };
        const req = store.put(queueEntry);
        req.onsuccess = () => {
          console.warn(`[PapaSys Sync] Item enfileirado na fila offline (${table} / ${queueEntry.id})`);
          PapaSysSync.updateUI();
          resolve(true);
        };
        req.onerror = () => {
          console.error("[PapaSys Sync] Erro ao gravar na fila offline:", req.error);
          resolve(false);
        };
      } catch (err) {
        console.error("[PapaSys Sync] Exceção ao enfileirar:", err);
        resolve(false);
      }
    });
  },

  // Fila Offline: Remover item processado
  async dequeueItem(id) {
    const db = await PapaSysSync.openDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([PapaSysSync.STORE_QUEUE], "readwrite");
        const store = tx.objectStore(PapaSysSync.STORE_QUEUE);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (_e) {
        resolve(false);
      }
    });
  },

  // Obter todos os itens pendentes da fila
  async getQueuedItems() {
    const db = await PapaSysSync.openDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([PapaSysSync.STORE_QUEUE], "readonly");
        const store = tx.objectStore(PapaSysSync.STORE_QUEUE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_e) {
        resolve([]);
      }
    });
  },

  // Quantidade de itens na fila
  async getQueueCount() {
    const items = await PapaSysSync.getQueuedItems();
    return items.length;
  },

  // 3. Processamento e Esvaziamento da Fila Offline
  async flushQueue() {
    if (PapaSysSync.isProcessingQueue) return;
    if (!navigator.onLine) {
      PapaSysSync.setStatus("offline");
      return;
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : null;
    if (!client) return;

    const queued = await PapaSysSync.getQueuedItems();
    if (queued.length === 0) return;

    PapaSysSync.isProcessingQueue = true;
    PapaSysSync.setStatus("syncing");
    console.log(`[PapaSys Sync] Processando ${queued.length} item(ns) pendente(s) da fila offline...`);

    let anySuccess = false;

    for (const item of queued) {
      try {
        let result = null;
        if (item.action === "delete") {
          result = await client.from(item.table).delete().eq("id", item.payload.id || item.id);
        } else {
          result = await client.from(item.table).upsert([item.payload]);
          if (result && result.error && (result.error.code === '42703' || (result.error.message && result.error.message.includes('created_by')))) {
            console.warn(`[PapaSys Sync] Coluna created_by ausente na tabela ${item.table}. Retentando sem created_by...`);
            const fallback = { ...item.payload };
            delete fallback.created_by;
            result = await client.from(item.table).upsert([fallback]);
          }
        }

        if (result.error) {
          console.error(`[PapaSys Sync] Falha ao enviar item ${item.id} da tabela ${item.table}: Status HTTP ${result.status || 'N/A'} - ${result.error.message}`, result.error);
        } else {
          await PapaSysSync.dequeueItem(item.id);
          anySuccess = true;
          console.log(`[PapaSys Sync] Item ${item.id} (${item.table}) sincronizado com sucesso no Supabase.`);
        }
      } catch (err) {
        console.error(`[PapaSys Sync] Exceção de rede ao sincronizar item ${item.id}:`, err);
      }
    }

    PapaSysSync.isProcessingQueue = false;
    const remaining = await PapaSysSync.getQueueCount();
    if (remaining === 0) {
      PapaSysSync.setStatus("synced");
      if (anySuccess) {
        window.dispatchEvent(new CustomEvent("papasys-queue-flushed"));
      }
    } else {
      PapaSysSync.setStatus("syncing");
    }
  },

  // 4. Inicialização de Sincronização e Realtime com Fallback (Seção 13.2)
  init() {
    window.addEventListener("online", () => {
      console.log("[PapaSys Sync] Rede restabelecida. Reconectando...");
      PapaSysSync.setStatus("syncing");
      PapaSysSync.flushQueue();
      PapaSysSync.checkConnection();
    });

    window.addEventListener("offline", () => {
      console.warn("[PapaSys Sync] Sem conexão com a internet (Offline).");
      PapaSysSync.setStatus("offline");
    });

    // Inicia ouvintes Realtime ou Fallback
    setTimeout(() => {
      PapaSysSync.setupRealtimeWithFallback();
      PapaSysSync.flushQueue();
    }, 500);

    // Atualiza UI inicial
    PapaSysSync.updateUI();
  },

  // Configura Realtime com Fallback para Polling a cada 15 segundos
  setupRealtimeWithFallback() {
    const client = typeof DB !== "undefined" ? DB.getClient() : null;
    if (!client) {
      PapaSysSync.startPollingFallback();
      return;
    }

    if (!navigator.onLine) {
      PapaSysSync.setStatus("offline");
      return;
    }

    try {
      if (PapaSysSync.realtimeChannel) {
        client.removeChannel(PapaSysSync.realtimeChannel);
      }

      console.log("[PapaSys Sync] Tentando conexão WebSocket Realtime...");
      PapaSysSync.setStatus("syncing");

      // Canal Realtime para tabela budgets
      PapaSysSync.realtimeChannel = client
        .channel("papasys_budgets_realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budgets" },
          (payload) => {
            console.log("[PapaSys Realtime] Atualização recebida via WebSocket:", payload.eventType, payload.new?.budget_code || payload.old?.id);
            PapaSysSync.lastSuccessfulSync = new Date();
            PapaSysSync.setStatus("synced", "websocket");
            window.dispatchEvent(new CustomEvent("papasys-budget-updated", { detail: payload }));
          }
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            console.log("[PapaSys Sync] 🟢 WebSocket Realtime Conectado com sucesso!");
            PapaSysSync.connectionType = "websocket";
            PapaSysSync.stopPollingFallback();
            PapaSysSync.setStatus("synced", "websocket");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.warn(`[PapaSys Sync] WebSocket inacessível (${status}). Possível bloqueio de firewall/proxy na rede corporativa. Ativando fallback automático via REST (15s)...`, err);
            PapaSysSync.startPollingFallback();
          }
        });

      // Se em 6 segundos não inscrever (bloqueio silencioso de WebSocket por proxy corporativo), inicia polling
      setTimeout(() => {
        if (PapaSysSync.connectionType !== "websocket") {
          console.warn("[PapaSys Sync] WebSocket não confirmou inscrição em 6s. Iniciando fallback de Polling REST a cada 15s.");
          PapaSysSync.startPollingFallback();
        }
      }, 6000);

    } catch (e) {
      console.error("[PapaSys Sync] Erro ao configurar canal Realtime:", e);
      PapaSysSync.startPollingFallback();
    }
  },

  // Fallback: Polling via REST a cada 15 segundos (Seção 13.2)
  startPollingFallback() {
    PapaSysSync.connectionType = "polling";
    if (PapaSysSync.pollingTimer) return;

    console.log("[PapaSys Sync] Iniciando Polling REST a cada 15 segundos (Fallback ativado).");
    PapaSysSync.checkConnection();

    PapaSysSync.pollingTimer = setInterval(async () => {
      await PapaSysSync.checkConnection();
      await PapaSysSync.flushQueue();
    }, 15000);
  },

  stopPollingFallback() {
    if (PapaSysSync.pollingTimer) {
      clearInterval(PapaSysSync.pollingTimer);
      PapaSysSync.pollingTimer = null;
    }
  },

  // Consulta status e atualizações via REST
  async checkConnection() {
    if (!navigator.onLine) {
      PapaSysSync.setStatus("offline");
      return;
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : null;
    if (!client) {
      PapaSysSync.setStatus("offline");
      return;
    }

    try {
      const { data, error, status } = await client
        .from("budgets")
        .select("id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error(`[PapaSys Sync] Erro na requisição REST: Status HTTP ${status} - ${error.message} (URL: /rest/v1/budgets)`);
        PapaSysSync.setStatus("offline");
        return;
      }

      PapaSysSync.lastSuccessfulSync = new Date();
      PapaSysSync.setStatus("synced", PapaSysSync.connectionType || "polling");

      // Verifica se houve atualização remota recente
      if (Array.isArray(data) && data.length > 0) {
        const latestTime = data[0].updated_at;
        if (PapaSysSync.lastKnownRemoteTimestamp && latestTime !== PapaSysSync.lastKnownRemoteTimestamp) {
          console.log("[PapaSys Sync Polling] Novas alterações detectadas no Supabase via REST!");
          window.dispatchEvent(new CustomEvent("papasys-budget-updated", { detail: { eventType: "POLL_REFRESH" } }));
        }
        PapaSysSync.lastKnownRemoteTimestamp = latestTime;
      }
    } catch (err) {
      console.error("[PapaSys Sync] Falha de comunicação com o servidor:", err);
      PapaSysSync.setStatus("offline");
    }
  },

  // 5. Criação do Widget Flutuante na tela (se ainda não existir)
  ensureFloatingUI() {
    if (typeof document === "undefined") return null;
    let toast = document.getElementById("papasysFloatingSync");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "papasysFloatingSync";
      toast.className = "floating-sync-toast state-synced";
      toast.onclick = () => PapaSysSync.manualSync();
      document.body.appendChild(toast);
    }
    return toast;
  },

  // Forçar sincronização imediata manual
  async manualSync() {
    console.log("[PapaSys Sync] Sincronização manual acionada pelo usuário.");
    PapaSysSync.setStatus("syncing");
    await PapaSysSync.flushQueue();
    await PapaSysSync.checkConnection();
  },

  // 6. Definir Status e Atualizar Componentes Visuais
  setStatus(newStatus, connType = null) {
    PapaSysSync.status = newStatus;
    if (connType) PapaSysSync.connectionType = connType;
    PapaSysSync.updateUI();
  },

  // Atualiza a notificação flutuante de sincronização
  async updateUI() {
    const toast = PapaSysSync.ensureFloatingUI();
    if (!toast) return;

    const count = await PapaSysSync.getQueueCount();

    toast.classList.remove("state-synced", "state-syncing", "state-offline");

    let dotClass = "dot-synced";
    let title = "Sincronizado";
    let sub = "Supabase em tempo real";
    let toastClass = "state-synced";
    let titleAttr = "Todos os dados estão sincronizados em tempo real com o banco de dados. Clique para atualizar.";

    if (PapaSysSync.status === "offline" || !navigator.onLine) {
      toastClass = "state-offline";
      dotClass = "dot-offline";
      title = "Modo Offline";
      sub = count > 0 ? `${count} pendência(s) salva(s) localmente` : "Alterações salvas localmente";
      titleAttr = "Sem conexão ativa. Os dados foram salvos no IndexedDB e serão enviados assim que a rede retornar.";
    } else if (PapaSysSync.status === "syncing" || count > 0) {
      toastClass = "state-syncing";
      dotClass = "dot-syncing";
      title = "Sincronizando...";
      sub = count > 0 ? `Enviando ${count} item(ns) pendente(s)` : "Comunicando com o Supabase";
      titleAttr = "Sincronizando fila de alterações com o servidor...";
    } else {
      toastClass = "state-synced";
      dotClass = "dot-synced";
      const mode = PapaSysSync.connectionType === "websocket" ? "Realtime WS" : "REST";
      title = "Sincronizado";
      sub = `Supabase ativo (${mode})`;
      titleAttr = `Conexão ativa via ${mode}. Clique para verificar atualizações.`;
    }

    toast.classList.add(toastClass);
    toast.title = titleAttr;
    toast.innerHTML = `
      <div class="floating-sync-icon">
        <span class="sync-dot ${dotClass}"></span>
      </div>
      <div class="floating-sync-content">
        <span class="floating-sync-title">${title}</span>
        <span class="floating-sync-sub">${sub}</span>
      </div>
      <button type="button" class="floating-sync-btn-retry" title="Verificar agora" onclick="event.stopPropagation(); PapaSysSync.manualSync();">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
      </button>
    `;

    // Atualiza botão de sincronização no topo (ao lado da Configuração)
    const headerBtn = document.getElementById("btnSyncNow");
    if (headerBtn) {
      if (toastClass === "state-syncing") {
        headerBtn.classList.add("syncing");
        headerBtn.classList.remove("has-offline");
        headerBtn.title = "Sincronizando com o Supabase...";
      } else if (toastClass === "state-offline") {
        headerBtn.classList.remove("syncing");
        headerBtn.classList.add("has-offline");
        headerBtn.title = `Modo Offline (${count} pendente(s)). Clique para tentar reconectar.`;
      } else {
        headerBtn.classList.remove("syncing", "has-offline");
        headerBtn.title = "Sincronizado com o Supabase. Clique para sincronizar agora.";
      }
    }

    // Comportamento temporário da notificação flutuante:
    // Aparece ao sincronizar e some após 2.5s quando sincronizado
    if (PapaSysSync._toastTimer) {
      clearTimeout(PapaSysSync._toastTimer);
      PapaSysSync._toastTimer = null;
    }

    if (toastClass === "state-syncing") {
      toast.classList.add("is-visible");
    } else if (toastClass === "state-offline") {
      toast.classList.add("is-visible");
    } else {
      // Estado sincronizado: mostra brevemente se estava visível e oculta após 2.5 segundos
      if (toast.classList.contains("is-visible")) {
        PapaSysSync._toastTimer = setTimeout(() => {
          toast.classList.remove("is-visible");
        }, 2500);
      }
    }
  }
};

window.SyncManager = PapaSysSync;

// Inicialização automática ao carregar o script
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => PapaSysSync.init());
  } else {
    PapaSysSync.init();
  }
}
