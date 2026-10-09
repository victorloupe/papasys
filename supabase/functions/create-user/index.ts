import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do servidor incompleta (service_role ausente)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Validar se o solicitante está autenticado e é Admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Acesso não autorizado: token ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false }
    });

    const { data: { user: callerUser }, error: callerError } = await userClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Sessão inválida ou expirada." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cliente com permissões de administrador no Supabase
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Checar perfil do solicitante na tabela app_users
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("app_users")
      .select("role, active")
      .eq("id", callerUser.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== "admin" || !callerProfile.active) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem criar usuários no sistema." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Extrair dados da requisição
    const { email, password, name, role, allowed_divisions, allowed_stages, avatar_color, active } = await req.json();

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes: email, senha e nome são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter no mínimo 8 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Criar usuário no Supabase Auth via Admin API
    const { data: createdAuth, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        role: role || "user"
      }
    });

    if (createAuthError) {
      return new Response(
        JSON.stringify({ error: `Erro no Supabase Auth: ${createAuthError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newUserId = createdAuth.user.id;

    // 4. Salvar / atualizar perfil em app_users
    const userProfile = {
      id: newUserId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: role || "user",
      allowed_divisions: Array.isArray(allowed_divisions) && allowed_divisions.length > 0
        ? allowed_divisions
        : ["sob_medida"],
      allowed_stages: Array.isArray(allowed_stages) && allowed_stages.length > 0
        ? allowed_stages
        : ["previa", "galga", "desenho_tecnico"],
      avatar_color: avatar_color || "#f97316",
      active: active !== false,
      updated_at: new Date().toISOString()
    };

    const { error: upsertErr } = await adminClient
      .from("app_users")
      .upsert(userProfile);

    if (upsertErr) {
      return new Response(
        JSON.stringify({ error: `Erro ao criar perfil de usuário: ${upsertErr.message}`, user_id: newUserId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user: userProfile }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Erro interno no servidor: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
