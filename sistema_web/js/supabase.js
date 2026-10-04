// ==============================================================================
// CAMADA DE DADOS E INTEGRAÇÃO SUPABASE - SISTEMA DE ORÇAMENTOS iGUi
// Divisões: iGUi Sob Medida | iGUi Incorporadora | iGUi Internacional
// Fluxo por Páginas: Prévia -> Galga (pré-venda) -> Desenho Técnico (venda)
// ==============================================================================

const DB = {
  STORAGE_KEY_BUDGETS: "igui_budgets_data",
  STORAGE_KEY_POOLS: "igui_pools_data",
  STORAGE_KEY_TECH_ITEMS: "igui_tech_items_data",

  // 1. Obter cliente Supabase
  getClient() {
    if (!supabaseClient && window.supabase) {
      try {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      } catch (e) {
        console.warn("[DB] Erro ao instanciar Supabase:", e);
      }
    }
    return supabaseClient;
  },

  // 2. Obter orçamentos (com filtro opcional por divisão e etapa)
  async getBudgets(division = null, stage = null) {
    let allBudgets = [];
    const client = DB.getClient();

    if (client) {
      try {
        let query = client.from("budgets").select("*").order("created_at", { ascending: false });
        if (division) query = query.eq("division", division);
        if (stage) query = query.eq("stage", stage);

        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          // Busca os modelos de cada orçamento
          for (let b of data) {
            const { data: pools } = await client.from("budget_pools").select("*").eq("budget_id", b.id);
            b.pools = pools || [];
          }
          localStorage.setItem(DB.STORAGE_KEY_BUDGETS, JSON.stringify(data));
          allBudgets = data;
        }
      } catch (e) {
        console.warn("[DB] Supabase budgets fallback para local:", e);
      }
    }

    if (allBudgets.length === 0) {
      allBudgets = DB.getLocalBudgets();
    }

    // Filtragem local conforme divisão e etapa ativas
    let filtered = allBudgets;
    if (division) {
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

    if (client) {
      try {
        const { data: b, error } = await client.from("budgets").select("*").eq("id", id).single();
        if (!error && b) {
          const { data: pools } = await client.from("budget_pools").select("*").eq("budget_id", id);
          b.pools = pools || [];
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

    // Normaliza os pools garantindo UUIDs válidos e removendo calc anterior
    const normalizedPools = (pools || []).map((p, idx) => {
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

    // Salva no LocalStorage
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

    // Sincroniza com Supabase se disponível
    const client = DB.getClient();
    if (client) {
      try {
        const allowedBudgetCols = [
          "id", "budget_code", "client_name", "project_name", "division", 
          "stage", "status", "assigned_user_id", "assigned_user_name", 
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

        const { error: bErr } = await client.from("budgets").upsert([budgetPayload]);
        if (bErr) {
          console.warn("[DB] Erro no upsert de budget Supabase:", bErr);
        }

        if (fullBudget.pools && fullBudget.pools.length > 0) {
          const allowedPoolCols = [
            "id", "budget_id", "model_name", "units_count", "pool_type",
            "structure_type", "coating_type", "has_mold", "mold_auto",
            "internal_area_m2", "lamination_area_m2", "internal_volume_m3",
            "internal_volume_liters", "linear_corners_m", "alive_corners_count"
          ];
          const poolsPayload = fullBudget.pools.map(p => {
            const row = {};
            for (const col of allowedPoolCols) {
              if (p[col] !== undefined) row[col] = p[col];
            }
            return row;
          });
          const { error: pErr } = await client.from("budget_pools").upsert(poolsPayload);
          if (pErr) {
            console.warn("[DB] Erro no upsert de budget_pools Supabase:", pErr);
          }
        }
      } catch (e) {
        console.warn("[DB] Falha no upsert Supabase:", e);
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

    // Recalcula totais com base na nova margem da etapa (+5% Prévia, 0% Galga/Desenho Técnico)
    const updatedBudget = await DB.saveBudget(budget, budget.pools || []);
    return updatedBudget;
  },

  // 6. Atribuir Responsável ("Visualiza quem está fazendo o quê" - Seção 3)
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
  // Permite desmembrar quantidades de múltiplos modelos ao mesmo tempo em um lote.
  // Ex: 2 do Modelo A + 1 do Modelo B -> criam juntos um novo orçamento filho.
  // ==============================================================================
  async splitBudgetMulti(budgetId, itemsToMove = [], options = {}) {
    // 1. Obter orçamento original
    const originalBudget = await DB.getBudgetById(budgetId);
    if (!originalBudget || !originalBudget.pools || originalBudget.pools.length === 0) {
      console.error("[DB] Orçamento original não encontrado ou sem piscinas:", budgetId);
      return null;
    }

    // 2. Validação dos itens a mover
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

    // Checa se as unidades selecionadas não ultrapassam as unidades disponíveis
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
        // Todas as unidades deste modelo foram transferidas
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

    // Validação: o orçamento original não pode ficar completamente vazio (0 unidades no total)
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

    // 3. Deleta do Supabase os modelos que foram 100% transferidos para o novo orçamento
    const client = DB.getClient();
    if (client && poolsToDeleteFromDb.length > 0) {
      try {
        await client.from("budget_pools").delete().in("id", poolsToDeleteFromDb);
      } catch (e) {
        console.warn("[DB] Erro ao deletar pools transferidos:", e);
      }
    }

    // 4. Salva o orçamento original com as unidades remanescentes
    originalBudget.pools = remainingPools;
    const updatedSource = await DB.saveBudget(originalBudget, remainingPools);

    // 5. Criação do novo orçamento com os modelos desmembrados
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

  // Suporte retrocompatível para desmembrar um único modelo
  async splitBudgetUnits(budgetId, poolId, unitsToMove, destinationBudgetId = null) {
    return await DB.splitBudgetMulti(budgetId, [{ poolId, unitsToMove }]);
  },

  // 7. Excluir orçamento
  async deleteBudget(id) {
    const local = DB.getLocalBudgets().filter(b => b.id !== id);
    localStorage.setItem(DB.STORAGE_KEY_BUDGETS, JSON.stringify(local));

    const client = DB.getClient();
    if (client) {
      try {
        await client.from("budgets").delete().eq("id", id);
      } catch (e) {
        // Silencioso
      }
    }
    return true;
  },

  // 8. Obter orçamentos salvos (sem dados mockados no front-end)
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
