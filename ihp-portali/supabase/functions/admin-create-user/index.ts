import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const roleRank: Record<string, number> = {
  uye: 10,
  temsilci: 20,
  yonetici: 30,
  baskan_yardimcisi: 40,
  genel_baskan: 50,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Only POST is allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

  const { data: caller, error: callerError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (callerError || !caller || roleRank[caller.role] < roleRank.yonetici) {
    return json({ error: "Yönetici yetkisi gerekli." }, 403);
  }

  const body = await req.json();
  const { email, password, full_name, class_name, role = "uye", duty = "Üye" } = body;
  if (!email || !password || !full_name) return json({ error: "email, password ve full_name zorunludur." }, 400);
  if (roleRank[role] > roleRank[caller.role]) return json({ error: "Kendi rolünüzden üst rol veremezsiniz." }, 403);

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, class_name },
  });
  if (error) return json({ error: error.message }, 400);

  await adminClient.from("profiles").upsert({
    id: data.user.id,
    full_name,
    class_name: class_name || null,
    role,
    duty,
    badges: ["Yeni Üye"],
  });

  return json({ user_id: data.user.id, email: data.user.email });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
