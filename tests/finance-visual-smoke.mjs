import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const dist = join(root, "dist-finance");
const output = join(root, "test-results", "finance");
const chrome = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    let filePath = normalize(join(dist, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(dist) || !(await stat(filePath).catch(() => null))?.isFile()) filePath = join(dist, "index.html");
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

const profile = {
  id: "finance-member",
  email: "uye@example.test",
  display_name: "Tuna Mert Köse",
  role: "member",
  roles: ["member"],
  status: "active",
  discipline_points: 100,
  member_code: "817402",
  avatar_initials: "TMK",
  avatar_color: "#355b86",
  theme_preference: "blue",
  is_system_account: false,
  joined_at: "2026-01-10T10:00:00.000Z",
  profile_committees: []
};

const creditStatus = {
  settings: {
    member_access_enabled: true,
    weekly_allowance_enabled: true,
    weekly_allowance_next_at: "2026-07-15T09:00:00.000Z",
    weekly_allowance_last_at: "2026-07-08T09:00:00.000Z",
    transfer_tax_basis_points: 2000,
    loan_interest_basis_points: 1000,
    max_loan_amount: 5000,
    max_term_days: 30,
    grace_days: 1
  },
  account: { id: "credit-1", profile_id: profile.id, account_code: "IHP111222333", balance: 8650, status: "active" },
  loans: [{ id: "loan-1", account_id: "credit-1", principal: 1200, total_due: 1320, paid_amount: 440, status: "approved", installment_count: 3, term_days: 30, created_at: "2026-07-01T09:00:00.000Z" }],
  installments: [{ id: "installment-1", loan_id: "loan-1", installment_no: 2, amount: 440, status: "pending", due_at: "2026-07-20T09:00:00.000Z" }],
  transactions: [
    { id: "tx-1", account_id: "credit-1", kind: "transfer_in", amount: 500, balance_after: 8650, metadata: { description: "Kurul ödemesi" }, created_at: "2026-07-12T09:00:00.000Z" },
    { id: "tx-2", account_id: "credit-1", kind: "transfer_out", amount: 120, balance_after: 8150, metadata: { description: "Planlı transfer" }, created_at: "2026-07-11T09:00:00.000Z" }
  ],
  cheques: [],
  scheduledTransfers: [{ id: "scheduled-1", amount: 250, tax: 50, recipient_account_code: "IHP900000002", description: "Toplantı gideri", status: "scheduled", scheduled_for: "2026-07-13T16:00:00.000Z" }],
  gameRequests: [{ id: "request-1", game_key: "scratch", credit_amount: 30, status: "pending", requested_at: "2026-07-12T08:00:00.000Z" }]
};

const instruments = [
  ["THYAO.IS", "THYAO", "Türk Hava Yolları", 318.5, 3.9, 1.24],
  ["TUPRS.IS", "TUPRS", "Tüpraş", 146.7, -1.2, -0.81],
  ["GARAN.IS", "GARAN", "Garanti BBVA", 132.2, 2.4, 1.85],
  ["ASELS.IS", "ASELS", "Aselsan", 179.4, 1.9, 1.07]
].map(([symbol, code, name, price, change, changePercent]) => ({ symbol, code, name, price, change, changePercent, updatedAt: "2026-07-12T10:30:00.000Z" }));

function marketStatus(symbol = "THYAO.IS", range = "1w") {
  const selected = instruments.find((item) => item.symbol === symbol) || instruments[0];
  const pointCount = range === "1d" ? 36 : range === "1y" ? 64 : 48;
  return {
    unit: "İHP kredi",
    source: "Yahoo Finance",
    refreshSeconds: 60,
    selectedSymbol: selected.symbol,
    range,
    updatedAt: "2026-07-12T10:30:00.000Z",
    instruments,
    series: Array.from({ length: pointCount }, (_, index) => ({
      timestamp: Date.UTC(2026, 6, 1) + index * 3_600_000,
      value: selected.price - 6 + Math.sin(index / 4) * 5 + index * 0.18
    }))
  };
}

function financeStatus(symbol, range) {
  const market = marketStatus(symbol, range);
  return {
    creditAccount: creditStatus.account,
    account: { id: "finance-1", profile_id: profile.id, credit_account_id: "credit-1", cash_balance: 2500, portfolio_fee_consent_at: "2026-07-01T09:00:00.000Z", portfolio_fee_last_charged_at: "2026-07-08T09:00:00.000Z", portfolio_fee_debt: 0 },
    positions: [{ id: "position-1", finance_account_id: "finance-1", symbol: "THYAO.IS", quantity: 2, average_cost: 300, current_price: 318.5, market_value: 637, cost_value: 600, profit: 37, instrument: instruments[0] }],
    transactions: [{ id: "finance-tx-1", finance_account_id: "finance-1", kind: "buy", symbol: "THYAO.IS", quantity: 2, unit_price: 300, amount: 600, cash_balance_after: 2500, created_at: "2026-07-10T10:00:00.000Z" }],
    totals: { marketValue: 637, costValue: 600, profit: 37, totalValue: 3137 },
    fee: { weeklyRatePercent: 10, consentRequired: false, consentedAt: "2026-07-01T09:00:00.000Z", lastChargedAt: "2026-07-08T09:00:00.000Z", nextChargeAt: "2026-07-15T09:00:00.000Z", debt: 0, basis: 3100, weeklyEstimate: 310 },
    market
  };
}

function session() {
  return { access_token: "finance-access", refresh_token: "finance-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: profile.id, email: profile.email } };
}

async function installMocks(page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/config", (route) => route.fulfill({ json: { configured: true, supabaseUrl: "https://mock.supabase.test", supabaseAnonKey: "publishable-test" } }));
  await page.route("**/api/manage-member", (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.module === "finance") return route.fulfill({ json: financeStatus(body.symbol, body.range) });
    if (body.module === "market") return route.fulfill({ json: marketStatus(body.symbol, body.range) });
    if (body.module === "credit") return route.fulfill({ json: creditStatus });
    return route.fulfill({ json: {} });
  });
  await page.route("https://mock.supabase.test/auth/v1/token?*", (route) => route.fulfill({ json: session() }));
  await page.route("https://mock.supabase.test/auth/v1/logout", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://mock.supabase.test/rest/v1/**", (route) => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    if (table === "profiles") return route.fulfill({ json: [profile] });
    if (table === "portal_settings") return route.fulfill({ json: [{ id: "main", portal_name: "İHP Finans", logo_url: null, notifications_enabled: true }] });
    return route.fulfill({ json: [] });
  });
}

async function openFinance(page, target = "overview") {
  await installMocks(page);
  await page.addInitScript((storedSession) => {
    if (window === window.top) localStorage.setItem("ihp-auth-session", JSON.stringify(storedSession));
  }, session());
  await page.goto(`${baseUrl}/#/portal/${target}`);
  await page.waitForSelector(".finance-terminal-shell");
  await page.waitForFunction(() => !document.querySelector(".skeleton-page"));
}

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const viewports = [{ name: "desktop", width: 1440, height: 960 }, { name: "mobile", width: 390, height: 844 }];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openFinance(page);

    const sidebarText = await page.locator(".finance-terminal-sidebar").textContent();
    for (const label of ["Net Durum", "Para Transferleri", "Borçlar", "İstekler", "Borsa ve Finans"]) {
      assert.match(sidebarText, new RegExp(label, "i"), `${viewport.name}: ${label} navigation`);
    }
    assert.equal(await page.locator(".role-badge, .profile-role-badge").count(), 0, `${viewport.name}: finance role badges stay hidden`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: overview overflow`);
    await page.screenshot({ path: join(output, `${viewport.name}-overview.png`), fullPage: true });

    await page.evaluate(() => { location.hash = "#/portal/credit"; });
    await page.waitForSelector(".finance-credit-header");
    assert.match(await page.locator(".finance-terminal-content").innerText(), /Para Transferleri|Kredi transferi/i);
    assert.match(await page.locator(".finance-terminal-content").innerText(), /Borçlar/i);
    assert.match(await page.locator(".finance-terminal-content").innerText(), /Onaylar/i);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: credit overflow`);
    await page.screenshot({ path: join(output, `${viewport.name}-credit.png`), fullPage: true });

    await page.evaluate(() => { location.hash = "#/portal/finance"; });
    await page.waitForSelector(".finance-broker-chart");
    assert.equal(await page.locator(".finance-range-switch button").count(), 3, `${viewport.name}: market ranges`);
    assert.equal(await page.locator(".finance-broker-symbol").count(), instruments.length, `${viewport.name}: instruments`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${viewport.name}: market overflow`);
    await page.screenshot({ path: join(output, `${viewport.name}-market.png`), fullPage: true });
    assert.deepEqual(errors, [], `${viewport.name}: finance client errors`);
    await context.close();
  }
  console.log("Finance overview, credit modules, market chart and responsive visual smoke tests passed.");
} finally {
  await browser.close();
  server.close();
}
