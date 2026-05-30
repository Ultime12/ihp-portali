import { renderLayout } from "./layout.js";
import { requireAuth } from "./auth.js";
import { qs, requireConfiguredNotice, canAtLeast } from "./utils.js";
import { isSupabaseConfigured } from "./supabaseClient.js";

async function bootstrap() {
  await renderLayout();
  const root = qs("#page-root");
  const page = document.body.dataset.page || "home";
  const needsAuth = document.body.dataset.auth === "true";
  const minRole = document.body.dataset.minRole;

  if (!isSupabaseConfigured && page !== "home" && page !== "auth" && !["announcements", "events", "applications", "gaming"].includes(page)) {
    root.innerHTML = requireConfiguredNotice();
    return;
  }

  if (needsAuth) {
    const guard = await requireAuth(minRole || null);
    if (!guard.ok) {
      if (guard.reason === "unconfigured") root.innerHTML = requireConfiguredNotice();
      if (guard.reason === "forbidden") {
        root.innerHTML = `<div class="notice error"><strong>Erişim reddedildi.</strong><br>Bu sayfa için yeterli yetkiniz yok.</div>`;
      }
      return;
    }
    if (minRole && !canAtLeast(guard.profile, minRole)) return;
  }

  try {
    const module = await import(`./pages/${page}.js`);
    await module.init({ root });
  } catch (error) {
    console.error(error);
    root.innerHTML = `<div class="notice error"><strong>Sayfa yüklenemedi.</strong><br>${error.message}</div>`;
  }
}

bootstrap();
