import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { canAtLeast, pagePath, toast } from "./utils.js";

let cachedUser = undefined;
let cachedProfile = undefined;

export async function getSession() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null;
  if (cachedUser !== undefined) return cachedUser;
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    cachedUser = null;
    return null;
  }
  cachedUser = data.user || null;
  return cachedUser;
}

export async function getMyProfile(force = false) {
  if (!isSupabaseConfigured) return null;
  if (!force && cachedProfile !== undefined) return cachedProfile;
  const user = await getCurrentUser();
  if (!user) {
    cachedProfile = null;
    return null;
  }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) {
    cachedProfile = null;
    return null;
  }
  cachedProfile = data;
  return cachedProfile;
}

export function clearAuthCache() {
  cachedUser = undefined;
  cachedProfile = undefined;
}

export async function requireAuth(minRole = null) {
  if (!isSupabaseConfigured) return { ok: false, reason: "unconfigured" };
  const user = await getCurrentUser();
  if (!user) {
    location.href = pagePath("login");
    return { ok: false, reason: "not_authenticated" };
  }
  const profile = await getMyProfile();
  if (minRole && !canAtLeast(profile, minRole)) {
    return { ok: false, reason: "forbidden", profile };
  }
  return { ok: true, user, profile };
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
  clearAuthCache();
  toast("Oturum kapatıldı.", "success");
  location.href = pagePath("home");
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured) throw new Error("Supabase bağlantısı yapılandırılmadı.");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  clearAuthCache();
  return data;
}

export async function signUp({ email, password, fullName, className }) {
  if (!isSupabaseConfigured) throw new Error("Supabase bağlantısı yapılandırılmadı.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        class_name: className,
      },
      emailRedirectTo: new URL(pagePath("dashboard"), location.href).href,
    },
  });
  if (error) throw error;
  clearAuthCache();
  return data;
}

export async function resetPassword(email) {
  if (!isSupabaseConfigured) throw new Error("Supabase bağlantısı yapılandırılmadı.");
  const redirectTo = new URL(pagePath("reset"), location.href).href;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
  return data;
}

export async function updatePassword(newPassword) {
  if (!isSupabaseConfigured) throw new Error("Supabase bağlantısı yapılandırılmadı.");
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}
