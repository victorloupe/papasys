// ==============================================================================
// CONFIGURAÇÕES DO SISTEMA E SUPABASE - PAPASYS
// ==============================================================================

const CONFIG = {
  SUPABASE_URL: "https://bhbbpdvgkyjqxhghbmpe.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M",
  APP_NAME: "PapaSys",
  CURRENT_VERSION: "1.0.0",
  DEFAULT_MARGIN: 25.0
};

let supabaseClient = null;
try {
  if (window.supabase) {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    console.log("[PapaSys Supabase] Conectado com sucesso:", CONFIG.SUPABASE_URL);
  } else {
    console.warn("[PapaSys Supabase] Biblioteca CDN carregando...");
  }
} catch (e) {
  console.error("[PapaSys Supabase] Erro ao inicializar cliente:", e);
}
