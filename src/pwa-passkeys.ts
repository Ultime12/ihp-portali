import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SESSION_KEY = "ihp-auth-session";
let clientPromise: Promise<SupabaseClient> | null = null;

async function passkeyClient() {
  if (!clientPromise) {
    clientPromise = fetch("/api/config", { cache: "no-store" })
      .then(async (response) => {
        const config = await response.json();
        if (!response.ok || !config?.configured) throw new Error("Portal bağlantısı hazır değil.");
        return createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            storage: globalThis.localStorage,
            storageKey: SESSION_KEY,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            experimental: { passkey: true }
          }
        });
      });
  }
  return clientPromise;
}

function passkeyError(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (/failed to fetch|dynamically imported module|network/i.test(message)) {
    return new Error("Cihaz anahtarı hizmetine şu anda ulaşılamıyor.");
  }
  if (code === "passkey_disabled") return new Error("Passkey girişi henüz sistemde etkin değil.");
  if (code === "webauthn_credential_exists") return new Error("Bu cihaz anahtarı hesabınıza zaten bağlı.");
  if (error?.name === "NotAllowedError") return new Error("Cihaz doğrulaması iptal edildi veya zaman aşımına uğradı.");
  return new Error(error?.message || "Cihaz anahtarı işlemi tamamlanamadı.");
}

export async function listIhpPasskeys() {
  try {
    const client = await passkeyClient();
    const { data, error } = await client.auth.passkey.list();
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (error) {
    throw passkeyError(error);
  }
}

export async function registerIhpPasskey() {
  try {
    const client = await passkeyClient();
    const { data, error } = await client.auth.registerPasskey();
    if (error) throw error;
    return data;
  } catch (error) {
    throw passkeyError(error);
  }
}

export async function deleteIhpPasskey(passkeyId: string) {
  try {
    const client = await passkeyClient();
    const { error } = await client.auth.passkey.delete({ passkeyId });
    if (error) throw error;
  } catch (error) {
    throw passkeyError(error);
  }
}

export async function signInWithIhpPasskey() {
  try {
    const client = await passkeyClient();
    const { data, error } = await client.auth.signInWithPasskey();
    if (error) throw error;
    if (!data?.session) throw new Error("Cihaz anahtarı oturumu oluşturulamadı.");
    return data;
  } catch (error) {
    throw passkeyError(error);
  }
}
