import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const dist = join(root, "dist-dk");
const output = join(root, "test-results", "dk");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    let filePath = normalize(join(dist, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(dist) || !(await stat(filePath).catch(() => null))?.isFile()) {
      filePath = join(dist, "index.html");
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
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
  id: "dk-chair",
  email: "dk@example.test",
  display_name: "Kurul Başkanı",
  role: "discipline_chair",
  roles: ["discipline_chair", "member"],
  status: "active",
  discipline_points: 100,
  member_code: "112233",
  avatar_initials: "DK",
  avatar_color: "#9f2233",
  theme_preference: "blue",
  is_system_account: false,
  joined_at: "2026-01-10"
};

const targetProfile = {
  ...baseProfile,
  id: "target-member",
  email: "uye@example.test",
  display_name: "Örnek Üye",
  role: "member",
  roles: ["member"],
  member_code: "445566",
  avatar_initials: "ÖÜ"
};

const adminProfile = {
  ...baseProfile,
  id: "admin-user",
  email: "admin@example.test",
  display_name: "Teknik Admin",
  role: "super_admin",
  roles: ["super_admin"],
  member_code: null,
  avatar_initials: "ADM"
};

const complaint = {
  id: "complaint-1",
  complainant_profile_id: targetProfile.id,
  accused_profile_id: baseProfile.id,
  subject: "Kurul incelemesi",
  description: "Örnek şikâyet açıklaması",
  status: "new",
  priority: "normal",
  created_at: "2026-07-04T08:00:00.000Z",
  complainant: targetProfile,
  accused: baseProfile
};

const ownComplaint = {
  ...complaint,
  id: "complaint-own",
  complainant_profile_id: baseProfile.id,
  accused_profile_id: targetProfile.id,
  subject: "Kendi şikâyetim",
  complainant: baseProfile,
  accused: targetProfile
};

const disciplineApplication = {
  id: "application-dk",
  applicant_profile_id: targetProfile.id,
  target_committee_id: "committee-dk",
  requested_role: "discipline_member",
  status: "new",
  notes: "Disiplin Kurulu başvurusu",
  created_at: "2026-07-04T07:00:00.000Z",
  applicant: targetProfile,
  target_committee: { id: "committee-dk", name: "Disiplin Kurulu" }
};

const otherApplication = {
  ...disciplineApplication,
  id: "application-youth",
  target_committee_id: "committee-youth",
  notes: "Gençlik Kolları başvurusu",
  target_committee: { id: "committee-youth", name: "Gençlik Kolları" }
};

let lastLoginEmail = "";

const investigation = {
  id: "investigation-1",
  subject_profile_id: targetProfile.id,
  opened_by: baseProfile.id,
  assigned_to: baseProfile.id,
  title: "Örnek soruşturma",
  description: "Savunma ve olay incelemesi",
  status: "open",
  defense_status: "received",
  created_at: "2026-07-04T09:00:00.000Z",
  subject: targetProfile,
  assignee: { id: baseProfile.id, display_name: baseProfile.display_name }
};

const rewardRecord = {
  id: "reward-record",
  member_id: baseProfile.id,
  record_type: "Ödül",
  reason: "Kurumsal katkı",
  description: "Kurumsal katkı ödülü",
  decision_status: "decided",
  appeal_status: "none",
  point_delta: 10,
  points_before: 100,
  points_after: 110,
  sanction_effect: "reward_points",
  archived: false,
  created_at: "2026-07-04T09:30:00.000Z",
  profiles: { display_name: baseProfile.display_name },
  creator: { display_name: "Sistem Yöneticisi" }
};

function sessionFor(profile) {
  return {
    access_token: `access-${profile.id}`,
    refresh_token: `refresh-${profile.id}`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: profile.id, email: profile.email }
  };
}

async function installMocks(page, profile) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: "{}"
  }));
  await page.route("**/api/config", (route) => route.fulfill({
    json: {
      configured: true,
      supabaseUrl: "https://mock.supabase.test",
      supabaseAnonKey: "publishable-test"
    }
  }));
  await page.route("https://mock.supabase.test/auth/v1/token?*", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    lastLoginEmail = body.email || "";
    return route.fulfill({ json: sessionFor(profile) });
  });
  await page.route("**/api/dk-proxy?*", (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const target = new URL(route.request().url()).searchParams.get("target");
    if (
      target === "/api/manage-member" &&
      body.module === "assistant" &&
      body.action === "discipline_analysis"
    ) {
      return route.fulfill({
        json: {
          recommendation: {
            recordType: "Kınama",
            pointDelta: -10,
            sanctionEffect: "points_only",
            suspensionDays: 0,
            creditFineAmount: 0,
            creditFineInstallments: 1
          }
        }
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.route("https://mock.supabase.test/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split("/").pop();
    if (request.method() !== "GET") {
      return route.fulfill({ json: [{ id: "updated", dk_logo_url: null }] });
    }
    if (table === "profiles") {
      if (url.searchParams.has("id")) return route.fulfill({ json: [profile] });
      return route.fulfill({ json: [profile, targetProfile] });
    }
    if (table === "notifications") return route.fulfill({ json: [] });
    if (table === "complaints") return route.fulfill({ json: [complaint, ownComplaint] });
    if (table === "applications") {
      return route.fulfill({ json: [disciplineApplication, otherApplication] });
    }
    if (table === "investigations") return route.fulfill({ json: [investigation] });
    if (table === "discipline_records") return route.fulfill({ json: [rewardRecord] });
    if (table === "portal_settings") {
      return route.fulfill({
        json: [{
          id: "main",
          portal_name: "İHP Portalı",
          notifications_enabled: true,
          logo_url: null,
          dk_logo_url: null
        }]
      });
    }
    if (table === "committees") {
      return route.fulfill({
        json: [
          { id: "committee-dk", name: "Disiplin Kurulu", status: "active" },
          { id: "committee-youth", name: "Gençlik Kolları", status: "active" }
        ]
      });
    }
    return route.fulfill({ json: [] });
  });
}

async function openPortal(context, profile, page = "overview") {
  await context.addInitScript(({ session }) => {
    localStorage.setItem("ihp-auth-session", JSON.stringify(session));
  }, { session: sessionFor(profile) });
  const pageHandle = await context.newPage();
  await installMocks(pageHandle, profile);
  await pageHandle.goto(`${baseUrl}/#/portal/${page}`);
  return pageHandle;
}

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--disable-gpu", "--no-sandbox"]
});

try {
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const publicPage = await publicContext.newPage();
  await installMocks(publicPage, baseProfile);
  await publicPage.goto(baseUrl);
  await publicPage.waitForSelector(".dk-public");
  assert.equal(await publicPage.locator(".dk-public").isVisible(), true);
  assert.match(await publicPage.locator(".dk-public h1").innerText(), /Disiplin/);
  assert.equal(await publicPage.locator(".theme-picker").count(), 0);
  await publicPage.screenshot({ path: join(output, "public-desktop.png"), fullPage: true });
  await publicContext.close();

  const loginContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const loginPageHandle = loginContext.pages()[0] || await loginContext.newPage();
  await installMocks(loginPageHandle, adminProfile);
  await loginPageHandle.goto(`${baseUrl}/#/login`);
  await loginPageHandle.screenshot({ path: join(output, "login-desktop.png"), fullPage: true });
  assert.equal(await loginPageHandle.locator("#login-email").getAttribute("type"), "email");
  assert.equal(await loginPageHandle.getByText("E-posta veya Admin", { exact: true }).count(), 0);
  await loginPageHandle.locator("#login-email").fill("superadmin@tfo.k12.tr");
  await loginPageHandle.locator("#login-password").fill("test-password");
  await loginPageHandle.locator('form[data-form="login"] [type="submit"]').click();
  await loginPageHandle.waitForSelector(".dk-app-shell");
  assert.equal(lastLoginEmail, "superadmin@tfo.k12.tr");
  await loginContext.close();

  const chairContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const chairPage = await openPortal(chairContext, baseProfile);
  await chairPage.waitForSelector(".dk-app-shell");
  assert.equal(await chairPage.locator(".dk-app-shell").isVisible(), true);
  assert.equal(await chairPage.locator(".app-nav .nav-item").count(), 8);
  assert.equal(await chairPage.locator(".theme-picker").count(), 0);
  assert.equal(await chairPage.locator(".ihp-assistant-launcher").count(), 0);
  assert.equal(
    await chairPage.evaluate(() => document.documentElement.dataset.theme),
    "red"
  );
  await chairPage.goto(`${baseUrl}/#/portal/applications`);
  await chairPage.waitForSelector(".application-card");
  assert.equal(await chairPage.locator(".application-card").count(), 1);
  assert.match(await chairPage.locator(".application-card").innerText(), /Disiplin Kurulu başvurusu/);
  assert.equal(await chairPage.locator('[data-action="open-application"]').count(), 0);
  await chairPage.goto(`${baseUrl}/#/portal/complaints`);
  await chairPage.waitForSelector(".application-card");
  assert.equal(await chairPage.locator('[data-action="open-complaint"]').count(), 0);
  assert.equal(await chairPage.locator('[data-action="delete-complaint"]').count(), 0);
  const ownComplaintCard = chairPage.locator(".application-card").filter({ hasText: "Kendi şikâyetim" });
  assert.equal(await ownComplaintCard.locator('[data-action="claim-complaint"]').count(), 0);
  assert.equal(await ownComplaintCard.locator('[data-action="open-complaint-review"]').count(), 0);
  await chairPage.goto(`${baseUrl}/#/portal/discipline`);
  await chairPage.waitForSelector('[data-action="open-discipline"]');
  assert.equal(await chairPage.locator('[data-action="open-discipline-appeal"]').count(), 0);
  await chairPage.locator('[data-action="view-discipline"]').click();
  assert.match(await chairPage.locator(".modal").innerText(), /İtiraz\s+Uygulanamaz/);
  await chairPage.keyboard.press("Escape");
  await chairPage.locator('[data-action="open-discipline"]').click();
  await chairPage.waitForSelector('form[data-form="discipline"]');
  assert.equal(
    await chairPage.locator('[data-action="discipline-ai-analyze"]').isVisible(),
    true
  );
  await chairPage.locator("#discipline-member").selectOption(targetProfile.id);
  await chairPage.locator("#discipline-investigation").selectOption(investigation.id);
  await chairPage.locator("#discipline-reason").fill("Kurul düzenine aykırı davranış");
  await chairPage.locator("#discipline-description").fill("Olay ve savunma kayıtları kurul tarafından birlikte değerlendirilmiştir.");
  await chairPage.locator("#discipline-decree").fill("İlgili olay, savunma ve yönetmelik hükümleri değerlendirilerek karar taslağı hazırlanmıştır.");
  await chairPage.locator('[data-action="discipline-ai-analyze"]').click();
  await chairPage.locator("[data-discipline-ai-result]").getByText("Kınama", { exact: true }).waitFor({ state: "visible" });
  assert.match(await chairPage.locator("[data-discipline-ai-result]").innerText(), /Kınama/);
  await chairContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const adminPage = await openPortal(adminContext, adminProfile, "settings");
  await adminPage.waitForSelector('form[data-form="dk-logo"]');
  assert.equal(await adminPage.locator('form[data-form="dk-logo"]').isVisible(), true);
  assert.match(await adminPage.locator(".dk-logo-settings").innerText(), /Sistem Yöneticisi/);
  await adminContext.close();

  const memberContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const memberPage = await openPortal(memberContext, targetProfile);
  await memberPage.waitForSelector(".dk-access-denied");
  assert.match(await memberPage.locator(".dk-access-denied h1").innerText(), /yetkili değil/);
  await memberContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await openPortal(mobileContext, baseProfile);
  await mobilePage.waitForSelector(".dk-app-shell");
  const overflow = await mobilePage.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 8)
      .map((element) => ({
        className: element.className,
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width)
      }))
  }));
  assert.equal(
    overflow.documentWidth <= overflow.viewportWidth,
    true,
    `Mobile horizontal overflow: ${JSON.stringify(overflow)}`
  );
  await mobilePage.screenshot({ path: join(output, "portal-mobile.png"), fullPage: true });
  await mobileContext.close();

  console.log(`İHP DK visual smoke tests passed. Screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
