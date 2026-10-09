// ==============================================================================
// CAMADA DE DADOS E INTEGRAÇÃO SUPABASE - SISTEMA DE ORÇAMENTOS iGUi
// Seções 12 e 13: Suporte a RLS, Offline Queue (IndexedDB), e Sincronização
// ==============================================================================

const DB = {
  STORAGE_KEY_BUDGETS: "igui_budgets_data",
  STORAGE_KEY_POOLS: "igui_pools_data",
  STORAGE_KEY_TECH_ITEMS: "igui_tech_items_data",

  // 1. Obter cliente Supabase
  getClient() {
    if (!supabaseClient && window.supabase) {
      try {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storage: window.localStorage
          }
        });
      } catch (e) {
        console.warn("[DB] Erro ao instanciar Supabase:", e);
      }
    }
    return supabaseClient;
  },

  // 2. Obter orçamentos (com filtro por divisão, etapa e regras de RLS)
  async getBudgets(division = null, stage = null) {
    let allBudgets = [];
    const client = DB.getClient();
    const currentUser = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
    const isAdmin = typeof Auth !== "undefined" ? Auth.isAdmin() : false;

    if (client && navigator.onLine) {
      try {
        let query = client.from("budgets").select("*").order("created_at", { ascending: false });
        if (division) query = query.eq("division", division);
        if (stage) query = query.eq("stage", stage);

        // Se for usuário comum, o Supabase já aplica o RLS no servidor.
        const { data, error, status, statusText } = await query;
        if (!error && Array.isArray(data)) {
          // Busca os modelos vinculados aos orçamentos retornados
          for (let b of data) {
            const { data: pools, error: poolErr } = await client.from("budget_pools").select("*").eq("budget_id", b.id);
            b.pools = (!poolErr && pools) ? pools : [];
          }
          localStorage.setItem(DB.STORAGE_KEY_BUDGETS, JSON.stringify(data));
          allBudgets = data;
        } else if (error) {
          console.error(`[PapaSys Sync] Falha ao carregar orçamentos: Status HTTP ${status} (${statusText}) - Mensagem: ${error.message} - Detalhes: ${error.details || 'N/A'}`);
        }
      } catch (e) {
        console.warn("[DB] Erro de rede ou firewall. Usando cache local:", e);
      }
    }

    if (allBudgets.length === 0) {
      allBudgets = DB.getLocalBudgets();
    }

    // Filtragem local conforme divisão, etapa e permissões do usuário logado (RLS Client-Side)
    let filtered = allBudgets;

    if (!isAdmin && currentUser) {
      const allowedDivs = currentUser.allowed_divisions || ["sob_medida"];
      // Regra Seção 12.5: Usuário vê apenas os orçamentos que criou ou atribuídos a ele, nas divisões liberadas
      filtered = filtered.filter(b => {
        const isDivisionAllowed = allowedDivs.includes(b.division);
        const isOwnerOrAssigned = b.created_by === currentUser.id ||
                                  b.assigned_user_id === currentUser.id ||
                                  (b.assigned_user_name && b.assigned_user_name.toLowerCase() === (currentUser.name || '').toLowerCase());
        return isDivisionAllowed && isOwnerOrAssigned;
      });
    }

    if (division && division !== "dashboard_geral") {
      filtered = filtered.filter(b => b.division === division);
    }
    if (stage) {
      filtered = filtered.filter(b => b.stage === stage);
    }

    return filtered;
  },

  // 3. Obter orçamento específico por ID com todas as suas piscinas
  async getBudgetById(id) {
    if (!id) return null;
    const client = DB.getClient();

    if (client && navigator.onLine) {
      try {
        const { data: b, error } = await client.from("budgets").select("*").eq("id", id).single();
        if (!error && b) {
          const { data: pools } = await client.from("budget_pools").select("*").eq("budget_id", id);
          b.pools = (pools || []).map((p, pIndex) => {
            if (p.finishes_details && typeof p.finishes_details === "object") {
              if (p.finishes_details.manual_m2_price != null) p.manual_m2_price = p.finishes_details.manual_m2_price;
              if (p.finishes_details.manual_finishes) p.manual_finishes = p.finishes_details.manual_finishes;
              if (p.finishes_details.manual_model_value != null) p.manual_model_value = p.finishes_details.manual_model_value;
              if (p.finishes_details.price_edited_by) p.price_edited_by = p.finishes_details.price_edited_by;
              if (p.finishes_details.price_edited_at) p.price_edited_at = p.finishes_details.price_edited_at;
              if (pIndex === 0) {
                if (p.finishes_details.commercial_adjustment) b.commercial_adjustment = p.finishes_details.commercial_adjustment;
                if (p.finishes_details.budget_revision) b.budget_revision = p.finishes_details.budget_revision;
              }
            }
            return p;
          });
          return b;
        }
      } catch (e) {
        // Fallback local
      }
    }

    const localBudgets = DB.getLocalBudgets();
    return localBudgets.find(b => b.id === id) || null;
  },

  // Helper: Gera UUID v4 válido
  generateUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      try {
        return crypto.randomUUID();
      } catch (e) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // Helper: Checa se string é UUID válido
  isUUID(str) {
    if (!str || typeof str !== "string") return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  },

  // 4. Salvar ou criar novo orçamento
  async saveBudget(budgetData, pools = []) {
    let isNew = !budgetData.id;
    let bId = (budgetData.id && DB.isUUID(budgetData.id)) ? budgetData.id : DB.generateUUID();
    let budgetCode = budgetData.budget_code || `ORC-${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth()+1).toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const currentUser = typeof Auth !== "undefined" ? Auth.getCurrentUser() : null;
    const currentUserId = currentUser ? currentUser.id : null;

    // Normaliza os pools garantindo UUIDs válidos e removendo calc anterior
    const normalizedPools = (pools || []).map((p) => {
      const poolCopy = { ...p };
      delete poolCopy.calc;
      return {
        ...poolCopy,
        id: (p.id && DB.isUUID(p.id)) ? p.id : DB.generateUUID(),
        budget_id: bId,
        units_count: Math.max(1, parseInt(p.units_count) || 1)
      };
    });

    // Calcula os totais com o motor de precificação da Seção 11
    const calc = PricingEngine.calcularOrcamentoCompleto({ ...budgetData, id: bId }, normalizedPools);

    const fullBudget = {
      ...budgetData,
      id: bId,
      budget_code: budgetCode,
      status: budgetData.status || "em_aberto",
      created_by: budgetData.created_by || (DB.isUUID(currentUserId) ? currentUserId : null),
      assigned_user_id: budgetData.assigned_user_id || (DB.isUUID(currentUserId) ? currentUserId : null),
      assigned_user_name: budgetData.assigned_user_name || (currentUser ? currentUser.name : "Não atribuído"),
      total_base_cost: calc.total_base_cost,
      total_price: calc.total_price,
      total_area_revestimento: calc.total_area_revestimento,
      total_area_laminacao: calc.total_area_laminacao,
      total_volume_m3: calc.total_volume_m3,
      total_volume_liters: calc.total_volume_liters,
      pools: calc.pools.map(p => ({
        ...p,
        budget_id: bId
      })),
      created_at: budgetData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Salva imediatamente no LocalStorage para resposta instantânea na UI
    const localBudgets = DB.getLocalBudgets();
    let updated;
    if (isNew) {
      updated = [fullBudget, ...localBudgets.filter(b => b.id !== bId)];
    } else {
      updated = localBudgets.map(b => b.id === bId ? fullBudget : b);
      if (!updated.some(b => b.id === bId)) {
        updated.unshift(fullBudget);
      }
    }
    localStorage.setItem(DB.STORAGE_KEY_BUDGETS, JSON.stringify(updated));

    // Monta payload do budget para Supabase
    const allowedBudgetCols = [
      "id", "budget_code", "client_name", "project_name", "division", 
      "stage", "status", "created_by", "assigned_user_id", "assigned_user_name", 
      "total_price", "total_base_cost", "total_area_revestimento", 
      "total_area_laminacao", "total_volume_m3", "total_volume_liters", 
      "notes", "created_at", "updated_at"
    ];
    const budgetPayload = {};
    for (const col of allowedBudgetCols) {
      if (fullBudget[col] !== undefined) {
        budgetPayload[col] = fullBudget[col];
      }
    }
    if (!DB.isUUID(budgetPayload.assigned_user_id)) {
      budgetPayload.assigned_user_id = null;
    }
    if (!DB.isUUID(budgetPayload.created_by)) {
      budgetPayload.created_by = null;
    }

    const client = DB.getClient();
    let sentSuccessfully = false;

    if (client && navigator.onLine) {
      try {
        let { error: bErr, status, statusText } = await client.from("budgets").upsert([budgetPayload]);
        if (bErr && (bErr.code === '42703' || (bErr.message && bErr.message.includes('created_by')))) {
          console.warn("[PapaSys Sync] Coluna created_by ainda não existe no Supabase. Retentando upsert sem created_by...");
          const fallbackPayload = { ...budgetPayload };
          delete fallbackPayload.created_by;
          const retry = await client.from("budgets").upsert([fallbackPayload]);
          bErr = retry.error;
        }

        if (bErr) {
          console.error(`[PapaSys Sync] Erro no upsert de budget Supabase: Status HTTP ${status} (${statusText}) - ${bErr.message}`, bErr);
        } else {
          sentSuccessfully = true;
          if (fullBudget.pools && fullBudget.pools.length > 0) {
            const allowedPoolCols = [
              "id", "budget_id", "model_name", "units_count", "pool_type",
              "structure_type", "coating_type", "has_mold", "mold_auto",
              "internal_area_m2", "lamination_area_m2", "internal_volume_m3",
              "internal_volume_liters", "linear_corners_m", "alive_corners_count",
              "finishes_details", "unit_base_value", "unit_autoportante_value",
              "unit_final_value", "total_model_value"
            ];
            const poolsPayload = fullBudget.pools.map((p, pIndex) => {
              const row = {};
              for (const col of allowedPoolCols) {
                if (p[col] !== undefined) row[col] = p[col];
              }
              let finishesObj = typeof p.finishes_details === "object" && p.finishes_details ? { ...p.finishes_details } : {};
              if (p.manual_m2_price != null) finishesObj.manual_m2_price = p.manual_m2_price;
              if (p.manual_finishes) finishesObj.manual_finishes = p.manual_finishes;
              if (p.manual_model_value != null) finishesObj.manual_model_value = p.manual_model_value;
              if (p.price_edited_by) finishesObj.price_edited_by = p.price_edited_by;
              if (p.price_edited_at) finishesObj.price_edited_at = p.price_edited_at;
              if (pIndex === 0) {
                if (fullBudget.commercial_adjustment) finishesObj.commercial_adjustment = fullBudget.commercial_adjustment;
                if (fullBudget.budget_revision) finishesObj.budget_revision = fullBudget.budget_revision;
              }
              row.finishes_details = finishesObj;
              if (p.manual_model_value != null) row.total_model_value = p.manual_model_value;
              return row;
            });
            const { error: pErr, status: pStatus } = await client.from("budget_pools").upsert(poolsPayload);
            if (pErr) {
              console.error(`[PapaSys Sync] Erro no upsert de budget_pools Supabase: Status HTTP ${pStatus} - ${pErr.message}`, pErr);
              if (typeof PapaSysSync !== "undefined") {
                for (const poolRow of poolsPayload) {
                  await PapaSysSync.enqueueItem("budget_pools", poolRow);
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[DB] Exceção de rede no envio Supabase. Gravando na fila offline...", e);
      }
    }

    // Se não enviou com sucesso ao Supabase (offline ou bloqueio de proxy), adiciona à fila IndexedDB (Seção 13.2)
    if (!sentSuccessfully && typeof PapaSysSync !== "undefined") {
      await PapaSysSync.enqueueItem("budgets", budgetPayload);
      if (fullBudget.pools && fullBudget.pools.length > 0) {
        for (const p of fullBudget.pools) {
          await PapaSysSync.enqueueItem("budget_pools", p);
        }
      }
    }

    return fullBudget;
  },

  // 5. Avançar Etapa do Orçamento (Fluxo: Prévia -> Galga -> Desenho Técnico)
  async advanceStage(budgetId, nextStage) {
    const budget = await DB.getBudgetById(budgetId);
    if (!budget) return null;

    budget.stage = nextStage;
    budget.updated_at = new Date().toISOString();

    const updatedBudget = await DB.saveBudget(budget, budget.pools || []);
    return updatedBudget;
  },

  // 6. Atribuir Responsável
  async reassignBudget(budgetId, userId, userName) {
    const budget = await DB.getBudgetById(budgetId);
    if (!budget) return null;

    budget.assigned_user_id = userId;
    budget.assigned_user_name = userName;
    budget.updated_at = new Date().toISOString();

    const updated = await DB.saveBudget(budget, budget.pools || []);
    return updated;
  },

  // ==============================================================================
  // SEÇÃO 10.1: DIVISÃO DE ORÇAMENTOS (INCORPORADORA) - MULTI-MODELOS SIMULTÂNEOS
  // ==============================================================================
  async splitBudgetMulti(budgetId, itemsToMove = [], options = {}) {
    const originalBudget = await DB.getBudgetById(budgetId);
    if (!originalBudget || !originalBudget.pools || originalBudget.pools.length === 0) {
      console.error("[DB] Orçamento original não encontrado ou sem piscinas:", budgetId);
      return null;
    }

    const validMoves = (itemsToMove || []).map(item => ({
      poolId: item.poolId,
      unitsToMove: Math.max(0, parseInt(item.unitsToMove) || 0)
    })).filter(item => item.unitsToMove > 0);

    const totalMoving = validMoves.reduce((sum, item) => sum + item.unitsToMove, 0);
    if (totalMoving <= 0) {
      if (typeof PapaSysDialog !== "undefined") {
        PapaSysDialog.alert({
          title: "Desmembramento de Unidades",
          message: "Selecione ao menos 1 unidade para desmembrar.",
          type: "warning"
        });
      }
      return null;
    }

    let totalRemainingUnits = 0;
    const remainingPools = [];
    const newPools = [];
    const poolsToDeleteFromDb = [];

    for (const pool of originalBudget.pools) {
      const currentUnits = parseInt(pool.units_count) || 1;
      const moveSpec = validMoves.find(m => m.poolId === pool.id);
      const unitsMoving = moveSpec ? moveSpec.unitsToMove : 0;

      if (unitsMoving > currentUnits) {
        if (typeof PapaSysDialog !== "undefined") {
          PapaSysDialog.alert({
            title: "Quantidade Inválida",
            message: `Não é possível desmembrar ${unitsMoving} unidades do modelo "${pool.model_name}", pois o total disponível é de apenas ${currentUnits}.`,
            type: "warning"
          });
        }
        return null;
      }

      const unitsRemaining = currentUnits - unitsMoving;
      totalRemainingUnits += unitsRemaining;

      if (unitsRemaining > 0) {
        const poolCopy = { ...pool };
        delete poolCopy.calc;
        remainingPools.push({
          ...poolCopy,
          units_count: unitsRemaining
        });
      } else {
        poolsToDeleteFromDb.push(pool.id);
      }

      if (unitsMoving > 0) {
        const poolCopy = { ...pool };
        delete poolCopy.calc;
        newPools.push({
          ...poolCopy,
          id: DB.generateUUID(),
          units_count: unitsMoving
        });
      }
    }

    if (totalRemainingUnits <= 0) {
      if (typeof PapaSysDialog !== "undefined") {
        PapaSysDialog.alert({
          title: "Desmembramento Bloqueado",
          message: "O orçamento original não pode ficar sem nenhuma piscina. Deixe pelo menos 1 unidade no orçamento de origem.",
          type: "warning"
        });
      }
      return null;
    }

    const client = DB.getClient();
    if (client && poolsToDeleteFromDb.length > 0 && navigator.onLine) {
      try {
        await client.from("budget_pools").delete().in("id", poolsToDeleteFromDb);
      } catch (e) {
        console.warn("[DB] Erro ao deletar pools transferidos:", e);
      }
    }

    originalBudget.pools = remainingPools;
    const updatedSource = await DB.saveBudget(originalBudget, remainingPools);

    const newBudgetCode = options.budgetCode && options.budgetCode.trim()
      ? options.budgetCode.trim().toUpperCase()
      : undefined;

    const newProjectName = options.projectName && options.projectName.trim()
      ? options.projectName.trim()
      : `${originalBudget.project_name} (Lote Desmembrado - ${totalMoving} un)`;

    const defaultNotes = `Desmembrado de ${originalBudget.budget_code} contendo ${totalMoving} unidade(s): ` +
      newPools.map(p => `${p.units_count}x ${p.model_name}`).join(", ") + ".";

    const newNotes = options.notes && options.notes.trim()
      ? options.notes.trim()
      : defaultNotes;

    const destinationBudget = await DB.saveBudget({
      budget_code: newBudgetCode,
      project_name: newProjectName,
      client_name: originalBudget.client_name,
      division: originalBudget.division,
      stage: originalBudget.stage,
      status: "em_aberto",
      assigned_user_id: originalBudget.assigned_user_id,
      assigned_user_name: originalBudget.assigned_user_name,
      notes: newNotes
    }, newPools);

    return {
      sourceBudget: updatedSource,
      destinationBudget: destinationBudget,
      totalMoving: totalMoving,
      newPools: newPools
    };
  },

  async splitBudgetUnits(budgetId, poolId, unitsToMove, destinationBudgetId = null) {
    return await DB.splitBudgetMulti(budgetId, [{ poolId, unitsToMove }]);
  },

  // 7. Excluir orçamento
  async deleteBudget(id) {
    const local = DB.getLocalBudgets().filter(b => b.id !== id);
    localStorage.setItem(DB.STORAGE_KEY_BUDGETS, JSON.stringify(local));

    const client = DB.getClient();
    if (client && navigator.onLine) {
      try {
        const { error, status } = await client.from("budgets").delete().eq("id", id);
        if (error) {
          console.error(`[PapaSys Sync] Erro ao deletar budget ${id}: Status HTTP ${status} - ${error.message}`);
          if (typeof PapaSysSync !== "undefined") {
            await PapaSysSync.enqueueItem("budgets", { id }, "delete");
          }
        }
      } catch (e) {
        if (typeof PapaSysSync !== "undefined") {
          await PapaSysSync.enqueueItem("budgets", { id }, "delete");
        }
      }
    } else if (typeof PapaSysSync !== "undefined") {
      await PapaSysSync.enqueueItem("budgets", { id }, "delete");
    }
    return true;
  },

  // 8. Obter orçamentos locais
  getLocalBudgets() {
    try {
      const stored = localStorage.getItem(DB.STORAGE_KEY_BUDGETS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn("[DB] Erro ao carregar orçamentos locais:", e);
    }
    return [];
  }
};
