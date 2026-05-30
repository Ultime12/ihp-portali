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

  const { user_id } = await req.json();
  if (!user_id) return json({ error: "user_id zorunludur." }, 400);

  const { data: caller } = await adminClient.from("profiles").select("role").eq("id", userData.user.id).single();
  const { data: target } = await adminClient.from("profiles").select("role").eq("id", user_id).single();

  if (!caller || roleRank[caller.role] < roleRank.yonetici) return json({ error: "Yönetici yetkisi gerekli." }, 403);
  if (target && roleRank[target.role] > roleRank[caller.role]) return json({ error: "Kendi rolünüzden üst üyeyi silemezsiniz." }, 403);

  const { error } = await adminClient.auth.admin.deleteUser(user_id);
  if (error) return json({ error: error.message }, 400);

  return json({ deleted: true });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
