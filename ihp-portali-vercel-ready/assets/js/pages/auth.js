import { signIn, signUp, resetPassword, updatePassword, getCurrentUser } from "../auth.js";
import { getFormData, pagePath, toast, requireConfiguredNotice } from "../utils.js";
import { isSupabaseConfigured } from "../supabaseClient.js";

export async function init({ root }) {
  const mode = document.body.dataset.mode || "login";
  if (!isSupabaseConfigured) {
    root.innerHTML = `<div class="auth-page"><div class="card auth-card">${requireConfiguredNotice()}</div></div>`;
    return;
  }
  const user = await getCurrentUser();
  if (user && mode !== "reset") {
    location.href = pagePath("dashboard");
    return;
  }

  root.innerHTML = `
    <section class="auth-page">
      <div class="card auth-card">
        <div class="auth-tabs">
          <a class="${mode === "login" ? "active" : ""}" href="${pagePath("login")}">Giriş</a>
          <a class="${mode === "register" ? "active" : ""}" href="${pagePath("register")}">Kayıt</a>
          <a class="${mode === "reset" ? "active" : ""}" href="${pagePath("reset")}">Şifre</a>
        </div>
        <div id="authContent"></div>
      </div>
    </section>
  `;

  const content = document.getElementById("authContent");
  if (mode === "register") renderRegister(content);
  else if (mode === "reset") renderReset(content);
  else renderLogin(content);
}

function renderLogin(content) {
  content.innerHTML = `
    <h1 style="font-size:32px">Portala giriş yap</h1>
    <p class="muted">Üye, temsilci ve yöneticiler için güvenli oturum.</p>
    <form class="form" id="loginForm">
      <div class="form-row"><label>E-posta</label><input name="email" type="email" autocomplete="email" required></div>
      <div class="form-row"><label>Şifre</label><input name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary" type="submit">Giriş yap</button>
    </form>
  `;
  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    try {
      const data = getFormData(event.currentTarget);
      await signIn(data.email, data.password);
      toast("Giriş başarılı.", "success");
      location.href = pagePath("dashboard");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function renderRegister(content) {
  content.innerHTML = `
    <h1 style="font-size:32px">Kayıt ol</h1>
    <p class="muted">Kayıt olan herkes başlangıçta Üye rolü ve 100 disiplin puanı ile açılır.</p>
    <form class="form" id="registerForm">
      <div class="form-row"><label>Ad Soyad</label><input name="fullName" required></div>
      <div class="form-row"><label>Sınıf</label><input name="className" placeholder="Örn. 8/A"></div>
      <div class="form-row"><label>E-posta</label><input name="email" type="email" autocomplete="email" required></div>
      <div class="form-row"><label>Şifre</label><input name="password" type="password" autocomplete="new-password" minlength="6" required></div>
      <button class="btn btn-primary" type="submit">Hesap oluştur</button>
    </form>
  `;
  document.getElementById("registerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    try {
      await signUp(getFormData(event.currentTarget));
      toast("Kayıt alındı. E-posta doğrulaması açıksa gelen bağlantıyı onayla.", "success");
      location.href = pagePath("dashboard");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function renderReset(content) {
  content.innerHTML = `
    <h1 style="font-size:32px">Şifre işlemleri</h1>
    <p class="muted">Şifre sıfırlama bağlantısı gönder veya bağlantıdan geldiysen yeni şifreni belirle.</p>
    <form class="form" id="resetEmailForm">
      <div class="form-row"><label>E-posta</label><input name="email" type="email" autocomplete="email" required></div>
      <button class="btn btn-primary" type="submit">Sıfırlama bağlantısı gönder</button>
    </form>
    <hr style="border:0;border-top:1px solid var(--border);margin:22px 0">
    <form class="form" id="newPasswordForm">
      <div class="form-row"><label>Yeni şifre</label><input name="password" type="password" minlength="6" required></div>
      <button class="btn btn-ghost" type="submit">Yeni şifreyi kaydet</button>
    </form>
  `;
  document.getElementById("resetEmailForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    try {
      const { email } = getFormData(event.currentTarget);
      await resetPassword(email);
      toast("Şifre sıfırlama bağlantısı gönderildi.", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById("newPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = event.submitter;
    btn.disabled = true;
    try {
      const { password } = getFormData(event.currentTarget);
      await updatePassword(password);
      toast("Şifre güncellendi.", "success");
      location.href = pagePath("dashboard");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}
