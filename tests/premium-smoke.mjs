import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const dist = join(root, "dist");
const output = join(root, "test-results", "premium");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    let filePath = normalize(join(dist, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(dist) || !(await stat(filePath).catch(() => null))?.isFile()) {
      filePath = join(dist, "index.html");
    }
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
await mkdir(output, { recursive: true });

const baseProfile = {
  id: "member-1",
  email: "uye@example.test",
  display_name: "Tuna Mert Köse",
  role: "member",
  roles: ["member"],
  status: "active",
  discipline_points: 100,
  member_code: "102938",
  avatar_initials: "TMK",
  avatar_color: "#31548f",
  theme_preference: "dark",
  is_system_account: false,
  joined_at: "2026-01-10T10:00:00.000Z",
  profile_committees: []
};

const members = [
  baseProfile,
  { ...baseProfile, id: "member-2", email: "deniz@example.test", display_name: "Deniz Çiçek", member_code: "203847", avatar_initials: "DÇ" }
];

function tablePayload(table, url, profile) {
  const query = url.search;
  if (table === "profiles" && query.includes(`id=eq.${profile.id}`)) return [profile];
  if (table === "profiles") return members.map((item) => ({ ...item, roles: item.id === profile.id ? profile.roles : item.roles }));
  if (table === "announcements") return [{ id: "a1", title: "Kurul toplantısı", category: "Genel", status: "published", created_at: "2026-06-18T16:00:00.000Z" }];
  if (table === "committees") return [{ id: "c1", name: "Yürütme Kurulu", status: "active" }, { id: "c2", name: "Disiplin Kurulu", status: "active" }];
  if (table === "notifications") return [{ id: "n1", title: "Portal bildirimi", body: "Yeni duyuru yayınlandı.", category: "system", created_at: "2026-06-18T17:00:00.000Z", read_at: null }];
  if (table === "applications") return [{ id: "ap1", status: "new", created_at: "2026-06-18T12:00:00.000Z" }];
  if (table === "portal_settings") return [{ id: "main", portal_name: "İHP Portalı", logo_url: null, notifications_enabled: true }];
  return [];
}

async function mockBackend(page, profile) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/config", (route) => route.fulfill({ json: { configured: true, supabaseUrl: "https://mock.supabase.test", supabaseAnonKey: "publishable-test" } }));
  await page.route("https://mock.supabase.test/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tablePayload(table, url, profile)) });
  });
}

async function openPortal(page, profile, path = "overview") {
  await mockBackend(page, profile);
  await page.addInitScript(({ profileId, email }) => {
    localStorage.setItem("ihp-auth-session", JSON.stringify({
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: profileId, email }
    }));
  }, { profileId: profile.id, email: profile.email });
  await page.goto(`${baseUrl}/#/portal/${path}`);
  await page.waitForSelector(".app-shell");
  await page.waitForFunction(() => !document.querySelector(".skeleton-page"));
}

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await mockBackend(page, baseProfile);
    await page.goto(`${baseUrl}/#/home`);
    await page.waitForSelector(".premium-hero h1");
    const capabilityCards = page.locator(".capability-grid > article");
    for (let index = 0; index < 4; index += 1) {
      await capabilityCards.nth(index).scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
    }
    assert.equal(await page.locator(".capability-grid > article.is-visible").count(), 4, `${viewport.name}: scroll reveal`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: public horizontal overflow`);
    await page.screenshot({ path: join(output, `${viewport.name}-public.png`), fullPage: true });

    await page.goto(`${baseUrl}/#/login`);
    await page.waitForSelector(".premium-login-card");
    await page.fill("#login-password", "12345678");
    await page.click('[data-action="toggle-password"]');
    assert.equal(await page.locator("#login-password").getAttribute("type"), "text");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: login horizontal overflow`);
    await page.screenshot({ path: join(output, `${viewport.name}-login.png`), fullPage: true });
    await context.close();

    const portalContext = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const portalPage = await portalContext.newPage();
    portalPage.on("pageerror", (error) => errors.push(error.message));
    await openPortal(portalPage, baseProfile);
    assert.equal(await portalPage.locator("html").getAttribute("data-theme"), "blue", "legacy theme should map to blue");
    await portalPage.locator("[data-theme-select]").selectOption("green");
    assert.equal(await portalPage.locator("html").getAttribute("data-theme"), "green", "theme selection should apply");
    await portalPage.locator('[data-action="open-notifications"]').click();
    assert.equal(await portalPage.locator('[role="dialog"]').isVisible(), true, "notifications modal should open");
    assert.equal(await portalPage.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), true, "modal should receive focus");
    await portalPage.keyboard.press("Escape");
    if (viewport.width <= 860) {
      await portalPage.locator('[data-action="toggle-sidebar"]').click();
      assert.equal(await portalPage.locator(".sidebar.open").isVisible(), true, "mobile sidebar should open");
      await portalPage.locator('[data-action="close-sidebar"]').click({ position: { x: viewport.width - 8, y: 100 } });
    }
    assert.equal(await portalPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: portal horizontal overflow`);
    await portalPage.screenshot({ path: join(output, `${viewport.name}-portal.png`), fullPage: true });
    assert.deepEqual(errors, [], `${viewport.name}: page errors`);
    await portalContext.close();
  }

  const roleCases = [
    { name: "admin", roles: ["super_admin"], visible: "Sistem", hidden: null },
    { name: "president", roles: ["president", "member"], visible: "Başkanlık", hidden: null },
    { name: "discipline-chair", roles: ["discipline_chair", "member"], visible: "Disiplin İşlemleri", hidden: "Başkanlık" },
    { name: "discipline-member", roles: ["discipline_member", "member"], visible: "Soruşturmalar", hidden: "Başkanlık" },
    { name: "member", roles: ["member"], visible: "Antlaşmalar", hidden: "Soruşturmalar" }
  ];

  for (const roleCase of roleCases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const profile = { ...baseProfile, id: roleCase.name, email: `${roleCase.name}@example.test`, roles: roleCase.roles, role: roleCase.roles[0], theme_preference: "blue" };
    await openPortal(page, profile);
    assert.equal(await page.getByText(roleCase.visible, { exact: true }).first().isVisible(), true, `${roleCase.name}: expected menu item`);
    if (roleCase.hidden) assert.equal(await page.getByText(roleCase.hidden, { exact: true }).count(), 0, `${roleCase.name}: forbidden menu item`);
    await context.close();
  }

  const disciplineContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const disciplinePage = await disciplineContext.newPage();
  const disciplineProfile = {
    ...baseProfile,
    id: "discipline-chair-form",
    email: "discipline-chair@example.test",
    roles: ["discipline_chair", "member"],
    role: "discipline_chair",
    theme_preference: "blue"
  };
  await openPortal(disciplinePage, disciplineProfile, "discipline");
  await disciplinePage.locator('[data-action="open-discipline"]').click();
  const suspensionField = disciplinePage.locator("[data-discipline-suspension]");
  assert.equal(await suspensionField.isHidden(), true, "suspension duration should start hidden");
  await disciplinePage.locator("#discipline-effect").selectOption("party_suspension");
  assert.equal(await suspensionField.isVisible(), true, "suspension duration should appear for party suspension");
  assert.equal(await disciplinePage.locator("#discipline-sanction-days").isEnabled(), true);
  assert.equal(await disciplinePage.locator("#discipline-sanction-days").getAttribute("required"), "");
  await disciplinePage.locator("#discipline-effect").selectOption("none");
  assert.equal(await suspensionField.isHidden(), true, "suspension duration should hide for other sanctions");
  assert.equal(await disciplinePage.locator("#discipline-sanction-days").isDisabled(), true);
  await disciplineContext.close();

  const accessContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const accessPage = await accessContext.newPage();
  const accessProfile = { ...baseProfile, id: "access-account", email: "giris@tfo.k12.tr", display_name: "Geçiş Görevlisi", roles: [], role: "member", member_code: null, is_system_account: true, theme_preference: "blue" };
  await openPortal(accessPage, accessProfile, "access");
  assert.equal(await accessPage.locator(".app-nav .nav-item").count(), 1, "access account should see one menu item");
  assert.equal(await accessPage.getByText("Geçiş", { exact: true }).first().isVisible(), true);
  await accessContext.close();

  console.log(`Premium smoke tests passed. Screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
