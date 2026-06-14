const IHP_GOOGLE_AUTH_PATCH_V1 = true;
const googleAuthSessionKey = "ihp-auth-session";

function googleAuthEnsureStyles() {
  if (document.getElementById("ihp-google-auth-styles")) return;
  const style = document.createElement("style");
  style.id = "ihp-google-auth-styles";
  style.textContent = `
    .google-auth-separator { display: flex; align-items: center; gap: .75rem; margin: 1rem 0; color: var(--muted); font-size: .78rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .google-auth-separator::before, .google-auth-separator::after { content: ""; height: 1px; flex: 1; background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); }
    .google-login-button { width: 100%; justify-content: center; min-height: 50px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.08); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
    .google-login-button:hover { background: rgba(255,255,255,.12); transform: translateY(-1px); }
    .google-login-button:disabled { opacity: .65; cursor: wait; transform: none; }
    .google-glyph { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 999px; background: #fff; color: #111827; font-weight: 900; font-family: Arial, sans-serif; margin-right: .45rem; }
    .google-auth-helper { margin-top: .75rem; color: var(--muted); font-size: .86rem; line-height: 1.5; text-align: center; }
  `;
  document.head.append(style);
}

function googleAuthCallbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

function googleAuthHashParams() {
  const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!rawHash) return null;
  const params = new URLSearchParams(rawHash);
  if (params.get("error") || params.get("error_description")) return params;
  if (!params.get("access_token") || !params.get("refresh_token")) return null;
  return params;
}

async function googleAuthFetchUser(accessToken) {
  const cfg = getConfig();
  if (!cfg?.configured) return null;
  const response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function googleAuthConsumeRedirect() {
  const params = googleAuthHashParams();
  if (!params) return false;

  const authError = params.get("error_description") || params.get("error");
  if (authError) {
    history.replaceState(null, "", `${window.location.origin}/#/login`);
    showToast(`Google girisi tamamlanamadi: ${authError}`);
    return false;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const expiresIn = Number(params.get("expires_in") || "3600");
  const expiresAt = Number(
    params.get("expires_at") || Math.floor(Date.now() / 1000 + expiresIn)
  );
  const user = await googleAuthFetchUser(accessToken);

  sessionStorage.setItem(
    googleAuthSessionKey,
    JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      expires_at: expiresAt,
      token_type: params.get("token_type") || "bearer",
      provider_token: params.get("provider_token") || undefined,
      provider_refresh_token: params.get("provider_refresh_token") || undefined,
      user: user || undefined
    })
  );

  history.replaceState(null, "", `${window.location.origin}/#/portal/overview`);
  return true;
}

async function googleAuthStartLogin() {
  const cfg = getConfig();
  if (!cfg?.configured) throw new Error("Supabase baglantisi henuz yapilandirilmadi.");

  const url = new URL(`${cfg.supabaseUrl}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", googleAuthCallbackUrl());
  window.location.assign(url.toString());
}

const googleAuthBaseLoginPage = loginPage;
loginPage = function patchedGoogleAuthLoginPage() {
  googleAuthEnsureStyles();
  const html = googleAuthBaseLoginPage();
  if (html.includes('data-action="google-login"')) return html;
  return html.replace(
    "</form>",
    `</form>
        <div class="google-auth-separator"><span>veya</span></div>
        <button class="btn btn-secondary google-login-button" type="button" data-action="google-login">
          <span class="google-glyph">G</span> Google ile devam et
        </button>
        <p class="google-auth-helper">Google hesabi, ayni e-posta varsa mevcut portal uyeliginize otomatik baglanir.</p>`
  );
};

const googleAuthBaseHandleClick = handleClick;
handleClick = async function patchedGoogleAuthHandleClick(event) {
  const trigger = event.target.closest('[data-action="google-login"]');
  if (trigger) {
    event.preventDefault();
    trigger.disabled = true;
    try {
      await googleAuthStartLogin();
    } catch (error) {
      trigger.disabled = false;
      showToast(error.message || "Google girisi baslatilamadi.");
    }
    return;
  }
  return googleAuthBaseHandleClick(event);
};

const googleAuthBaseBoot = boot;
boot = async function patchedGoogleAuthBoot() {
  document.documentElement.dataset.theme = "dark";
  state.config = await loadConfig();
  const capturedGoogleSession = await googleAuthConsumeRedirect();
  await googleAuthBaseBoot();
  if (capturedGoogleSession) {
    if (state.profile) {
      showToast("Google ile giris basarili.");
    } else {
      showToast("Google hesabi dogrulandi ama portal profili bulunamadi. E-posta uyusmasini kontrol edin.");
    }
  }
};
