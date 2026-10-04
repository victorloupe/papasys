// ==============================================================================
// SISTEMA DE AUTENTICAÇÃO E PERMISSÕES iGUi
// Divisões: iGUi Sob Medida | iGUi Incorporadora | iGUi Internacional
// Páginas: Prévia | Galga | Desenho Técnico
// ==============================================================================

const Auth = {
  STORAGE_KEY_CURRENT_USER: "igui_current_user",
  STORAGE_KEY_USERS_LIST: "igui_users_list",

  // Usuários padrão do sistema
  DEFAULT_USERS: [
    {
      id: "77b65d92-3aa2-47a6-9dbb-033fd48f7b30",
      name: "Administrador (PapaSys)",
      email: "admin@papa.com",
      role: "admin", // Administrador: acesso total às 3 divisões e todas as etapas
      allowed_divisions: ["sob_medida", "incorporadora", "internacional"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#0284c7",
      active: true
    },
    {
      id: "a0f528a8-ce32-4f4e-85b1-6c15612fda18",
      name: "Victor Lourenço",
      email: "usuario@papa.com",
      role: "user", // Usuário comum: apenas iGUi Sob Medida
      allowed_divisions: ["sob_medida"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#f97316",
      active: true
    },
    {
      id: "usr-admin-1",
      name: "Administrador / Diretor",
      email: "diretoria@igui.com",
      role: "admin",
      allowed_divisions: ["sob_medida", "incorporadora", "internacional"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#0284c7",
      active: true
    },
    {
      id: "usr-victor-2",
      name: "Victor Lourenço (iGUi)",
      email: "victor@igui.com",
      role: "user",
      allowed_divisions: ["sob_medida"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#f97316",
      active: true
    },
    {
      id: "usr-incorporadora-3",
      name: "Engenharia Incorporadora",
      email: "incorporadora@igui.com",
      role: "user",
      allowed_divisions: ["incorporadora"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#10b981",
      active: true
    },
    {
      id: "usr-internacional-4",
      name: "Comercial Internacional",
      email: "internacional@igui.com",
      role: "user",
      allowed_divisions: ["internacional"],
      allowed_stages: ["previa", "galga", "desenho_tecnico"],
      avatar_color: "#8b5cf6",
      active: true
    }
  ],

  // 1. Obter usuário logado atual
  getCurrentUser() {
    try {
      const stored = localStorage.getItem(Auth.STORAGE_KEY_CURRENT_USER);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[Auth] Erro ao carregar usuário ativo:", e);
    }
    // Padrão inicial para desenvolvimento se não houver sessão ativa
    return null;
  },

  isLoggedIn() {
    return !!Auth.getCurrentUser();
  },

  // Login de Usuário (Valida e define sessão ativa)
  async login(email, password = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    const users = Auth.getAllUsers();
    const user = users.find(u => (u.email || "").toLowerCase() === cleanEmail);

    if (!user) {
      return { success: false, message: "Usuário não encontrado. Verifique o e-mail informado." };
    }

    if (user.active === false) {
      return { success: false, message: "Este usuário está inativo no sistema." };
    }

    Auth.setCurrentUser(user);
    return { success: true, user };
  },

  // Logout / Encerrar Sessão
  logout() {
    try {
      localStorage.removeItem(Auth.STORAGE_KEY_CURRENT_USER);
    } catch (e) {}
    window.location.href = "login.html";
  },

  // 2. Definir usuário logado atual
  setCurrentUser(user) {
    if (!user) return;
    try {
      localStorage.setItem(Auth.STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
      window.dispatchEvent(new CustomEvent("igui-user-changed", { detail: user }));
    } catch (e) {
      console.error("[Auth] Erro ao salvar usuário ativo:", e);
    }
  },

  // 3. Obter todos os usuários cadastrados
  getAllUsers() {
    try {
      const stored = localStorage.getItem(Auth.STORAGE_KEY_USERS_LIST);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.some(u => u.email === "admin@papa.com")) return parsed;
      }
    } catch (e) {
      console.warn("[Auth] Erro ao carregar lista de usuários:", e);
    }
    // Inicializa com os usuários padrão atualizados (incluindo admin@papa.com e usuario@papa.com)
    localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(Auth.DEFAULT_USERS));
    return Auth.DEFAULT_USERS;
  },

  // 4. Salvar ou atualizar usuário (Somente Admin)
  saveUser(userData) {
    const users = Auth.getAllUsers();
    let updatedUsers;

    const formattedUser = {
      ...userData,
      allowed_divisions: Array.isArray(userData.allowed_divisions) && userData.allowed_divisions.length > 0 
        ? userData.allowed_divisions 
        : ["sob_medida"],
      allowed_stages: Array.isArray(userData.allowed_stages) && userData.allowed_stages.length > 0
        ? userData.allowed_stages
        : ["previa", "galga", "desenho_tecnico"],
      avatar_color: userData.avatar_color || "#0284c7",
      active: userData.active !== false
    };

    if (formattedUser.id) {
      // Atualizar existente
      updatedUsers = users.map(u => u.id === formattedUser.id ? { ...u, ...formattedUser } : u);
    } else {
      // Criar novo
      formattedUser.id = "usr-" + Date.now();
      updatedUsers = [...users, formattedUser];
    }

    localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(updatedUsers));
    
    // Se editou o usuário ativo no momento, atualiza a sessão
    const current = Auth.getCurrentUser();
    if (current && current.id === formattedUser.id) {
      Auth.setCurrentUser({ ...current, ...formattedUser });
    } else {
      window.dispatchEvent(new CustomEvent("igui-user-changed", { detail: Auth.getCurrentUser() }));
    }

    // Tenta sincronizar com Supabase se a tabela app_users existir
    Auth.syncUserToSupabase(formattedUser);

    return updatedUsers;
  },

  // 5. Excluir usuário
  deleteUser(userId) {
    const current = Auth.getCurrentUser();
    if (current && current.id === userId) {
      if (typeof PapaSysDialog !== "undefined") {
        PapaSysDialog.alert({
          title: "Ação não permitida",
          message: "Você não pode excluir o usuário atualmente conectado na sessão.",
          type: "warning"
        });
      }
      return false;
    }

    const users = Auth.getAllUsers().filter(u => u.id !== userId);
    localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(users));

    if (window.supabaseClient) {
      window.supabaseClient.from("app_users").delete().eq("id", userId).then().catch(() => {});
    }
    window.dispatchEvent(new CustomEvent("igui-user-changed", { detail: Auth.getCurrentUser() }));
    return true;
  },

  // Restaurar usuários padrão da fábrica
  resetDefaultUsers() {
    localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(Auth.DEFAULT_USERS));
    const current = Auth.getCurrentUser();
    if (!Auth.DEFAULT_USERS.some(u => u.id === current.id)) {
      Auth.setCurrentUser(Auth.DEFAULT_USERS[0]);
    } else {
      window.dispatchEvent(new CustomEvent("igui-user-changed", { detail: Auth.getCurrentUser() }));
    }
    return Auth.DEFAULT_USERS;
  },

  getUserById(id) {
    return Auth.getAllUsers().find(u => u.id === id) || null;
  },

  // 6. Verificações de Permissões
  isAdmin() {
    const user = Auth.getCurrentUser();
    return user && user.role === "admin";
  },

  canAccessDivision(division) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    if (user.role === "admin") return true; // Administrador acessa todas as divisões
    const allowed = user.allowed_divisions || [];
    return allowed.includes(division);
  },

  canAccessStage(stage) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    if (user.role === "admin") return true; // Administrador acessa todas as páginas
    const allowed = user.allowed_stages || ["previa", "galga", "desenho_tecnico"];
    return allowed.includes(stage);
  },

  // 7. Sincronização com Supabase (background silencioso)
  async syncWithSupabase() {
    if (!window.supabaseClient) return;
    try {
      const { data, error } = await window.supabaseClient
        .from("app_users")
        .select("*")
        .order("name", { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(data));
      }
    } catch (e) {
      // Silencioso se a tabela ainda não existir no Supabase
    }
  },

  async syncUserToSupabase(userData) {
    if (!window.supabaseClient) return;
    try {
      await window.supabaseClient
        .from("app_users")
        .upsert([userData], { onConflict: "email" });
    } catch (e) {
      // Silencioso
    }
  },

  // 8. Atualiza todos os componentes de perfil de usuário na interface
  updateUserUI() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const isAdmin = Auth.isAdmin();

    const parts = (user.name || "U").trim().split(" ");
    const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    const roleText = isAdmin ? "Diretoria / Admin" : "Projetista";
    const roleClass = `badge-user-role ${isAdmin ? 'admin' : ''}`;

    // Atualiza avatares
    document.querySelectorAll(".user-profile-avatar").forEach(el => {
      el.textContent = initials;
      if (user.avatar_color) el.style.background = user.avatar_color;
    });

    // Atualiza nomes
    document.querySelectorAll(".user-profile-name").forEach(el => {
      el.textContent = user.name;
    });

    // Atualiza cargos/badges
    document.querySelectorAll(".badge-user-role").forEach(el => {
      el.textContent = roleText;
      el.className = roleClass;
    });
  }
};

// Sincronização inicial e registro de eventos de interface
Auth.syncWithSupabase();

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Auth.updateUserUI());
  } else {
    Auth.updateUserUI();
  }
  window.addEventListener("igui-user-changed", () => Auth.updateUserUI());
}
