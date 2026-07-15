import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const dist = join(root, "dist-mail");
const output = join(root, "test-results", "mail");
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

const profile = {
  id: "mail-member",
  email: "uye@example.test",
  portal_email: "tuna@ihp.org.tr",
  display_name: "Tuna Mert Köse",
  role: "president",
  roles: ["president", "member"],
  status: "active",
  discipline_points: 100,
  member_code: "817402",
  avatar_initials: "TMK",
  avatar_color: "#5457d6",
  theme_preference: "blue",
  is_system_account: false,
  joined_at: "2026-01-10T10:00:00.000Z",
  profile_committees: []
};

const baseMessage = {
  thread_id: "thread-1",
  batch_id: "batch-1",
  sender_profile_id: "mail-sender",
  recipient_profile_id: profile.id,
  sender_address: "deniz@ihp.org.tr",
  recipient_address: profile.portal_email,
  to_addresses: [profile.portal_email],
  cc_addresses: [],
  bcc_addresses: [],
  direction: "internal",
  attachment_count: 0,
  sender_folder: "sent",
  recipient_folder: "inbox",
  sender_starred: false,
  recipient_starred: false,
  sender_deleted_at: null,
  recipient_deleted_at: null,
  created_at: "2026-07-12T09:30:00.000Z",
  sent_at: "2026-07-12T09:30:00.000Z",
  scheduled_at: null,
  cancelled_at: null,
  attachments: []
};

const mailbox = {
  mailbox: { address: profile.portal_email, displayName: profile.display_name, status: "active" },
  identities: [
    { address: profile.portal_email, label: profile.display_name, personal: true },
    { address: "baskan@ihp.org.tr", label: "Başkanlık", personal: false }
  ],
  messages: [
    {
      ...baseMessage,
      id: "message-inbox",
      subject: "Haftalık kurul toplantısı",
      body_text: "Toplantı gündemi ve ekli karar taslağı bilgilerinize sunulmuştur.",
      body_html: "<p>Toplantı gündemi ve <strong>ekli karar taslağı</strong> bilgilerinize sunulmuştur.</p>",
      delivery_status: "received",
      read_at: null,
      attachment_count: 1,
      attachments: [{ id: "attachment-1", file_name: "gundem.pdf", byte_size: 245760, content_type: "application/pdf" }]
    },
    {
      ...baseMessage,
      id: "message-second",
      thread_id: "thread-2",
      batch_id: "batch-2",
      sender_address: "dk@ihp.org.tr",
      subject: "Resmi bilgilendirme",
      body_text: "Kurumsal bilgilendirme kaydıdır.",
      body_html: "<p>Kurumsal bilgilendirme kaydıdır.</p>",
      delivery_status: "received",
      read_at: "2026-07-12T10:00:00.000Z",
      created_at: "2026-07-12T08:30:00.000Z"
    },
    {
      ...baseMessage,
      id: "message-sent",
      batch_id: "batch-sent",
      sender_profile_id: profile.id,
      recipient_profile_id: "mail-sender",
      sender_address: profile.portal_email,
      recipient_address: "deniz@ihp.org.tr",
      to_addresses: ["deniz@ihp.org.tr"],
      subject: "Toplantı teyidi",
      body_text: "Katılım sağlayacağım.",
      body_html: "<p>Katılım sağlayacağım.</p>",
      delivery_status: "sent",
      read_at: null
    },
    {
      ...baseMessage,
      id: "message-scheduled",
      batch_id: "batch-scheduled",
      sender_profile_id: profile.id,
      recipient_profile_id: null,
      sender_address: "baskan@ihp.org.tr",
      recipient_address: "kurul@example.test",
      to_addresses: ["kurul@example.test"],
      subject: "Zamanlanmış duyuru",
      body_text: "Belirlenen saatte gönderilecektir.",
      body_html: "<p>Belirlenen saatte gönderilecektir.</p>",
      direction: "external_outbound",
      delivery_status: "scheduled",
      sender_folder: "scheduled",
      scheduled_at: "2026-07-13T06:30:00.000Z",
      sent_at: null
    },
    {
      ...baseMessage,
      id: "message-draft",
      batch_id: "batch-draft",
      sender_profile_id: profile.id,
      recipient_profile_id: null,
      sender_address: profile.portal_email,
      recipient_address: "",
      to_addresses: [],
      subject: "Taslak karar metni",
      body_text: "Düzenlenmeye devam edilecek.",
      body_html: "<p>Düzenlenmeye devam edilecek.</p>",
      delivery_status: "draft",
      sender_folder: "draft",
      sent_at: null
    }
  ],
  directory: [
    { id: "mail-sender", display_name: "Deniz Çiçek", portal_email: "deniz@ihp.org.tr" },
    { id: "mail-member-2", display_name: "Emir Altuntaş", portal_email: "emir@ihp.org.tr" }
  ],
  unreadCount: 1,
  settings: {
    domain: "ihp.org.tr",
    externalSendingEnabled: true,
    maxSubjectChars: 200,
    maxBodyChars: 60000,
    maxAttachments: 10,
    maxAttachmentBytes: 15728640,
    maxMessageAttachmentBytes: 26214400
  }
};

function session() {
  return {
    access_token: "mail-test-access",
    refresh_token: "mail-test-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: profile.id, email: profile.email }
  };
}

async function installMocks(page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.route("**/api/config", (route) => route.fulfill({
    json: { configured: true, supabaseUrl: "https://mock.supabase.test", supabaseAnonKey: "publishable-test" }
  }));
  await page.route("**/api/mailbox", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: mailbox });
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.action === "save_draft") {
      return route.fulfill({ json: { draft: { ...mailbox.messages.at(-1), id: body.draftId || "visual-draft" } } });
    }
    if (body.action === "send") return route.fulfill({ json: { ok: true, message: mailbox.messages[2] } });
    if (body.action === "attachment_url") return route.fulfill({ json: { url: "https://example.test/gundem.pdf" } });
    return route.fulfill({ json: { ok: true, messages: [] } });
  });
  await page.route("https://mock.supabase.test/auth/v1/token?*", (route) => route.fulfill({ json: session() }));
  await page.route("https://mock.supabase.test/auth/v1/logout", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://mock.supabase.test/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    if (table === "profiles") return route.fulfill({ json: [profile] });
    if (table === "portal_settings") {
      return route.fulfill({ json: [{ id: "main", portal_name: "İHP Mail", logo_url: null, notifications_enabled: true }] });
    }
    return route.fulfill({ json: [] });
  });
}

async function openMailbox(page) {
  await installMocks(page);
  await page.addInitScript((storedSession) => {
    if (window === window.top) localStorage.setItem("ihp-auth-session", JSON.stringify(storedSession));
  }, session());
  await page.goto(`${baseUrl}/#/portal/mail`);
  await page.waitForSelector(".mail-product-shell");
  await page.waitForFunction(() => !document.querySelector(".skeleton-page"));
}

const browser = await chromium.launch({ headless: true, executablePath: chrome });
const viewports = [
  { name: "desktop", width: 1440, height: 960 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

try {
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  const publicPage = await publicContext.newPage();
  const publicErrors = [];
  publicPage.on("pageerror", (error) => publicErrors.push(error.message));
  await installMocks(publicPage);
  await publicPage.goto(baseUrl);
  await publicPage.waitForSelector(".mail-public-shell");
  assert.match(await publicPage.locator("h1").innerText(), /Yazışmalar/i);
  await publicPage.screenshot({ path: join(output, "public-desktop.png"), fullPage: true });
  assert.deepEqual(publicErrors, [], "mail public page should not raise client errors");
  await publicContext.close();

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openMailbox(page);

    assert.equal(await page.locator(".mail-folder-link").count(), 8, `${viewport.name}: all mail folders`);
    assert.equal(await page.locator(".mail-row.unread").count(), 1, `${viewport.name}: unread message`);
    assert.match(await page.locator(".mail-account-card").textContent(), /tuna@ihp\.org\.tr/i);
    assert.equal(await page.getByText(/günlük.*limit/i).count(), 0, `${viewport.name}: quota must stay hidden`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `${viewport.name}: no horizontal page overflow`
    );

    if (viewport.name === "mobile") {
      await page.locator('[data-action="mail-open"]').first().click();
      assert.equal(await page.locator(".mail-reader-pane.mobile-active").isVisible(), true, "mobile reader should open");
      await page.locator('[data-action="mail-mobile-back"]').click();
      assert.equal(await page.locator(".mail-list-pane").isVisible(), true, "mobile list should return");
    }

    if (viewport.name === "desktop") {
      assert.equal(await page.locator('.mail-account-card [data-action="logout"]').isVisible(), true, "desktop logout should be visible");
      await page.locator('[data-page="settings"]').first().click();
      await page.waitForSelector(".mail-settings-content");
      assert.equal(await page.locator(".premium-app-shell").count(), 0, "mail settings must not open the main portal shell");
      await page.locator('[data-action="mail-set-theme"][data-theme="dark"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mailTheme), "dark", "dark mail theme should apply");
      assert.equal(await page.evaluate(() => localStorage.getItem("ihp-mail-theme")), "dark", "mail theme should persist independently");
      await page.locator('[data-page="mail"]').first().click();
      await page.waitForSelector(".mail-list-pane");
    }

    await page.locator('[data-action="mail-compose"]').click();
    await page.locator('[data-mail-field="to"]').fill("deniz@ihp.org.tr");
    await page.locator('[data-mail-field="subject"]').fill("Kurumsal deneme iletisi");
    await page.locator("[data-mail-editor]").fill("Biçimlendirilebilir kurumsal ileti metni.");
    await page.locator('[data-action="mail-toggle-copy"]').click();
    await page.locator('[data-mail-field="cc"]').fill("emir@ihp.org.tr");
    await page.locator('[data-action="mail-toggle-schedule"]').click();
    assert.equal(await page.locator(".mail-schedule-row.open").isVisible(), true, `${viewport.name}: scheduling controls`);
    assert.equal(await page.locator(".mail-editor-toolbar").isVisible(), true, `${viewport.name}: rich editor toolbar`);
    await page.screenshot({ path: join(output, `${viewport.name}-composer.png`), fullPage: true });
    assert.deepEqual(errors, [], `${viewport.name}: mail client errors`);
    await context.close();
  }

  console.log("Mail public, mailbox, composer and responsive visual smoke tests passed.");
} finally {
  await browser.close();
  server.close();
}
