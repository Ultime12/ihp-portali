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
  credit_test_access: false,
  joined_at: "2026-01-10T10:00:00.000Z",
  profile_committees: []
};

const members = [
  baseProfile,
  { ...baseProfile, id: "member-2", email: "deniz@example.test", display_name: "Deniz Çiçek", member_code: "203847", roles: ["discipline_member", "member"], role: "discipline_member", avatar_initials: "DÇ" },
  { ...baseProfile, id: "president-1", email: "baskan@example.test", display_name: "Genel Başkan", member_code: "304756", roles: ["president", "member"], role: "president", avatar_initials: "GB" },
  { ...baseProfile, id: "aide-1", email: "aide@example.test", display_name: "Oguz Pamir Ozmen", member_code: "405867", roles: ["presidential_aide", "member"], role: "presidential_aide", avatar_initials: "OP" },
  { ...baseProfile, id: "discipline-chair-target", email: "dk-chair@example.test", display_name: "DK Baskani", member_code: "506978", roles: ["discipline_chair", "member"], role: "discipline_chair", avatar_initials: "DK" },
  { ...baseProfile, id: "system-test", email: "deneme@example.test", display_name: "Kredi Deneme", member_code: null, is_system_account: true, credit_test_access: true },
  { ...baseProfile, id: "admin-hidden", email: "admin.hidden@example.test", display_name: "ADMIN", member_code: null, roles: ["super_admin"], role: "super_admin" }
];

function tablePayload(table, url, profile) {
  const query = url.search;
  if (table === "profiles" && query.includes(`id=eq.${profile.id}`)) return [profile];
  if (table === "profiles") {
    const rows = members.map((item) => ({ ...item, roles: item.id === profile.id ? profile.roles : item.roles }));
    if (profile.id === "discipline-identity") {
      rows.push({
        ...baseProfile,
        id: "discipline-chief",
        email: "dk.baskani@example.test",
        display_name: "Disiplin Kurulu Başkanı",
        member_code: "887766",
        role: "discipline_chair",
        roles: ["discipline_chair", "member"]
      });
    }
    return rows;
  }
  if (table === "announcements") return [{ id: "a1", title: "Kurul toplantısı", category: "Genel", status: "published", created_at: "2026-06-18T16:00:00.000Z" }];
  if (table === "committees") return [
    { id: "c1", name: "Yürütme Kurulu", status: "active", profiles: { display_name: "Genel Başkan" } },
    { id: "c2", name: "Disiplin Kurulu", status: "active", profiles: { display_name: "Disiplin Kurulu Başkanı" } }
  ];
  if (table === "positions") {
    const role = profile.roles[0] || "member";
    const rolePositions = {
      president: ["Başkan", 10, "Yürütme Kurulu"],
      discipline_member: ["Disiplin Kurulu Üyesi", 5, "Disiplin Kurulu"],
      member: ["Üye", 1, "Genel Üyelik"]
    };
    const [title, authority, committee] = rolePositions[role] || [role, 1, "Genel Üyelik"];
    return [{
      id: `position-${profile.id}`,
      title,
      authority_level: authority,
      assigned_profile_id: profile.id,
      status: "active",
      committees: { name: committee }
    }];
  }
  if (table === "notifications") return [{ id: "n1", title: "Portal bildirimi", body: "Yeni duyuru yayınlandı.", category: "system", created_at: "2026-06-18T17:00:00.000Z", read_at: null }];
  if (table === "applications") return [{ id: "ap1", status: "new", created_at: "2026-06-18T12:00:00.000Z" }];
  if (table === "complaints") return [{
    id: "complaint-open",
    complainant_profile_id: "member-1",
    accused_profile_id: "president-1",
    assigned_to: "member-2",
    subject: "Test sikayeti",
    description: "Sorumlu degisikligi test kaydi.",
    priority: "normal",
    status: "new",
    complainant: members[0],
    accused: members[2],
    assignee: members[1],
    created_at: "2026-06-18T12:30:00.000Z"
  }];
  if (table === "discipline_records") return [{
    id: "discipline-existing",
    member_id: "member-2",
    investigation_id: "investigation-used",
    record_type: "Uyarı",
    reason: "Mevcut karar",
    description: "Mevcut disiplin kararı",
    decision_status: "decided",
    archived: false,
    created_at: "2026-06-18T13:00:00.000Z"
  }];
  if (table === "investigations") return [
    { id: "investigation-used", subject_profile_id: "member-2", title: "Karara bağlanan soruşturma", status: "reviewing", subject: members[1], created_at: "2026-06-18T12:00:00.000Z" },
    { id: "investigation-open", subject_profile_id: "member-2", assigned_to: "member-2", title: "Açık soruşturma", status: "open", subject: members[1], assignee: { id: "member-2", display_name: "Deniz Çiçek" }, created_at: "2026-06-19T12:00:00.000Z" },
    { id: "investigation-closed", subject_profile_id: "member-2", title: "Kapalı soruşturma", status: "closed", subject: members[1], created_at: "2026-06-17T12:00:00.000Z" }
  ];
  if (table === "portal_settings") return [{ id: "main", portal_name: "İHP Portalı", logo_url: null, notifications_enabled: true }];
  return [];
}

async function mockBackend(page, profile) {
  const approvedGameKeys = new Set();
  let creditAccountClosed = false;
  let scheduledTransfers = [];
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/config", (route) => route.fulfill({ json: { configured: true, supabaseUrl: "https://mock.supabase.test", supabaseAnonKey: "publishable-test" } }));
  await page.route("https://mock.supabase.test/auth/v1/logout", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/flappy-session", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.module === "game_center") {
      return route.fulfill({
        json: {
          creditBalance: 500,
          creditAccount: profile.id === "funded-credit" && !creditAccountClosed ? { id: "funded-account", account_code: "IHP111222333", balance: 500, status: "active" } : null,
          gameCreditRequests: [...approvedGameKeys].map((gameKey) => ({ id: `approved-${gameKey}`, game_key: gameKey, credit_amount: 5, status: "approved" })),
          attempts: [],
          adminStats: { flappy: 0, snake: 0, scratch: 0 },
          memberStatus: [{ id: profile.id, displayName: profile.display_name, creditBalance: 500, flappy: false, snake: false, scratch: false }],
          settings: [
            { game_key: "flappy", display_name: "İHP Flappy", enabled: true, entry_cost: 5, reward_points: 10, target_score: 10000, win_probability_basis_points: 0, attempt_period: "unlimited" },
            { game_key: "snake", display_name: "İHP Snake", enabled: true, entry_cost: 5, reward_points: 10, target_score: 1000, win_probability_basis_points: 0, attempt_period: "unlimited" },
            { game_key: "scratch", display_name: "İHP Kazı Kazan", enabled: true, entry_cost: 10, reward_points: 20, target_score: 0, win_probability_basis_points: 800, attempt_period: "unlimited" }
          ]
        }
      });
    }
    if (body.action === "start") {
      return route.fulfill({ json: { session: { id: "game-1", seed: 12345, status: "active", score: 0 }, creditBalance: 495 } });
    }
    return route.fulfill({
      json: {
        session: null,
        creditBalance: 500,
        config: { enabled: true, entryCost: 5, reward: 10, targetScore: 10000, scorePerPipe: 400 }
      }
    });
  });
  await page.route("**/api/manage-member", (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.module === "credit" && body.action === "decide_game_charge") {
      if (body.approve) approvedGameKeys.add("snake");
      return route.fulfill({ json: {
        settings: { member_access_enabled: true, transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1 },
        account: { id: "funded-account", profile_id: profile.id, account_code: "IHP111222333", balance: 495, status: "active" },
        loans: [], installments: [], transactions: [], cheques: [],
        gameRequests: [...approvedGameKeys].map((gameKey) => ({ id: `approved-${gameKey}`, game_key: gameKey, credit_amount: 5, status: "approved" }))
      } });
    }
    if (body.module === "credit" && body.action === "close_account") {
      creditAccountClosed = true;
      return route.fulfill({ json: {
        settings: { member_access_enabled: true, transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1 },
        account: null, loans: [], installments: [], transactions: [], cheques: [], gameRequests: []
      } });
    }
    if (body.module === "credit" && body.action === "issue_cheque") {
      return route.fulfill({ json: {
        code: "123456789012345678901234",
        settings: { member_access_enabled: true, transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1 },
        account: { id: "funded-account", profile_id: profile.id, account_code: "IHP111222333", balance: 400, status: "active" },
        loans: [], installments: [], transactions: [], cheques: [], gameRequests: []
      } });
    }
    if (body.module === "credit" && body.action === "schedule_transfer") {
      scheduledTransfers = [{
        id: "scheduled-transfer-1",
        sender_account_id: "funded-account",
        recipient_account_id: "recipient-account",
        recipient_account_code: body.recipientCode,
        amount: body.amount,
        tax: Math.ceil(body.amount * .2),
        total_debit: Math.ceil(body.amount * 1.2),
        description: body.description,
        scheduled_for: body.scheduledFor,
        status: "scheduled",
        created_at: new Date().toISOString()
      }];
      return route.fulfill({ json: {
        settings: { member_access_enabled: true, weekly_allowance_enabled: true, weekly_allowance_next_at: "2026-07-01T16:00:00.000Z", weekly_allowance_last_at: "2026-06-24T16:00:00.000Z", transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1 },
        account: { id: "funded-account", profile_id: profile.id, account_code: "IHP111222333", balance: 380, status: "active" },
        loans: [], installments: [], transactions: [], cheques: [], scheduledTransfers, gameRequests: []
      } });
    }
    if (body.module === "credit" && body.action === "cancel_scheduled_transfer") {
      scheduledTransfers = scheduledTransfers.map((item) => ({ ...item, status: "cancelled", cancelled_at: new Date().toISOString() }));
      return route.fulfill({ json: {
        settings: { member_access_enabled: true, weekly_allowance_enabled: true, weekly_allowance_next_at: "2026-07-01T16:00:00.000Z", weekly_allowance_last_at: "2026-06-24T16:00:00.000Z", transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1 },
        account: { id: "funded-account", profile_id: profile.id, account_code: "IHP111222333", balance: 500, status: "active" },
        loans: [], installments: [], transactions: [], cheques: [], scheduledTransfers, gameRequests: []
      } });
    }
    if (body.module === "credit" && body.action === "member_status") {
      const funded = profile.id === "funded-credit";
      return route.fulfill({ json: {
        settings: { member_access_enabled: true, weekly_allowance_enabled: true, weekly_allowance_next_at: "2026-07-01T16:00:00.000Z", weekly_allowance_last_at: "2026-06-24T16:00:00.000Z", transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1 },
        account: funded && !creditAccountClosed ? { id: "funded-account", profile_id: profile.id, account_code: "IHP111222333", balance: 500, status: "active" } : null,
        loans: [], installments: [], transactions: [], cheques: [], scheduledTransfers,
        gameRequests: funded ? [{ id: "game-charge-1", game_key: "snake", credit_amount: 5, status: "pending", requested_at: "2026-06-21T10:00:00.000Z" }] : []
      } });
    }
    return route.fulfill({ json: {
      settings: { member_access_enabled: true, weekly_allowance_enabled: false, weekly_allowance_next_at: "2026-07-01T16:00:00.000Z", weekly_allowance_last_at: "2026-06-24T16:00:00.000Z", transfer_tax_basis_points: 2000, loan_interest_basis_points: 1000, max_loan_amount: 5000, max_term_days: 30, grace_days: 1, role_allowances: {} },
      accounts: [
        { id: "admin-test-account", profile_id: "member-1", account_code: "IHP123456789", balance: 250, status: "active" },
        ...(profile.roles.includes("credit_officer") ? [{ id: "credit-officer-own", profile_id: profile.id, account_code: "IHP555666777", balance: 300, status: "active" }] : [])
      ], profiles: [...members, profile],
      loans: profile.roles.includes("credit_officer") ? [
        { id: "loan-pending", account_id: "admin-test-account", principal: 500, total_due: 550, term_days: 30, installment_count: 2, status: "pending" },
        { id: "loan-own", account_id: "credit-officer-own", principal: 250, total_due: 275, term_days: 14, installment_count: 2, status: "pending" }
      ] : [],
      installments: [], transactions: [
        { id: "tx-in", account_id: "admin-test-account", kind: "transfer_in", amount: 100, balance_after: 250, created_at: "2026-06-20T12:00:00.000Z", metadata: {} },
        { id: "tx-out", account_id: "admin-test-account", kind: "transfer_out", amount: 50, balance_after: 150, created_at: "2026-06-20T11:00:00.000Z", metadata: {} }
      ], cheques: [], scheduledTransfers: []
    } });
  });
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
    await portalPage.locator("[data-theme-select]").selectOption("light");
    assert.equal(await portalPage.locator("html").getAttribute("data-theme"), "light", "light theme should apply");
    assert.equal(await portalPage.evaluate(() => getComputedStyle(document.documentElement).colorScheme), "light", "light theme must use a light color scheme");
    assert.equal(await portalPage.locator(".dashboard-hero h2").evaluate((element) => getComputedStyle(element).color), "rgb(16, 36, 59)", "light theme hero text must keep readable contrast");
    await portalPage.screenshot({ path: join(output, `${viewport.name}-portal-light.png`), fullPage: true });
    assert.equal(await portalPage.locator(".premium-metrics .metric-card").first().locator("strong").innerText(), "05", "dashboard member count must exclude test and technical admin accounts");
    await portalPage.locator("[data-theme-select]").selectOption("green");
    assert.equal(await portalPage.locator("html").getAttribute("data-theme"), "green", "theme selection should apply");
    await portalPage.locator('[data-action="open-notifications"]').click();
    assert.equal(await portalPage.locator('[role="dialog"]').isVisible(), true, "notifications modal should open");
    await portalPage.waitForTimeout(75);
    assert.equal(await portalPage.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), true, "modal should receive focus");
    await portalPage.keyboard.press("Escape");
    await portalPage.evaluate(() => { location.hash = "#/portal/games"; });
    await portalPage.waitForSelector(".arcade-grid");
    assert.equal(await portalPage.getByRole("button", { name: "Kredi hesabı aç" }).count(), 3, `${viewport.name}: paid games must require a credit account`);
    assert.match(await portalPage.locator(".arcade-flappy").innerText(), /Can\s+3/);
    assert.match(await portalPage.locator(".arcade-head").innerText(), /Kredili oyunlar sınırsızdır/);
    await portalPage.locator('[data-action="start-snake-practice"]').click();
    assert.equal(await portalPage.locator(".snake-board").isVisible(), true, `${viewport.name}: Snake practice should open`);
    await portalPage.keyboard.press("Escape");
    await portalPage.locator('[data-action="start-flappy-practice"]').click();
    assert.equal(await portalPage.locator(".flappy-canvas").isVisible(), true, `${viewport.name}: practice game should open`);
    assert.match(await portalPage.locator("[data-flappy-lives]").innerText(), /3 can/i);
    await portalPage.waitForFunction(() => document.querySelector("[data-flappy-countdown]")?.hidden === true);
    assert.equal(await portalPage.locator("[data-flappy-countdown]").isHidden(), true, `${viewport.name}: countdown overlay should disappear when the game starts`);
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

  const deletionContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const deletionPage = await deletionContext.newPage();
  await openPortal(deletionPage, baseProfile, "settings");
  await deletionPage.getByRole("button", { name: "Hesabımı sil", exact: true }).click();
  const deleteSubmit = deletionPage.locator("[data-delete-account-submit]");
  assert.equal(await deleteSubmit.isDisabled(), true, "account deletion must be locked initially");
  await deletionPage.locator("[data-account-delete-consent]").check();
  await deletionPage.locator("[data-account-delete-text]").fill("HESABIMI SİL");
  assert.equal(await deleteSubmit.isEnabled(), true, "account deletion requires consent and exact phrase");
  await deleteSubmit.click();
  await deletionPage.waitForSelector(".premium-public");
  assert.equal(await deletionPage.evaluate(() => localStorage.getItem("ihp-auth-session")), null, "deleted account session must be cleared");
  await deletionContext.close();

  const roleCases = [
    { name: "admin", roles: ["super_admin"], visible: "Sistem", hidden: null, credential: "member" },
    { name: "president", roles: ["discipline_chair", "president", "member"], visible: "Başkanlık", hidden: null, credential: "presidency" },
    { name: "discipline-chair", roles: ["discipline_chair", "member"], visible: "Disiplin İşlemleri", hidden: "Başkanlık", credential: "discipline" },
    { name: "discipline-member", roles: ["discipline_member", "member"], visible: "Soruşturmalar", hidden: "Başkanlık", credential: "discipline" },
    { name: "youth-chair", roles: ["youth_chair", "member"], visible: "Gençlik Kolları", hidden: "Soruşturmalar", credential: "youth" },
    { name: "representative", roles: ["representative", "member"], visible: "Antlaşmalar", hidden: "Soruşturmalar", credential: "executive" },
    { name: "credit-officer", roles: ["credit_officer", "member"], visible: "Kredi Yönetimi", hidden: "Soruşturmalar", credential: "member" },
    { name: "member", roles: ["member"], visible: "Antlaşmalar", hidden: "Soruşturmalar", credential: "member" }
  ];

  for (const roleCase of roleCases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const profile = { ...baseProfile, id: roleCase.name, email: `${roleCase.name}@example.test`, roles: roleCase.roles, role: roleCase.roles[0], theme_preference: "blue" };
    await openPortal(page, profile);
    assert.equal(await page.getByText(roleCase.visible, { exact: true }).first().isVisible(), true, `${roleCase.name}: expected menu item`);
    if (roleCase.hidden) assert.equal(await page.getByText(roleCase.hidden, { exact: true }).count(), 0, `${roleCase.name}: forbidden menu item`);
    assert.equal(await page.getByText("Bilgilerim", { exact: true }).count(), 0, `${roleCase.name}: separate identity navigation should be removed`);
    await page.locator('[data-action="open-member-credential"]').click();
    await page.waitForSelector(".credential-modal-stage");
    if (roleCase.credential === "member") {
      assert.equal(await page.locator(".member-standard-card").isVisible(), true, `${roleCase.name}: standard member identity should open`);
      assert.equal(await page.locator(".official-credential").count(), 0, `${roleCase.name}: role badge should not be shown`);
    } else {
      assert.equal(await page.locator(`.official-credential-${roleCase.credential}`).isVisible(), true, `${roleCase.name}: highest role badge should open`);
      assert.equal(await page.locator(".member-standard-card").count(), 0, `${roleCase.name}: standard identity should be hidden for office holders`);
      assert.equal(await page.locator(".official-credential").count(), 1, `${roleCase.name}: only one highest badge should be shown`);
    }
    if (roleCase.name === "president") {
      assert.match(await page.locator(".official-credential").innerText(), /Genel Başkan/);
      assert.equal(await page.locator(".official-credential-discipline").count(), 0, "president and discipline chair should only see presidency");
      await page.screenshot({ path: join(output, "desktop-president-credential.png"), fullPage: true });
    }
    await page.keyboard.press("Escape");
    await context.close();
  }

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  const adminProfile = { ...baseProfile, id: "admin-credit", email: "admin@example.test", roles: ["super_admin"], role: "super_admin", theme_preference: "blue" };
  await openPortal(adminPage, adminProfile, "credit-management");
  assert.equal(await adminPage.locator(".credit-settings-panel").isVisible(), true, "admin should see credit settings");
  assert.equal(await adminPage.locator("[data-credit-weekly-next]").count(), 1, "admin should configure the weekly allowance start time");
  assert.equal(await adminPage.locator(".credit-transaction-amount.incoming").count(), 1, "incoming credit should have positive styling");
  assert.equal(await adminPage.locator(".credit-transaction-amount.outgoing").count(), 1, "outgoing credit should have negative styling");
  assert.equal(await adminPage.locator('[data-action="open-credit-adjustment"]').isVisible(), true, "admin should see balance adjustment action");
  await adminPage.locator('[data-action="open-credit-adjustment"]').click();
  assert.equal(await adminPage.locator("#credit-adjust-amount").isVisible(), true, "admin balance adjustment modal should open");
  assert.equal(await adminPage.locator("#credit-adjust-amount").getAttribute("max"), null, "credit balance adjustment must not have the old hard cap");
  await adminPage.keyboard.press("Escape");
  await adminPage.evaluate(() => { location.hash = "#/portal/presidency"; });
  await adminPage.waitForSelector(".hierarchy-list");
  await adminPage.locator('[data-action="edit-member"]').first().click();
  assert.equal(await adminPage.locator("#member-discipline-points").isVisible(), true, "admin should directly edit member discipline points");
  assert.equal(await adminPage.locator("#member-discipline-points").inputValue(), "100");
  await adminPage.keyboard.press("Escape");
  await adminPage.evaluate(() => { location.hash = "#/portal/investigations"; });
  await adminPage.waitForSelector('[data-action="edit-investigation"][data-id="investigation-open"]');
  await adminPage.locator('[data-action="edit-investigation"][data-id="investigation-open"]').click();
  assert.equal(await adminPage.locator("#investigation-edit-assignee").isVisible(), true, "admin should edit investigation assignee");
  assert.equal(await adminPage.locator('#investigation-edit-assignee option[value="member-2"]').count(), 1, "admin assignment list should include active discipline staff");
  await adminPage.keyboard.press("Escape");
  await adminPage.evaluate(() => { location.hash = "#/portal/complaints"; });
  await adminPage.waitForSelector('[data-action="open-complaint-assignee"][data-id="complaint-open"]');
  await adminPage.locator('[data-action="open-complaint-assignee"][data-id="complaint-open"]').click();
  assert.equal(await adminPage.locator("#complaint-assignee-member").isVisible(), true, "admin should edit complaint assignee");
  assert.equal(await adminPage.locator('#complaint-assignee-member option[value="member-2"]').count(), 1, "complaint assignee list should include active discipline staff");
  assert.equal(await adminPage.locator("#complaint-target-member").count(), 0, "complaint admin edit should not expose accused member editing");
  await adminPage.keyboard.press("Escape");
  await adminContext.close();

  const creditOfficerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const creditOfficerPage = await creditOfficerContext.newPage();
  const creditOfficerProfile = { ...baseProfile, id: "credit-officer-panel", email: "credit.officer@example.test", roles: ["credit_officer", "member"], role: "credit_officer", theme_preference: "blue" };
  await openPortal(creditOfficerPage, creditOfficerProfile, "credit-management");
  assert.equal(await creditOfficerPage.getByText("Kredi Hesabım", { exact: true }).first().isVisible(), true, "credit officer should retain a personal account menu");
  assert.equal(await creditOfficerPage.getByText("Kredi Yönetimi", { exact: true }).first().isVisible(), true, "credit officer should see separate management menu");
  assert.equal(await creditOfficerPage.locator(".credit-settings-panel").count(), 0, "credit officer must not change Admin economy settings");
  assert.equal(await creditOfficerPage.locator('[data-action="open-credit-adjustment"]').isVisible(), true, "credit officer should manage balances");
  assert.equal(await creditOfficerPage.locator('[data-action="open-credit-adjustment"][data-id="credit-officer-own"]').count(), 0, "credit officer must not adjust their own account");
  assert.equal(await creditOfficerPage.getByText("Kendi hesabın", { exact: true }).isVisible(), true, "own officer account should be visibly locked");
  assert.equal(await creditOfficerPage.getByRole("button", { name: "Onayla" }).first().isVisible(), true, "credit officer should review credit applications");
  assert.equal(await creditOfficerPage.locator('[data-action="open-credit-review"][data-id="loan-own"]').count(), 0, "credit officer must not review their own loan application");
  assert.equal(await creditOfficerPage.locator(".credit-self-service-lock").isVisible(), true, "own loan application should be visibly locked");
  await creditOfficerContext.close();

  const ordinaryCreditContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ordinaryCreditPage = await ordinaryCreditContext.newPage();
  await openPortal(ordinaryCreditPage, baseProfile);
  assert.equal(await ordinaryCreditPage.getByText("Kredi Hesabım", { exact: true }).first().isVisible(), true, "ordinary members must see credit navigation");
  assert.equal(await ordinaryCreditPage.getByText("Bilgilerim", { exact: true }).count(), 0, "identity should not use a separate navigation item");
  await ordinaryCreditPage.locator('[data-action="open-member-credential"]').click();
  assert.equal(await ordinaryCreditPage.locator(".member-standard-card").isVisible(), true, "ordinary member should open the standard digital identity");
  assert.equal(await ordinaryCreditPage.locator(".official-credential").count(), 0, "ordinary member should not receive an office badge");
  await ordinaryCreditContext.close();

  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    const identityContext = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const identityPage = await identityContext.newPage();
    const identityProfile = {
      ...baseProfile,
      id: "discipline-identity",
      email: "disiplin.uye@example.test",
      display_name: "Ekin Deniz Aras",
      member_code: "451209",
      role: "discipline_member",
      roles: ["discipline_member", "member"],
      avatar_initials: "EDA",
      profile_committees: [{
        committee_id: "c2",
        role_in_committee: "member",
        committee: { id: "c2", name: "Disiplin Kurulu", status: "active" }
      }]
    };
    await openPortal(identityPage, identityProfile);
    if (viewport.name === "mobile") {
      await identityPage.locator('[data-action="toggle-sidebar"]').click();
      await identityPage.locator(".sidebar.open").waitFor({ state: "visible" });
    }
    const starButton = identityPage.locator('[data-action="open-member-credential"]');
    assert.equal(await starButton.isVisible(), true, `${viewport.name}: credential star should be visible`);
    await starButton.click();
    await identityPage.waitForSelector(".official-credential-discipline");
    assert.equal(await identityPage.locator(".official-credential-discipline").isVisible(), true, `${viewport.name}: discipline badge should open`);
    assert.equal(await identityPage.locator(".member-standard-card").count(), 0, `${viewport.name}: office holder should not see standard identity`);
    assert.match(await identityPage.locator(".official-credential").innerText(), /Disiplin Kurulu Üyesi/);
    assert.match(await identityPage.locator(".official-credential").innerText(), /451209/);
    assert.equal(await identityPage.locator(".official-barcode").isVisible(), true, `${viewport.name}: barcode should render`);
    const credentialSpacing = await identityPage.evaluate(() => {
      const emblem = document.querySelector(".official-credential-emblem")?.getBoundingClientRect();
      const rank = document.querySelector(".official-credential-rank")?.getBoundingClientRect();
      return { emblemBottom: emblem?.bottom || 0, rankTop: rank?.top || 0 };
    });
    assert.equal(credentialSpacing.emblemBottom <= credentialSpacing.rankTop, true, `${viewport.name}: emblem must not overlap the rank label`);
    const cardSize = await identityPage.locator(".official-credential").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    assert.equal(cardSize.height > cardSize.width * 1.4, true, `${viewport.name}: credential should use a vertical ratio`);
    assert.match(await identityPage.locator(".official-credential").evaluate((element) => getComputedStyle(element).backgroundImage), /linear-gradient/, `${viewport.name}: institution theme should render`);
    const identityOverflow = await identityPage.evaluate(() => ({
      fits: document.documentElement.scrollWidth <= window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
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
    assert.equal(identityOverflow.fits, true, `${viewport.name}: identity horizontal overflow ${JSON.stringify(identityOverflow)}`);
    await identityPage.screenshot({ path: join(output, `${viewport.name}-identity.png`), fullPage: true });
    await identityContext.close();
  }

  const fundedCreditContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const fundedCreditPage = await fundedCreditContext.newPage();
  await openPortal(fundedCreditPage, { ...baseProfile, id: "funded-credit", email: "funded@example.test" }, "credit");
  assert.equal(await fundedCreditPage.getByText("İHP Snake", { exact: true }).isVisible(), true, "pending game charge must appear in credit center");
  await fundedCreditPage.locator('[data-action="approve-game-charge"]').click();
  await fundedCreditPage.waitForSelector(".arcade-grid");
  assert.equal(await fundedCreditPage.locator('[data-action="start-approved-snake"]').isVisible(), true, "approved credit charge must immediately activate the game");
  await fundedCreditPage.evaluate(() => { location.hash = "#/portal/credit"; });
  await fundedCreditPage.waitForSelector(".credit-balance-stage");
  await fundedCreditPage.getByText("Kredi transferi", { exact: true }).click();
  await fundedCreditPage.locator("[data-credit-recipient]").fill("IHP999888777");
  await fundedCreditPage.locator("[data-credit-transfer-amount]").fill("100");
  await fundedCreditPage.locator("[data-credit-transfer-description]").fill("Kurul etkinlik ödemesi");
  assert.match(await fundedCreditPage.locator("[data-credit-transfer-preview]").innerText(), /Vergi\s+20 kredi/);
  assert.match(await fundedCreditPage.locator("[data-credit-transfer-preview]").innerText(), /Toplam kesinti\s+120 kredi/);
  assert.equal(await fundedCreditPage.locator('[data-action="credit-member-transfer"]').isEnabled(), true, "valid transfer with tax preview must be enabled");
  await fundedCreditPage.locator('[data-credit-delivery][value="scheduled"]').check();
  const scheduledTransferValue = await fundedCreditPage.evaluate(() => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  });
  await fundedCreditPage.locator("[data-credit-scheduled-for]").fill(scheduledTransferValue);
  assert.equal(await fundedCreditPage.locator("[data-credit-schedule-field]").isVisible(), true, "scheduled transfer date field should appear");
  assert.match(await fundedCreditPage.locator("[data-credit-delivery-note]").innerText(), /rezerve edilir/i);
  await fundedCreditPage.locator('[data-action="credit-member-transfer"]').click();
  await fundedCreditPage.waitForSelector(".credit-scheduled-panel");
  assert.equal(await fundedCreditPage.locator(".credit-scheduled-panel").isVisible(), true, "scheduled transfer should appear in the transfer calendar");
  assert.match(await fundedCreditPage.locator(".credit-scheduled-item").innerText(), /Kurul etkinlik ödemesi/);
  await fundedCreditPage.locator('[data-action="credit-cancel-scheduled-transfer"]').click();
  await fundedCreditPage.waitForFunction(() => document.querySelector(".credit-scheduled-item")?.textContent?.includes("İptal edildi"));
  assert.match(await fundedCreditPage.locator(".credit-scheduled-item").innerText(), /İptal edildi/);
  await fundedCreditPage.getByText("Çek işlemleri", { exact: true }).click();
  await fundedCreditPage.locator("[data-credit-cheque-amount]").fill("100");
  await fundedCreditPage.locator('[data-action="credit-member-issue-cheque"]').click();
  await fundedCreditPage.waitForSelector('[data-action="download-credit-cheque"]');
  assert.equal(await fundedCreditPage.locator('[data-action="download-credit-cheque"]').isVisible(), true, "created cheque should offer a PDF document");
  const chequeDownload = fundedCreditPage.waitForEvent("download");
  await fundedCreditPage.locator('[data-action="download-credit-cheque"]').click();
  assert.match((await chequeDownload).suggestedFilename(), /^IHP-Kredi-Ceki-1234\.pdf$/);
  await fundedCreditPage.keyboard.press("Escape");
  await fundedCreditPage.locator('[data-action="open-credit-account-close"]').click();
  const closeCreditButton = fundedCreditPage.locator('[data-action="confirm-credit-account-close"]');
  assert.equal(await closeCreditButton.isDisabled(), true, "credit account closure must require explicit consent");
  await fundedCreditPage.locator("[data-credit-close-consent]").check();
  await fundedCreditPage.locator("[data-credit-close-text]").fill("KREDİ HESABIMI SİL");
  assert.equal(await closeCreditButton.isEnabled(), true, "credit account closure must require the exact phrase");
  await closeCreditButton.click();
  await fundedCreditPage.waitForSelector(".credit-onboarding-layout");
  await fundedCreditContext.close();

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
  assert.equal(await disciplinePage.locator('#discipline-member option[value="discipline-chair-target"]').count(), 1, "DK chair should be selectable for point penalties");
  assert.equal(await disciplinePage.locator('#discipline-member option[value="aide-1"]').count(), 1, "presidential aide should be selectable for discipline action");
  assert.equal(await disciplinePage.locator('#discipline-investigation option[value="investigation-open"]').count(), 1, "unused open investigation should be selectable");
  assert.equal(await disciplinePage.locator('#discipline-investigation option[value="investigation-used"]').count(), 0, "investigation with a penalty must not be selectable again");
  assert.equal(await disciplinePage.locator('#discipline-investigation option[value="investigation-closed"]').count(), 0, "closed investigation must not be selectable");
  const suspensionField = disciplinePage.locator("[data-discipline-suspension]");
  assert.equal(await suspensionField.isHidden(), true, "suspension duration should start hidden");
  await disciplinePage.locator("#discipline-effect").selectOption("party_suspension");
  assert.equal(await suspensionField.isVisible(), true, "suspension duration should appear for party suspension");
  assert.equal(await disciplinePage.locator("#discipline-sanction-days").isEnabled(), true);
  assert.equal(await disciplinePage.locator("#discipline-sanction-days").getAttribute("required"), "");
  await disciplinePage.locator("#discipline-effect").selectOption("none");
  assert.equal(await suspensionField.isHidden(), true, "suspension duration should hide for other sanctions");
  assert.equal(await disciplinePage.locator("#discipline-sanction-days").isDisabled(), true);
  await disciplinePage.locator("#discipline-member").selectOption("president-1");
  await disciplinePage.locator("#discipline-effect").selectOption("points_only");
  await disciplinePage.locator("#discipline-point-delta").fill("-10");
  await disciplinePage.locator("#discipline-point-delta").dispatchEvent("input");
  assert.equal(await disciplinePage.locator("#discipline-investigation").getAttribute("required"), "", "DK chair point penalty for president should still require investigation");
  assert.equal(await disciplinePage.locator("#discipline-credit-fine").isVisible(), true, "discipline form should include credit fine debt amount");
  await disciplinePage.locator("#discipline-credit-fine").fill("120");
  await disciplinePage.locator("#discipline-credit-installments").selectOption("3");
  await disciplinePage.locator("#discipline-effect").selectOption("remove_roles");
  assert.equal(await disciplinePage.locator("#discipline-investigation").getAttribute("required"), "", "role sanction should still require investigation");
  await disciplinePage.keyboard.press("Escape");
  await disciplinePage.goto(`${baseUrl}/#/portal/investigations`);
  await disciplinePage.waitForSelector(".app-shell");
  await disciplinePage.locator('[data-action="open-investigation"]').click();
  assert.equal(await disciplinePage.locator('#investigation-subject option[value="discipline-chair-target"]').count(), 1, "investigation can be opened for DK chair");
  assert.equal(await disciplinePage.locator('#investigation-subject option[value="aide-1"]').count(), 1, "investigation can be opened for presidential aide");
  await disciplineContext.close();

  const accessContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const accessPage = await accessContext.newPage();
  const accessProfile = { ...baseProfile, id: "access-account", email: "giris@tfo.k12.tr", display_name: "Geçiş Görevlisi", roles: [], role: "member", member_code: null, is_system_account: true, theme_preference: "blue" };
  await openPortal(accessPage, accessProfile, "access");
  assert.equal(await accessPage.locator(".app-nav .nav-item").count(), 1, "access account should see one menu item");
  assert.equal(await accessPage.getByText("Geçiş", { exact: true }).first().isVisible(), true);
  assert.equal(await accessPage.locator('[data-action="open-member-credential"]').count(), 0, "system access account should not receive an identity star");
  await accessContext.close();

  console.log(`Premium smoke tests passed. Screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
