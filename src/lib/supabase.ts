import type { AuthSession, RuntimeConfig } from "../types.js";

const SESSION_KEY = "ihp-auth-session";

let runtimeConfig: RuntimeConfig = {
  configured: false,
  supabaseUrl: "",
  supabaseAnonKey: ""
};

let session: AuthSession | null = null;

class SupabaseRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.code = code;
  }
}

function sessionStore(): Storage | null {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function legacySessionStore(): Storage | null {
  try {
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
}

function readSession(): AuthSession | null {
  try {
    const store = sessionStore();
    const legacyStore = legacySessionStore();
    const raw = store?.getItem(SESSION_KEY) || legacyStore?.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
    if (session && store && legacyStore?.getItem(SESSION_KEY)) {
      store.setItem(SESSION_KEY, JSON.stringify(session));
      legacyStore.removeItem(SESSION_KEY);
    }
  } catch {
    session = null;
  }
  return session;
}

function writeSession(nextSession: AuthSession | null) {
  session = nextSession;
  const store = sessionStore();
  const legacyStore = legacySessionStore();
  try {
    if (nextSession) {
      store?.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } else {
      store?.removeItem(SESSION_KEY);
    }
    legacyStore?.removeItem(SESSION_KEY);
  } catch {
    // Some browsers can block persistent storage in private or hardened modes.
  }
}

function isExpired(candidate: AuthSession | null) {
  if (!candidate?.expires_at) return true;
  return candidate.expires_at * 1000 < Date.now() + 30_000;
}

async function authRequest(path: string, options: RequestInit = {}): Promise<any> {
  if (!runtimeConfig.configured) {
    throw new Error("Supabase bağlantısı henüz yapılandırılmadı.");
  }

  const response = await fetch(`${runtimeConfig.supabaseUrl}/auth/v1${path}`, {
    ...options,
    headers: {
      apikey: runtimeConfig.supabaseAnonKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new SupabaseRequestError(
      payload.error_description ||
        payload.msg ||
        payload.message ||
        "Kimlik doğrulama işlemi tamamlanamadı.",
      response.status,
      payload.error_code || payload.code || payload.error || ""
    );
  }

  return payload;
}

async function refreshSession() {
  const current = session || readSession();
  if (!current?.refresh_token) return null;

  try {
    const payload = await authRequest("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: current.refresh_token })
    });
    writeSession(payload);
    return payload;
  } catch (error) {
    if (
      error instanceof SupabaseRequestError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    ) {
      writeSession(null);
    }
    return null;
  }
}

export async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) throw new Error("config unavailable");
    runtimeConfig = await response.json();
  } catch {
    runtimeConfig = {
      configured: false,
      supabaseUrl: "",
      supabaseAnonKey: ""
    };
  }

  readSession();
  if (session && isExpired(session)) await refreshSession();
  return runtimeConfig;
}

export function getConfig() {
  return runtimeConfig;
}

export function getSession() {
  return session;
}

export function isAuthenticationError(error: unknown) {
  return error instanceof SupabaseRequestError && error.status === 401;
}

export async function getAccessToken() {
  if (!session) readSession();
  if (session && isExpired(session)) await refreshSession();
  return session?.access_token || "";
}

export async function signIn(email: string, password: string) {
  const payload = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  writeSession(payload);
  return payload;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  if (!session) readSession();
  const email = session?.user?.email;
  if (!email) throw new Error("Oturum e-postası bulunamadı.");
  if (newPassword.length < 8) throw new Error("Yeni şifre en az 8 karakter olmalı.");

  const verified = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password: oldPassword })
  });

  const response = await fetch(`${runtimeConfig.supabaseUrl}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: runtimeConfig.supabaseAnonKey,
      Authorization: `Bearer ${verified.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: newPassword })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.msg || payload.message || "Şifre güncellenemedi.");
  }

  const freshSession = await authRequest("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password: newPassword })
  });
  writeSession(freshSession);
  return freshSession;
}

export async function signOut() {
  const token = await getAccessToken();
  if (token && runtimeConfig.configured) {
    await authRequest("/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => undefined);
  }
  writeSession(null);
}

export async function restRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  if (!token) throw new Error("Bu işlem için oturum açmanız gerekiyor.");

  const response = await fetch(`${runtimeConfig.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: runtimeConfig.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (
      payload?.code === "23505"
      && String(payload?.message || "").includes("discipline_records_one_per_investigation_idx")
    ) {
      throw new Error("Bu soruşturma için zaten bir disiplin cezası kaydedilmiş.");
    }
    throw new SupabaseRequestError(
      payload?.message || payload?.hint || "Veri işlemi tamamlanamadı.",
      response.status,
      payload?.code || ""
    );
  }
  return payload;
}

export async function serverRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "İşlem tamamlanamadı.");
  return payload;
}
