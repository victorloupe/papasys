// Vercel Serverless Function: Fornece configuração do Supabase via Variáveis de Ambiente da Vercel
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bhbbpdvgkyjqxhghbmpe.supabase.co";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M";

  return res.status(200).json({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
    APP_NAME: "PapaSys",
    CURRENT_VERSION: "2.0.0"
  });
};
