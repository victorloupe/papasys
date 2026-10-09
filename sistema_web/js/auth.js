// ==============================================================================
// SISTEMA DE AUTENTICAÇÃO E PERMISSÕES SUPABASE (SEÇÃO 12)
// Divisões: iGUi Sob Medida | iGUi Incorporadora | iGUi Internacional
// ==============================================================================

const Auth = {
  STORAGE_KEY_CURRENT_USER: "igui_current_user",
  STORAGE_KEY_USERS_LIST: "igui_users_list",

  // 1. Obter usuário logado atual
  getCurrentUser() {
    try {
      const stored = localStorage.getItem(Auth.STORAGE_KEY_CURRENT_USER);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[Auth] Erro ao carregar usuário ativo do cache:", e);
    }
    return null;
  },

  isLoggedIn() {
    return !!Auth.getCurrentUser();
  },

  // 2. Definir usuário logado atual
  setCurrentUser(user) {
    if (!user) {
      localStorage.removeItem(Auth.STORAGE_KEY_CURRENT_USER);
      return;
    }
    try {
      localStorage.setItem(Auth.STORAGE_KEY_CURRENT_USER, JSON.stringify(user));
      window.dispatchEvent(new CustomEvent("igui-user-changed", { detail: user }));
    } catch (e) {
      console.error("[Auth] Erro ao salvar usuário ativo:", e);
    }
  },

  // 3. Inicialização e Monitoramento de Sessão (Seção 12.2)
  init() {
    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (!client || !client.auth) return;

    // Escuta mudanças de estado de autenticação (expiração, logout, refresh)
    client.auth.onAuthStateChange(async (event, session) => {
      console.log("[Auth] Evento de autenticação:", event);

      if (event === "SIGNED_OUT") {
        localStorage.removeItem(Auth.STORAGE_KEY_CURRENT_USER);
        const path = window.location.pathname.toLowerCase();
        if (!path.includes("login.html") && !path.includes("redefinir-senha.html")) {
          console.warn("[Auth] Sessão encerrada. Redirecionando para login...");
          window.location.href = "login.html";
        }
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session && session.user) {
          await Auth.loadAndSetUserProfile(session.user);
        }
      }
    });
  },

  // Carrega os dados de perfil da tabela app_users vinculados ao auth.users
  async loadAndSetUserProfile(authUser) {
    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (!client || !authUser) return null;

    try {
      const { data, error } = await client
        .from("app_users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      let profile = null;
      if (!error && data) {
        profile = data;
      } else {
        // Tenta buscar por e-mail
        const { data: byEmail } = await client
          .from("app_users")
          .select("*")
          .eq("email", authUser.email.toLowerCase())
          .single();

        if (byEmail) {
          profile = byEmail;
        } else {
          // Cria perfil fallback a partir dos metadados da sessão
          profile = {
            id: authUser.id,
            name: authUser.user_metadata?.name || authUser.email.split("@")[0],
            email: authUser.email,
            role: authUser.user_metadata?.role || "user",
            allowed_divisions: authUser.user_metadata?.allowed_divisions || ["sob_medida"],
            allowed_stages: authUser.user_metadata?.allowed_stages || ["previa", "galga", "desenho_tecnico"],
            avatar_color: authUser.user_metadata?.avatar_color || "#f97316",
            active: true
          };
        }
      }

      if (profile) {
        Auth.setCurrentUser(profile);
        return profile;
      }
    } catch (e) {
      console.warn("[Auth] Falha ao consultar app_users:", e);
    }
    return null;
  },

  // 4. Guarda de Proteção das Páginas (Seção 12.2)
  // Verifica se há sessão ativa. Sem sessão -> redireciona para login.html
  async requireAuth() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("login.html") || path.includes("redefinir-senha.html")) {
      return null;
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    let session = null;

    if (client && client.auth) {
      try {
        const { data } = await client.auth.getSession();
        session = data ? data.session : null;
      } catch (e) {
        console.warn("[Auth] Erro ao consultar sessão Supabase:", e);
      }
    }

    // Se temos sessão do Supabase ativa
    if (session && session.user) {
      let currentUser = Auth.getCurrentUser();
      if (!currentUser || currentUser.id !== session.user.id) {
        currentUser = await Auth.loadAndSetUserProfile(session.user);
      }

      // Se o usuário estiver inativo, encerra a sessão
      if (currentUser && currentUser.active === false) {
        console.warn("[Auth] Usuário inativo detectado na verificação da página.");
        await Auth.logout();
        return null;
      }

      return currentUser;
    }

    // Se estiver estritamente offline mas temos usuário em cache válido anteriormente
    if (!navigator.onLine) {
      const cached = Auth.getCurrentUser();
      if (cached && cached.active !== false) {
        console.log("[Auth] Modo Offline: Mantendo sessão em cache para", cached.name);
        return cached;
      }
    }

    // Sem sessão ativa: redireciona imediatamente para tela de login
    console.warn("[Auth] Nenhuma sessão ativa encontrada. Redirecionando para login.html...");
    window.location.href = "login.html";
    return null;
  },

  // 5. Login de Usuário (Seção 12.1)
  // Usa supabase.auth.signInWithPassword com mensagens claras de erro
  async login(email, password = "") {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPassword = (password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      return { success: false, message: "Informe o e-mail e a senha de acesso." };
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);

    if (!navigator.onLine) {
      return { success: false, message: "Sem conexão com a internet. Não foi possível autenticar." };
    }

    if (!client || !client.auth) {
      return { success: false, message: "Serviço de autenticação não inicializado. Recarregue a página." };
    }

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword
      });

      if (error) {
        console.warn("[Auth] Erro retornado pelo Supabase Auth:", error);
        let userFriendlyMsg = "E-mail ou senha incorretos.";
        const msg = (error.message || "").toLowerCase();

        if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
          userFriendlyMsg = "E-mail ou senha incorretos. (Dica: Se esta é a primeira instalação, execute o script 'supabase_rls_and_auth.sql' no SQL Editor do Supabase).";
        } else if (msg.includes("email not confirmed")) {
          userFriendlyMsg = "Seu e-mail ainda não foi confirmado. Verifique a caixa de entrada.";
        } else if (msg.includes("network") || msg.includes("failed to fetch")) {
          userFriendlyMsg = "Sem conexão com o servidor Supabase. Verifique sua rede corporativa ou proxy.";
        } else if (msg.includes("too many requests")) {
          userFriendlyMsg = "Muitas tentativas sem sucesso. Aguarde alguns instantes antes de tentar novamente.";
        } else {
          userFriendlyMsg = error.message;
        }

        return { success: false, message: userFriendlyMsg };
      }

      if (!data || !data.user) {
        return { success: false, message: "Falha na resposta do servidor. Tente novamente." };
      }

      // Busca dados de perfil e checa se usuário está ativo
      let profile = await Auth.loadAndSetUserProfile(data.user);

      if (profile && profile.active === false) {
        await client.auth.signOut();
        localStorage.removeItem(Auth.STORAGE_KEY_CURRENT_USER);
        return { success: false, message: "Este usuário está inativo no sistema. Entre em contato com o administrador." };
      }

      // Se perfil não foi encontrado na tabela, monta perfil padrão
      if (!profile) {
        profile = {
          id: data.user.id,
          name: data.user.user_metadata?.name || cleanEmail.split("@")[0],
          email: cleanEmail,
          role: data.user.user_metadata?.role || "user",
          allowed_divisions: data.user.user_metadata?.allowed_divisions || ["sob_medida"],
          allowed_stages: ["previa", "galga", "desenho_tecnico"],
          avatar_color: "#0284c7",
          active: true
        };
        Auth.setCurrentUser(profile);
      }

      // Seção 12.1: Determinar destino após login
      // Redireciona para a primeira divisão liberada (ou Dashboard se Admin)
      let redirectUrl = "index.html";
      if (profile.role === "admin") {
        redirectUrl = "index.html?divisao=dashboard_geral";
      } else {
        const firstDiv = (profile.allowed_divisions && profile.allowed_divisions.length > 0)
          ? profile.allowed_divisions[0]
          : "sob_medida";
        redirectUrl = `index.html?divisao=${firstDiv}`;
      }

      return { success: true, user: profile, redirectUrl };

    } catch (err) {
      console.error("[Auth] Exceção durante o login:", err);
      return { success: false, message: "Erro de conexão com o servidor. Verifique seu firewall ou tente novamente." };
    }
  },

  // 6. Logout / Encerrar Sessão (Seção 12.2)
  async logout() {
    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    try {
      if (client && client.auth) {
        await client.auth.signOut();
      }
    } catch (e) {
      console.warn("[Auth] Erro no signOut Supabase:", e);
    }
    localStorage.removeItem(Auth.STORAGE_KEY_CURRENT_USER);
    window.location.href = "login.html";
  },

  // 7. Esqueci minha Senha (Seção 12.1)
  // Envia e-mail de redefinição redirecionando para redefinir-senha.html
  async resetPasswordForEmail(email) {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: "Informe seu e-mail para receber o link de redefinição." };
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (!client || !client.auth) {
      return { success: false, message: "Cliente Supabase indisponível." };
    }

    try {
      // Constrói URL absoluta correta para redefinir-senha.html
      const currentLoc = window.location.href;
      const baseDir = currentLoc.substring(0, currentLoc.lastIndexOf("/"));
      const redirectTo = `${baseDir}/redefinir-senha.html`;

      const { error } = await client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectTo
      });

      if (error) {
        console.warn("[Auth] Erro no resetPasswordForEmail:", error);
        return { success: false, message: error.message || "Erro ao solicitar redefinição." };
      }

      return { success: true, message: "Link de redefinição enviado com sucesso! Verifique sua caixa de entrada de e-mail." };
    } catch (e) {
      console.error("[Auth] Exceção no reset de senha:", e);
      return { success: false, message: "Erro ao conectar com o serviço de e-mail." };
    }
  },

  // 8. Alterar Senha (Seção 12.3)
  // supabase.auth.updateUser({ password }) - Mínimo 8 caracteres
  async updatePassword(newPassword) {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: "A nova senha deve ter no mínimo 8 caracteres." };
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (!client || !client.auth) {
      return { success: false, message: "Cliente Supabase indisponível." };
    }

    try {
      const { data, error } = await client.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, message: error.message || "Falha ao alterar senha." };
      }
      return { success: true, message: "Senha alterada com sucesso!", user: data.user };
    } catch (e) {
      return { success: false, message: `Erro ao atualizar senha: ${e.message}` };
    }
  },

  // 8.1 Alterar Nome de Exibição do Perfil (Refletido em todo o sistema)
  async updateProfileName(newName) {
    if (!newName || !newName.trim()) {
      return { success: false, message: "O nome não pode estar vazio." };
    }
    const cleanName = newName.trim();
    const currentUser = Auth.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "Nenhum usuário logado na sessão." };
    }

    currentUser.name = cleanName;
    Auth.setCurrentUser(currentUser);

    // 1. Atualizar Supabase Auth user_metadata
    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (client && client.auth) {
      try {
        await client.auth.updateUser({
          data: { name: cleanName }
        });
      } catch (e) {
        console.warn("[Auth] Erro ao sincronizar nome com user_metadata:", e);
      }
    }

    // 2. Atualizar tabela app_users no banco de dados Supabase
    if (client) {
      try {
        await client.from("app_users").update({ name: cleanName }).eq("id", currentUser.id);
      } catch (e) {
        console.warn("[Auth] Erro ao atualizar tabela app_users:", e);
      }
    }

    // 3. Atualizar lista em cache local
    try {
      const allUsers = Auth.getUsers();
      const idx = allUsers.findIndex(u => u.id === currentUser.id || u.email.toLowerCase() === currentUser.email.toLowerCase());
      if (idx !== -1) {
        allUsers[idx].name = cleanName;
        localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(allUsers));
      }
    } catch (_e) {}

    // 4. Propagar atualização em tempo real para toda a interface
    Auth.updateUserUI();
    window.dispatchEvent(new CustomEvent("igui-user-changed", { detail: currentUser }));
    window.dispatchEvent(new CustomEvent("papasys-user-changed", { detail: currentUser }));

    return { success: true, message: "Nome atualizado com sucesso!", user: currentUser };
  },

  // 9. Criação de Usuário pelo Admin via Supabase Edge Function ou Vercel API (Seção 12.4)
  // A service_role key nunca aparece no frontend
  async adminCreateUser(userData, password) {
    if (!Auth.isAdmin()) {
      return { success: false, message: "Apenas administradores podem cadastrar novos usuários." };
    }

    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (!client) {
      return { success: false, message: "Cliente de banco de dados indisponível." };
    }

    const payload = {
      name: userData.name,
      email: userData.email,
      password: password,
      role: userData.role || "user",
      allowed_divisions: userData.allowed_divisions || ["sob_medida"],
      allowed_stages: userData.allowed_stages || ["previa", "galga", "desenho_tecnico"],
      avatar_color: userData.avatar_color || "#f97316",
      active: userData.active !== false
    };

    // 1ª Tentativa: Invocar Supabase Edge Function 'create-user'
    try {
      const { data, error } = await client.functions.invoke("create-user", {
        body: payload
      });

      if (!error && data && data.success) {
        Auth.syncWithSupabase();
        return { success: true, user: data.user };
      }

      if (error && error.message && !error.message.includes("FunctionsFetchError")) {
        return { success: false, message: error.message };
      }
    } catch (e) {
      console.warn("[Auth] Supabase Edge Function indisponível. Tentando rota Vercel API /api/create-user...", e);
    }

    // 2ª Tentativa: Rota Serverless Vercel /api/create-user
    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token || "";

      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        Auth.syncWithSupabase();
        return { success: true, user: data.user };
      }
      const errData = await res.json().catch(() => ({}));
      return { success: false, message: errData.error || `Erro HTTP ${res.status} ao criar usuário.` };
    } catch (e) {
      return { success: false, message: `Não foi possível contatar o serviço de criação de usuários: ${e.message}` };
    }
  },

  // 10. Gestão de Usuários (Salvar, Desativar, Reativar)
  async saveUser(userData) {
    const formattedUser = {
      ...userData,
      allowed_divisions: Array.isArray(userData.allowed_divisions) && userData.allowed_divisions.length > 0 
        ? userData.allowed_divisions 
        : ["sob_medida"],
      allowed_stages: Array.isArray(userData.allowed_stages) && userData.allowed_stages.length > 0
        ? userData.allowed_stages
        : ["previa", "galga", "desenho_tecnico"],
      avatar_color: userData.avatar_color || "#0284c7",
      active: userData.active !== false,
      updated_at: new Date().toISOString()
    };

    // Atualiza localmente
    const users = Auth.getAllUsers();
    let updatedUsers;
    if (formattedUser.id) {
      updatedUsers = users.map(u => u.id === formattedUser.id ? { ...u, ...formattedUser } : u);
    } else {
      formattedUser.id = DB.generateUUID();
      updatedUsers = [...users, formattedUser];
    }
    localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(updatedUsers));

    // Se editou o usuário ativo na sessão atual, atualiza
    const current = Auth.getCurrentUser();
    if (current && current.id === formattedUser.id) {
      Auth.setCurrentUser({ ...current, ...formattedUser });
    }

    // Sincroniza com Supabase
    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (client && navigator.onLine) {
      try {
        await client.from("app_users").upsert([formattedUser]);
      } catch (e) {
        console.warn("[Auth] Erro ao sincronizar app_users com Supabase:", e);
      }
    }

    return updatedUsers;
  },

  // Alternar Status Ativo / Inativo
  async toggleUserActive(userId, active) {
    const user = Auth.getUserById(userId);
    if (!user) return false;
    user.active = !!active;
    await Auth.saveUser(user);
    return true;
  },

  // Enviar link de redefinição para usuário específico (Admin)
  async sendPasswordResetToUser(email) {
    return await Auth.resetPasswordForEmail(email);
  },

  // 11. Lista de Usuários e Permissões
  // 11. Lista de Usuários e Permissões
  getAllUsers() {
    try {
      const stored = localStorage.getItem(Auth.STORAGE_KEY_USERS_LIST);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Purga contas fantasmas antigas que não existem no banco Supabase
          const validUsers = parsed.filter(u => 
            u && u.email && 
            u.email !== "internacional@papa.com" && 
            u.email !== "incorporadora@papa.com"
          );
          if (validUsers.length !== parsed.length) {
            localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(validUsers));
          }
          if (validUsers.length > 0) return validUsers;
        }
      }
    } catch (e) {}

    // Fallback padrão estrito com apenas os 2 usuários oficiais cadastrados no Supabase
    return [
      {
        id: "77b65d92-3aa2-47a6-9dbb-033fd48f7b30",
        name: "Administrador (iGUi)",
        email: "admin@papa.com",
        role: "admin",
        allowed_divisions: ["sob_medida", "incorporadora", "internacional"],
        allowed_stages: ["previa", "galga", "desenho_tecnico"],
        avatar_color: "#0284c7",
        active: true
      },
      {
        id: "a0f528a8-ce32-4f4e-85b1-6c15612fda18",
        name: "Victor Lourenço",
        email: "usuario@papa.com",
        role: "user",
        allowed_divisions: ["sob_medida"],
        allowed_stages: ["previa", "galga", "desenho_tecnico"],
        avatar_color: "#f97316",
        active: true
      }
    ];
  },

  // 12. Buscar usuários diretamente no Supabase app_users com cache
  async fetchUsers() {
    const client = typeof DB !== "undefined" ? DB.getClient() : (window.supabaseClient || null);
    if (client && navigator.onLine) {
      try {
        const { data, error } = await client
          .from("app_users")
          .select("*")
          .order("name", { ascending: true });

        if (!error && Array.isArray(data) && data.length > 0) {
          localStorage.setItem(Auth.STORAGE_KEY_USERS_LIST, JSON.stringify(data));
          window.dispatchEvent(new CustomEvent("igui-users-synced", { detail: data }));
          return data;
        }
      } catch (e) {
        console.warn("[Auth] Erro ao buscar app_users no Supabase:", e);
      }
    }
    return Auth.getAllUsers();
  },

  getUserById(id) {
    return Auth.getAllUsers().find(u => u.id === id) || null;
  },

  isAdmin() {
    const user = Auth.getCurrentUser();
    return user && user.role === "admin";
  },

  canAccessDivision(division) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    if (user.role === "admin") return true;
    const allowed = user.allowed_divisions || [];
    return allowed.includes(division);
  },

  canAccessStage(stage) {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    if (user.role === "admin") return true;
    const allowed = user.allowed_stages || ["previa", "galga", "desenho_tecnico"];
    return allowed.includes(stage);
  },

  // 13. Sincronizar app_users do Supabase
  async syncWithSupabase() {
    return await Auth.fetchUsers();
  },

  // 13. Atualiza dados de exibição do usuário na barra superior
  updateUserUI() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const isAdmin = Auth.isAdmin();

    const parts = (user.name || "U").trim().split(" ");
    const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    const roleText = isAdmin ? "Diretoria / Admin" : "Projetista";
    const roleClass = `badge-user-role ${isAdmin ? 'admin' : ''}`;

    document.querySelectorAll(".user-profile-avatar, #navUserAvatar, #orcUserAvatar, #precosUserAvatar, #propUserAvatar").forEach(el => {
      el.textContent = initials;
      if (user.avatar_color) el.style.background = user.avatar_color;
    });

    document.querySelectorAll(".user-profile-name, #navUserName, #orcUserName, #precosUserName, #propUserName").forEach(el => {
      el.textContent = user.name;
    });

    document.querySelectorAll(".badge-user-role, #navUserRole").forEach(el => {
      el.textContent = roleText;
      el.className = roleClass;
    });
  }
};

// Inicialização de escuta de autenticação
Auth.init();
Auth.syncWithSupabase();

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Auth.updateUserUI());
  } else {
    Auth.updateUserUI();
  }
  window.addEventListener("igui-user-changed", () => Auth.updateUserUI());
}
