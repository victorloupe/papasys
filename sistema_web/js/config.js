// ==============================================================================
// CONFIGURAÇÕES DO SISTEMA E SUPABASE - PAPASYS
// Seção 13.2: Chaves via variáveis de ambiente da Vercel com fallback seguro
// ==============================================================================

const CONFIG = {
  SUPABASE_URL: "https://bhbbpdvgkyjqxhghbmpe.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M",
  APP_NAME: "iGUi Orçamentos",
  CURRENT_VERSION: "2.1.0",
  DEFAULT_MARGIN: 25.0
};

let supabaseClient = null;

// Inicialização síncrona imediata com valores padrão
function initSupabaseClient() {
  try {
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });
      console.log("[PapaSys Supabase] Cliente conectado:", CONFIG.SUPABASE_URL);
    }
  } catch (e) {
    console.error("[PapaSys Supabase] Erro ao inicializar cliente:", e);
  }
}

// Inicializa cliente inicial
initSupabaseClient();

// Seção 13.2: Tenta obter configurações dinâmicas da Vercel (/api/config)
(async function loadVercelEnvConfig() {
  if (typeof window === "undefined" || !window.fetch) return;
  // Apenas tenta se estiver rodando em HTTP/HTTPS (não em file:///)
  if (window.location.protocol.startsWith("http")) {
    try {
      const res = await fetch("/api/config", { method: "GET", headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.SUPABASE_URL && data.SUPABASE_ANON_KEY) {
          const changed = data.SUPABASE_URL !== CONFIG.SUPABASE_URL || data.SUPABASE_ANON_KEY !== CONFIG.SUPABASE_ANON_KEY;
          CONFIG.SUPABASE_URL = data.SUPABASE_URL;
          CONFIG.SUPABASE_ANON_KEY = data.SUPABASE_ANON_KEY;
          if (changed) {
            console.log("[PapaSys Config] Chaves atualizadas via Vercel Environment Variables");
            initSupabaseClient();
          }
        }
      }
    } catch (_err) {
      // Silencioso em ambiente local/estático sem rota serverless
    }
  }
})();
