// ==============================================================================
// CAMADA DE DADOS E INTEGRAÇÃO SUPABASE - PAPASYS
// ==============================================================================

const DB = {
  STORAGE_KEY_PROJECTS: "papasys_local_projects",
  STORAGE_KEY_PRICES: "papasys_local_prices",

  // Garante que o cliente Supabase esteja inicializado
  getClient() {
    if (!supabaseClient && window.supabase) {
      try {
        supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
        console.log("[DB] Supabase inicializado com sucesso sob demanda.");
      } catch (e) {
        console.error("[DB] Erro ao criar cliente Supabase:", e);
      }
    }
    return supabaseClient;
  },

  // 1. Obter todos os projetos
  async getProjects() {
    const client = DB.getClient();
    if (client) {
      try {
        const { data, error } = await client
          .from("projects")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          // Se o banco retornou dados, salva cópia no localStorage para cache offline
          if (data.length > 0) {
            localStorage.setItem(DB.STORAGE_KEY_PROJECTS, JSON.stringify(data));
          }
          return data;
        }
        if (error) {
          console.warn("[DB Supabase] Erro ao consultar projetos:", error.message);
        }
      } catch (e) {
        console.warn("[DB Supabase] Exceção ao consultar Supabase:", e);
      }
    }
    return DB.getLocalProjects();
  },

  // 2. Obter projeto por ID
  async getProjectById(id) {
    const client = DB.getClient();
    if (client) {
      try {
        const { data: project, error: pErr } = await client
          .from("projects")
          .select("*")
          .eq("id", id)
          .single();

        if (!pErr && project) {
          const { data: items } = await client
            .from("project_items")
            .select("*")
            .eq("project_id", id);

          project.items = items || [];
          return project;
        }
      } catch (e) {
        console.warn("[DB] Erro ao buscar projeto no Supabase:", e);
      }
    }

    const local = DB.getLocalProjects().find(p => p.id === id);
    if (local) local.items = local.items || [];
    return local || null;
  },

  // 3. Criar novo projeto
  async createProject(projectData, items = []) {
    let newProject = null;
    const client = DB.getClient();

    if (client) {
      try {
        const { data, error } = await client
          .from("projects")
          .insert([projectData])
          .select()
          .single();

        if (!error && data) {
          newProject = data;
          if (items.length > 0) {
            const itemsWithId = items.map(it => ({ ...it, project_id: data.id }));
            await client.from("project_items").insert(itemsWithId);
            newProject.items = itemsWithId;
          }
          return newProject;
        }
      } catch (e) {
        console.warn("[DB] Falha no insert do Supabase:", e);
      }
    }

    newProject = {
      ...projectData,
      id: projectData.id || "proj_" + Date.now(),
      created_at: new Date().toISOString(),
      items: items
    };
    const list = DB.getLocalProjects();
    list.unshift(newProject);
    localStorage.setItem(DB.STORAGE_KEY_PROJECTS, JSON.stringify(list));
    return newProject;
  },

  // 4. Atualizar status do projeto (Kanban)
  async updateStatus(id, newStatus) {
    const client = DB.getClient();
    if (client) {
      try {
        const { error } = await client
          .from("projects")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (!error) return true;
      } catch (e) {
        console.warn("[DB] Erro ao atualizar status no Supabase:", e);
      }
    }

    const list = DB.getLocalProjects();
    const p = list.find(it => it.id === id);
    if (p) {
      p.status = newStatus;
      p.updated_at = new Date().toISOString();
      localStorage.setItem(DB.STORAGE_KEY_PROJECTS, JSON.stringify(list));
      return true;
    }
    return false;
  },

  // 5. Atualizar projeto e itens
  async updateProject(id, projectData, items = []) {
    const client = DB.getClient();
    if (client) {
      try {
        await client
          .from("projects")
          .update({ ...projectData, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (items && items.length > 0) {
          await client.from("project_items").delete().eq("project_id", id);
          const itemsWithId = items.map(it => ({
            project_id: id,
            category: it.category,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            unit_cost: it.unit_cost,
            waste_percent: it.waste_percent || 0,
            total_cost: it.total_cost
          }));
          await client.from("project_items").insert(itemsWithId);
        }
        return true;
      } catch (e) {
        console.warn("[DB] Erro no update do Supabase:", e);
      }
    }

    const list = DB.getLocalProjects();
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...projectData, items: items, updated_at: new Date().toISOString() };
      localStorage.setItem(DB.STORAGE_KEY_PROJECTS, JSON.stringify(list));
      return true;
    }
    return false;
  },

  // 6. Deletar projeto
  async deleteProject(id) {
    const client = DB.getClient();
    if (client) {
      try {
        await client.from("projects").delete().eq("id", id);
      } catch (e) {
        console.warn("[DB] Erro ao deletar no Supabase:", e);
      }
    }

    const list = DB.getLocalProjects().filter(p => p.id !== id);
    localStorage.setItem(DB.STORAGE_KEY_PROJECTS, JSON.stringify(list));
    return true;
  },

  // 7. Tabela de Preços Unitários
  async getPriceTable() {
    const client = DB.getClient();
    if (client) {
      try {
        const { data, error } = await client
          .from("price_table")
          .select("*")
          .order("category");

        if (!error && data && data.length > 0) {
          return data;
        }
      } catch (e) {
        console.warn("[DB] Falha ao carregar tabela de preços do Supabase:", e);
      }
    }

    let localPrices = localStorage.getItem(DB.STORAGE_KEY_PRICES);
    if (!localPrices) {
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
      localStorage.setItem(DB.STORAGE_KEY_PRICES, JSON.stringify(defaultPrices));
      return defaultPrices;
    }
    return JSON.parse(localPrices);
  },

  getLocalProjects() {
    const raw = localStorage.getItem(DB.STORAGE_KEY_PROJECTS);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  // Monitoramento em tempo real (Supabase Realtime + Polling de segurança)
  listenRealtime(onInsertCallback) {
    const client = DB.getClient();
    if (client && client.channel) {
      try {
        client
          .channel("public:projects")
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects" }, payload => {
            console.log("[Supabase Realtime] Novo projeto recebido do SketchUp:", payload.new);
            if (onInsertCallback) onInsertCallback(payload.new);
          })
          .subscribe();
      } catch (e) {
        console.warn("[DB] Erro ao conectar canal Realtime:", e);
      }
    }

    // Polling de segurança a cada 4 segundos: garante que atualiza mesmo em file:// sem WebSockets
    let ultimoTotal = -1;
    setInterval(async () => {
      const projetos = await DB.getProjects();
      if (ultimoTotal !== -1 && projetos.length > ultimoTotal) {
        console.log("[Polling] Novo projeto detectado no Supabase!");
        if (onInsertCallback) onInsertCallback(projetos[0]);
      }
      ultimoTotal = projetos.length;
    }, 4000);
  }
};
