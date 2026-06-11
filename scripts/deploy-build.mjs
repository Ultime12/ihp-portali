import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

const root = process.cwd();
const packageDir = join(root, "package");

function replaceAll(source, from, to) {
  return source.split(from).join(to);
}

function replaceOnce(source, from, to) {
  return source.includes(from) ? source.replace(from, to) : source;
}

function patchDisciplinePointsUi(app) {
  let next = app;

  next = replaceOnce(
    next,
    "  pendingConfirm: null\n};",
    "  pendingConfirm: null,\n  celebratedRewards: new Set()\n};"
  );

  if (!next.includes("function disciplinePoints(")) {
    next = replaceOnce(
      next,
      "\n\nconst LEADERSHIP_ORDER = [",
      [
        "",
        "",
        "function disciplinePoints(profile = state.profile) {",
        "  const value = Number(profile?.discipline_points);",
        "  return Number.isFinite(value) ? value : 100;",
        "}",
        "",
        "function pointDeltaValue(item = {}) {",
        "  const value = Number(item?.point_delta || 0);",
        "  return Number.isFinite(value) ? value : 0;",
        "}",
        "",
        "function pointDeltaBadge(delta = 0) {",
        "  const value = Number(delta || 0);",
        "  const label = value > 0 ? \"+\" + value : String(value);",
        "  const tone = value > 0 ? \"green\" : value < 0 ? \"red\" : \"gray\";",
        "  return badge(label + \" puan\", tone);",
        "}",
        "",
        "function pointTrail(item = {}) {",
        "  if (item.points_before === null || item.points_before === undefined || item.points_after === null || item.points_after === undefined) return \"\";",
        "  return item.points_before + \" -> \" + item.points_after;",
        "}",
        "",
        "function sanctionEffectLabel(effect = \"none\") {",
        "  return ({",
        "    none: \"Sadece kayıt\",",
        "    points_only: \"Puan güncelle\",",
        "    reward_points: \"Ödül puanı\",",
        "    remove_roles: \"Yetkileri al\",",
        "    suspend_member: \"Üyeliği askıya al\",",
        "    passive_member: \"Pasif üyeliğe çek\"",
        "  }[effect] || effect);",
        "}",
        "",
        "const LEADERSHIP_ORDER = ["
      ].join("\n")
    );
  }

  if (!next.includes("function maybeCelebrateRewards(")) {
    next = replaceOnce(
      next,
      "\n\nfunction closeModal() {",
      [
        "",
        "",
        "function rewardPointsFromNotification(item = {}) {",
        "  const match = String(item.body || \"\").match(/\\+(\\d+)\\s*puan/i);",
        "  return match ? Number(match[1]) : null;",
        "}",
        "",
        "function ensureRewardCelebrationStyles() {",
        "  if (document.getElementById(\"reward-celebration-styles\")) return;",
        "  const style = document.createElement(\"style\");",
        "  style.id = \"reward-celebration-styles\";",
        "  style.textContent = \"@keyframes ihpRewardRise{from{transform:translateY(22px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}@keyframes ihpConfettiDrop{0%{transform:translateY(-18vh) rotate(0deg);opacity:1}100%{transform:translateY(92vh) rotate(560deg);opacity:0}}.reward-celebration{position:fixed;inset:0;z-index:9999;pointer-events:none;display:grid;place-items:center;overflow:hidden}.reward-celebration-card{pointer-events:auto;width:min(380px,calc(100vw - 32px));padding:26px;border-radius:28px;background:linear-gradient(145deg,rgba(255,255,255,.98),rgba(243,201,105,.96));color:#132033;box-shadow:0 28px 80px rgba(8,18,38,.34);text-align:center;animation:ihpRewardRise .42s ease-out both}.reward-celebration-card strong{display:block;font-size:30px;margin-bottom:8px}.reward-celebration-card .reward-points{display:inline-flex;align-items:center;justify-content:center;min-width:108px;min-height:108px;border-radius:999px;margin:10px auto;background:#0b1b31;color:#f3c969;font-size:32px;font-weight:900}.reward-confetti-piece{position:fixed;top:-12vh;width:10px;height:16px;border-radius:4px;animation:ihpConfettiDrop 3.8s linear forwards}\";",
        "  document.head.append(style);",
        "}",
        "",
        "function showRewardCelebration(notification) {",
        "  ensureRewardCelebrationStyles();",
        "  const points = rewardPointsFromNotification(notification);",
        "  const overlay = document.createElement(\"div\");",
        "  overlay.className = \"reward-celebration\";",
        "  const colors = [\"#e11d48\", \"#2563eb\", \"#16a34a\", \"#f59e0b\", \"#7c3aed\", \"#06b6d4\"];",
        "  const pieces = Array.from({ length: 56 }, function(_, index) {",
        "    const left = Math.round(Math.random() * 100);",
        "    const delay = (Math.random() * 1.2).toFixed(2);",
        "    const duration = (2.6 + Math.random() * 1.8).toFixed(2);",
        "    const color = colors[index % colors.length];",
        "    return '<span class=\"reward-confetti-piece\" style=\"left:' + left + 'vw;background:' + color + ';animation-delay:' + delay + 's;animation-duration:' + duration + 's\"></span>';",
        "  }).join(\"\");",
        "  overlay.innerHTML = pieces + '<section class=\"reward-celebration-card\" role=\"status\" aria-live=\"polite\"><strong>Tebrikler!</strong><div class=\"reward-points\">' + (points ? '+' + points : '+Puan') + '</div><p>' + esc(notification.body || \"Ödül puanı kazandınız.\") + '</p><button class=\"btn btn-primary btn-sm\" type=\"button\">Harika</button></section>';",
        "  overlay.querySelector(\"button\")?.addEventListener(\"click\", function() { overlay.remove(); });",
        "  document.body.append(overlay);",
        "  setTimeout(function() { overlay.remove(); }, 5200);",
        "}",
        "",
        "function maybeCelebrateRewards() {",
        "  const reward = (state.cache.notifications || []).find(function(item) { return item.category === \"reward\" && !item.read_at && !state.celebratedRewards.has(item.id); });",
        "  if (!reward) return;",
        "  state.celebratedRewards.add(reward.id);",
        "  showRewardCelebration(reward);",
        "}",
        "",
        "function closeModal() {"
      ].join("\n")
    );
  }

  next = replaceOnce(
    next,
    "    state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);\n",
    "    state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);\n    maybeCelebrateRewards();\n"
  );

  next = replaceOnce(
    next,
    "      discipline: \"Disiplin işlemi\",\n      application:",
    "      discipline: \"Disiplin işlemi\",\n      reward: \"Ödül\",\n      application:"
  );

  next = replaceOnce(
    next,
    "        <thead><tr><th>Kayıt</th><th>İlgili üye</th><th>Tür</th><th>Ciddiyet</th><th>Karar durumu</th><th>İşlem</th></tr></thead>",
    "        <thead><tr><th>Kayıt</th><th>İlgili üye</th><th>Tür</th><th>Ciddiyet</th><th>Karar durumu</th><th>Puan</th><th>İşlem</th></tr></thead>"
  );
  next = replaceOnce(
    next,
    '                        <td>${item.archived ? badge("Silindi", "violet") : badgeForStatus(item.decision_status)}</td>\n                        <td>${disciplineRowActions(item)}</td>',
    '                        <td>${item.archived ? badge("Silindi", "violet") : badgeForStatus(item.decision_status)}</td>\n                        <td>${pointDeltaBadge(pointDeltaValue(item))}<span class="cell-sub">${esc(pointTrail(item))}</span></td>\n                        <td>${disciplineRowActions(item)}</td>'
  );
  next = replaceOnce(
    next,
    '              : `<tr><td colspan="6">${emptyCard("Görüntülenebilir kayıt yok", "Size açık bir disiplin kaydı bulunmuyor.")}</td></tr>`',
    '              : `<tr><td colspan="7">${emptyCard("Görüntülenebilir kayıt yok", "Size açık bir disiplin kaydı bulunmuyor.")}</td></tr>`'
  );

  next = replaceOnce(
    next,
    '<div class="form-group"><label for="discipline-member">İlgili üye</label><select class="field" id="discipline-member" name="member_id" required><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}" ${item?.member_id === member.id ? "selected" : ""}>${esc(member.display_name)}</option>`).join("")}</select></div>',
    '<div class="form-group"><label for="discipline-member">İlgili üye</label><select class="field" id="discipline-member" name="member_id" required><option value="">Seçin</option>${members.map((member) => `<option value="${esc(member.id)}" ${item?.member_id === member.id ? "selected" : ""}>${esc(member.display_name)} · ${disciplinePoints(member)} puan</option>`).join("")}</select></div>'
  );
  next = replaceOnce(
    next,
    '["Bilgilendirme Notu", "Uyarı", "Kınama", "Geçici Kısıtlama", "Görevden Alma", "Üyelik Askısı"].map',
    '["Bilgilendirme Notu", "Uyarı", "Kınama", "Geçici Kısıtlama", "Görevden Alma", "Üyelik Askısı", "Ödül"].map'
  );
  if (!next.includes('id="discipline-point-delta"')) {
    const pointGrid = [
      '        <div class="form-grid">',
      '          <div class="form-group"><label for="discipline-point-delta">Puan etkisi</label><input class="field" id="discipline-point-delta" name="point_delta" type="number" min="-100" max="100" step="1" value="${esc(item?.point_delta ?? 0)}" /><p class="security-note">Ceza için eksi puan yazın. Örn: -10. Ödül için pozitif puan yazın. Örn: 15.</p></div>',
      '          <div class="setup-box"><strong>Puan rehberi</strong><p class="security-note">Üyenin mevcut puanı listede görünür. Kayıt kararname yazıldı durumuna geçince puan otomatik uygulanır ve üyenin ekranına bildirim gider.</p></div>',
      '        </div>'
    ].join("\n");
    next = replaceOnce(
      next,
      '        <div class="form-group"><label for="discipline-decree">Kararname metni</label>',
      `${pointGrid}\n        <div class="form-group"><label for="discipline-decree">Kararname metni</label>`
    );
  }
  next = replaceOnce(
    next,
    [
      '            <option value="none">Sadece kayıt oluştur</option>',
      '            <option value="remove_roles">Yetkilerini al, üye olarak bırak</option>',
      '            <option value="suspend_member">Üyeliği askıya al</option>',
      '            <option value="passive_member">Pasif üyeliğe çek</option>'
    ].join("\n"),
    [
      '            <option value="none" ${item?.sanction_effect === "none" ? "selected" : ""}>Sadece kayıt oluştur</option>',
      '            <option value="points_only" ${item?.sanction_effect === "points_only" ? "selected" : ""}>Sadece puan uygula</option>',
      '            <option value="reward_points" ${item?.sanction_effect === "reward_points" ? "selected" : ""}>Ödül puanı ver</option>',
      '            <option value="remove_roles" ${item?.sanction_effect === "remove_roles" ? "selected" : ""}>Yetkilerini al, üye olarak bırak</option>',
      '            <option value="suspend_member" ${item?.sanction_effect === "suspend_member" ? "selected" : ""}>Üyeliği askıya al</option>',
      '            <option value="passive_member" ${item?.sanction_effect === "passive_member" ? "selected" : ""}>Pasif üyeliğe çek</option>'
    ].join("\n")
  );
  next = replaceOnce(
    next,
    '<div class="meta-row"><span>Durum</span><strong>${item.archived ? "Silindi" : statusLabel(item.decision_status)}</strong></div>',
    '<div class="meta-row"><span>Durum</span><strong>${item.archived ? "Silindi" : statusLabel(item.decision_status)}</strong></div>\n        <div class="meta-row"><span>Puan hareketi</span><strong>${pointDeltaBadge(pointDeltaValue(item))} ${esc(pointTrail(item))}</strong></div>\n        <div class="meta-row"><span>Sistemde uygulanan işlem</span><strong>${esc(sanctionEffectLabel(item.sanction_effect))}</strong></div>'
  );

  next = replaceOnce(
    next,
    [
      '      const { sanction_effect: sanctionEffect = "none", ...recordValues } = values;',
      '      if (!recordValues.decree_text) throw new Error("Kararname metni zorunludur.");',
      '      const payload = {',
      '        ...recordValues,',
      '        investigation_id: recordValues.investigation_id || null,',
      '        action_taken: recordValues.decree_text,',
      '        created_by: state.profile.id',
      '      };'
    ].join("\n"),
    [
      '      const { sanction_effect: sanctionEffect = "none", point_delta: rawPointDelta = "0", ...recordValues } = values;',
      '      const pointDelta = Number(rawPointDelta || 0);',
      '      if (!Number.isInteger(pointDelta) || pointDelta < -100 || pointDelta > 100) throw new Error("Puan etkisi -100 ile 100 arasında tam sayı olmalıdır.");',
      '      const effectiveSanction = sanctionEffect === "none" && pointDelta !== 0 ? pointDelta > 0 ? "reward_points" : "points_only" : sanctionEffect;',
      '      if (effectiveSanction === "reward_points" && pointDelta <= 0) throw new Error("Ödül puanı için pozitif puan girin.");',
      '      if (effectiveSanction !== "reward_points" && pointDelta > 0) throw new Error("Pozitif puan vermek için sistem işlemini Ödül puanı ver seçin.");',
      '      if (!recordValues.decree_text) throw new Error("Kararname metni zorunludur.");',
      '      const shouldApply = effectiveSanction !== "none" || pointDelta !== 0;',
      '      if (shouldApply && recordValues.decision_status !== "decided") throw new Error("Puan veya sistem işlemi uygulamak için kayıt durumu Kararname Yazıldı olmalıdır.");',
      '      const payload = {',
      '        ...recordValues,',
      '        investigation_id: recordValues.investigation_id || null,',
      '        point_delta: pointDelta,',
      '        sanction_effect: effectiveSanction,',
      '        action_taken: recordValues.decree_text,',
      '        created_by: state.profile.id',
      '      };'
    ].join("\n")
  );
  next = replaceOnce(
    next,
    [
      '      if (sanctionEffect !== "none" && payload.decision_status === "decided") {',
      '        await applyDisciplineSanction({',
      '          disciplineRecordId: savedRecord?.id || form.dataset.id,',
      '          memberId: payload.member_id,',
      '          effect: sanctionEffect,',
      '          reason: payload.decree_text || payload.reason || "Disiplin kararnamesi"',
      '        });',
      '      }'
    ].join("\n"),
    [
      '      if (shouldApply) {',
      '        await applyDisciplineSanction({',
      '          disciplineRecordId: savedRecord?.id || form.dataset.id,',
      '          memberId: payload.member_id,',
      '          effect: effectiveSanction,',
      '          pointDelta,',
      '          reason: payload.decree_text || payload.reason || "Disiplin kararnamesi"',
      '        });',
      '      }'
    ].join("\n")
  );

  return next;
}

function normalizeSnapshotFiles(files) {
  const normalizePath = (path) => {
    const normalizedPath = path.replaceAll("\\", "/");
    return normalizedPath.startsWith("dist/") ? normalizedPath : `dist/${normalizedPath}`;
  };

  if (Array.isArray(files)) {
    return files.map((file) => ({ ...file, path: normalizePath(file.path) }));
  }
  if (files && typeof files === "object") {
    return Object.entries(files).map(([path, content]) => ({ path: normalizePath(path), content }));
  }
  throw new Error("Yayin paketi gecersiz dosya formatinda.");
}

async function readPackageEntry(name) {
  const raw = await readFile(join(packageDir, name));
  return name.endsWith(".b64") ? Buffer.from(raw.toString("utf8").trim(), "base64") : raw;
}

async function readSnapshotBuffer() {
  try {
    return await readPackageEntry("runtime.br.b64");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const runtimeEntries = (await readdir(packageDir))
    .filter((name) => name.startsWith("runtime-") && (name.endsWith(".br") || name.endsWith(".br.b64")))
    .sort();
  if (runtimeEntries.length) {
    const chunks = await Promise.all(runtimeEntries.map(readPackageEntry));
    return Buffer.concat(chunks);
  }

  const bundleEntries = (await readdir(packageDir))
    .filter((name) => name.startsWith("bundle-") && (name.endsWith(".br") || name.endsWith(".br.b64")))
    .sort();
  if (bundleEntries.length) {
    const chunks = await Promise.all(bundleEntries.map(readPackageEntry));
    return Buffer.concat(chunks);
  }

  throw new Error("Yayin paketi bulunamadi.");
}

async function patchClientBundle() {
  const appPath = join(root, "dist", "src", "app.js");
  let app;
  try {
    app = await readFile(appPath, "utf8");
  } catch {
    return;
  }

  const replacements = [
    ["Yönetim Kurulu", "Yürütme Kurulu"],
    ["Gençlik Kurulu", "Gençlik Kolları"],
    ["Gençlik kurulu", "Gençlik kolları"],
    ["Duyuru ve İletişim Birimi", "Sosyal Medya Başkanlığı"],
    ["Duyuru ve iletişim birimi", "Sosyal medya başkanlığı"]
  ];

  let next = app;
  for (const [from, to] of replacements) {
    next = replaceAll(next, from, to);
  }

  next = patchDisciplinePointsUi(next);

  if (next !== app) await writeFile(appPath, next);
}

async function patchPortalServiceBundle() {
  const servicePath = join(root, "dist", "src", "lib", "portal-service.js");
  let service;
  try {
    service = await readFile(servicePath, "utf8");
  } catch {
    return;
  }

  const replacements = [
    ["select=*,committees(name)&limit=1", "select=*,committees!profiles_committee_id_fkey(name)&limit=1"],
    [
      'list("profiles", "select=*,committees(name)&order=created_at.desc")',
      'list("profiles", "select=*,committees!profiles_committee_id_fkey(name)&order=created_at.desc")'
    ],
    [
      'list("committees", "select=*,profiles(display_name)&order=name.asc")',
      'list("committees", "select=*,profiles!committees_chair_profile_id_fkey(display_name)&order=name.asc")'
    ],
    [
      "profile_committees(committee_id,role_in_committee,committee:committees(id,name,status))",
      "profile_committees!profile_committees_profile_id_fkey(committee_id,role_in_committee,committee:committees(id,name,status))"
    ]
  ];

  let next = service;
  for (const [from, to] of replacements) {
    next = replaceAll(next, from, to);
  }

  if (next !== service) await writeFile(servicePath, next);
}

const files = normalizeSnapshotFiles(
  JSON.parse(brotliDecompressSync(await readSnapshotBuffer()).toString("utf8"))
);

await rm(join(root, "dist"), { recursive: true, force: true });
for (const file of files) {
  const destination = join(root, file.path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(file.content, "base64"));
}

await patchClientBundle();
await patchPortalServiceBundle();

console.log("Vercel ciktilari yayin paketinden olusturuldu.");
