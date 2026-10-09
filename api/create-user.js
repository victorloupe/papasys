// Vercel Serverless Function: Criação de Usuário com Service Role Key (Admin Only)
// Protegido: a service_role key nunca é exposta no frontend.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || "https://bhbbpdvgkyjqxhghbmpe.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYmJwZHZna3lqcXhoZ2hibXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDk2NTIsImV4cCI6MjEwNTcyNTY1Mn0.8ti8dQiBhX20bVk3BOvFL91Rk3Vw31NS3dbpA6YiR5M";

    if (!supabaseServiceKey) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada nas variáveis de ambiente da Vercel.' });
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Acesso não autorizado: token de autenticação ausente.' });
    }

    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user: callerUser }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !callerUser) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('app_users')
      .select('role, active')
      .eq('id', callerUser.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.active) {
      return res.status(403).json({ error: 'Apenas administradores podem criar novos usuários.' });
    }

    const { email, password, name, role, allowed_divisions, allowed_stages, avatar_color, active } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
    }

    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: { name: name.trim(), role: role || 'user' }
    });

    if (createAuthError) {
      return res.status(400).json({ error: `Erro no Supabase Auth: ${createAuthError.message}` });
    }

    const userProfile = {
      id: createdAuth.user.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role || 'user',
      allowed_divisions: Array.isArray(allowed_divisions) && allowed_divisions.length > 0 ? allowed_divisions : ['sob_medida'],
      allowed_stages: Array.isArray(allowed_stages) && allowed_stages.length > 0 ? allowed_stages : ['previa', 'galga', 'desenho_tecnico'],
      avatar_color: avatar_color || '#f97316',
      active: active !== false,
      updated_at: new Date().toISOString()
    };

    const { error: upsertErr } = await adminClient.from('app_users').upsert(userProfile);
    if (upsertErr) {
      return res.status(500).json({ error: `Erro ao salvar perfil: ${upsertErr.message}`, user_id: createdAuth.user.id });
    }

    return res.status(200).json({ success: true, user: userProfile });
  } catch (err) {
    return res.status(500).json({ error: `Erro interno: ${err.message}` });
  }
};
