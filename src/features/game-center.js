const IHP_GAME_CENTER_V1 = true;
let activeSnakeGame = null;
let activeScratchCard = null;

function gameCenterSetting(key) {
  const settings = state.cache.gameCenter?.settings || [];
  return settings.find((item) => item.game_key === key) || {
    game_key: key,
    enabled: true,
    entry_cost: key === "scratch" ? 10 : 5,
    reward_points: key === "scratch" ? 20 : 10,
    target_score: key === "snake" ? 1000 : 10000,
    win_probability_basis_points: key === "scratch" ? 800 : 0,
    attempt_period: "unlimited"
  };
}

function latestGameAttempt(key) {
  return (state.cache.gameCenter?.attempts || []).find((item) => item.game_key === key) || null;
}

function gameCreditRequest(key) {
  return (state.cache.gameCenter?.gameCreditRequests || []).find((item) => item.game_key === key) || null;
}

function paidGameAction(key, attempt, enabled) {
  if (attempt?.status === "active") return `<button class="btn btn-primary btn-sm" type="button" disabled>Oyun devam ediyor</button>`;
  const account = state.cache.gameCenter?.creditAccount;
  const request = gameCreditRequest(key);
  if (!account) return `<button class="btn btn-primary btn-sm" type="button" data-page="credit">Kredi hesabı aç</button>`;
  if (request?.status === "pending") return `<button class="btn btn-primary btn-sm" type="button" data-page="credit">Kredi onayını tamamla</button>`;
  if (request?.status === "approved") {
    const action = key === "flappy" ? "start-approved-flappy" : key === "snake" ? "start-approved-snake" : "play-approved-scratch";
    const quantity = key === "scratch"
      ? Math.max(1, Math.min(10, Math.round(Number(request.credit_amount || 0) / Math.max(1, Number(gameCenterSetting("scratch").entry_cost || 1)))))
      : 1;
    return `<button class="btn btn-primary btn-sm" type="button" data-action="${action}" data-quantity="${quantity}" ${enabled ? "" : "disabled"}>${key === "scratch" ? `${quantity} kartı aç` : "Oyunu başlat"}</button>`;
  }
  return `<button class="btn btn-primary btn-sm" type="button" data-action="${key === "scratch" ? "open-scratch-purchase" : "request-game-credit"}" data-game-key="${key}" ${enabled ? "" : "disabled"}>${key === "scratch" ? "Kart paketi seç" : "Kredi onayı iste"}</button>`;
}

function gameAttemptLabel(attempt) {
  if (!attempt) return "Hak kullanılmadı";
  return ({ active: "Başlatıldı", won: "Ödül kazanıldı", lost: "Tamamlandı", expired: "Süresi doldu" })[attempt.status] || attempt.status;
}

function gameCenterCard({ key, title, kicker, description, iconName, facts, actions, attempt }) {
  const settings = gameCenterSetting(key);
  return `
    <article class="panel glass arcade-card arcade-${key} ${settings.enabled ? "" : "arcade-disabled"}">
      <div class="arcade-card-top"><span class="arcade-icon">${icon(iconName)}</span><div><span class="panel-kicker">${esc(kicker)}</span><h3>${esc(title)}</h3></div>${badge(settings.enabled ? "Açık" : "Kapalı", settings.enabled ? "green" : "gray")}</div>
      <p>${esc(description)}</p>
      <div class="arcade-facts">${facts.map(([label, value]) => `<span>${esc(label)} <b>${esc(value)}</b></span>`).join("")}</div>
      ${attempt ? `<div class="arcade-result">${badge(gameAttemptLabel(attempt), attempt.status === "won" ? "green" : "gray")}<strong>${Number(attempt.score || 0).toLocaleString("tr-TR")} skor</strong><small>Yeni kredi onayıyla tekrar oynayabilirsiniz.</small></div>` : ""}
      <div class="arcade-actions">${actions}</div>
    </article>
  `;
}

function adminGameSettingsPanel() {
  if (!hasRole("super_admin")) return "";
  const stats = state.cache.gameCenter?.adminStats || {};
  const members = state.cache.gameCenter?.memberStatus || [];
  return `
    <section class="panel glass game-admin-panel">
      <div class="panel-head"><div><span class="panel-kicker">Admin kontrol merkezi</span><h3>Oyun kuralları</h3></div>${badge("Toplam kredili oyun: ${(stats.flappy || 0) + (stats.snake || 0) + (stats.scratch || 0)}", "blue")}</div>
      <div class="game-admin-grid">
        ${["flappy", "snake", "scratch"].map((key) => {
          const item = gameCenterSetting(key);
          return `<fieldset class="game-admin-card" data-game-setting="${key}">
            <legend>${esc(item.display_name || key)}</legend>
            <label class="switch-row"><span>Oyun açık</span><input type="checkbox" data-game-enabled ${item.enabled ? "checked" : ""} /></label>
            <label>Kredi giriş bedeli<input class="field" data-game-cost type="number" min="1" max="100000" value="${item.entry_cost}" /></label>
            <label>Kredi ödülü<input class="field" data-game-reward type="number" min="0" max="100000" value="${item.reward_points}" /></label>
            ${key === "scratch" ? `<label>Kazanma ihtimali (%)<input class="field" data-game-probability type="number" min="0" max="100" step="0.1" value="${Number(item.win_probability_basis_points || 0) / 100}" /></label>` : ""}
            <small>Toplam ${Number(stats[key] || 0)} kredili kullanım</small>
          </fieldset>`;
        }).join("")}
      </div>
      <div class="game-member-status">
        <div class="panel-head compact"><div><span class="panel-kicker">Sınırsız kullanım</span><h4>Üye oyun sayıları</h4></div>${badge(`${members.length} üye`, "blue")}</div>
        ${members.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Üye</th><th>Kredi</th><th>Flappy</th><th>Snake</th><th>Kazı Kazan</th></tr></thead><tbody>${members.map((member) => `<tr><td><strong>${esc(member.displayName)}</strong></td><td>${Number(member.creditBalance || 0).toLocaleString("tr-TR")}</td><td>${badge(`${Number(member.flappy || 0)} kez`, "blue")}</td><td>${badge(`${Number(member.snake || 0)} kez`, "blue")}</td><td>${badge(`${Number(member.scratch || 0)} kez`, "blue")}</td></tr>`).join("")}</tbody></table></div>` : emptyCard("Aktif üye yok", "Üye oyun durumları burada görünür.")}
      </div>
      <div class="panel-actions"><button class="btn btn-primary btn-sm" type="button" data-action="save-game-settings">Oyun ayarlarını kaydet</button></div>
    </section>
  `;
}

function gameCenterPage() {
  const creditBalance = Number(state.cache.gameCenter?.creditAccount?.balance || 0);
  const flappy = gameCenterSetting("flappy");
  const snake = gameCenterSetting("snake");
  const scratch = gameCenterSetting("scratch");
  const flappySession = state.cache.flappyStatus?.session || null;
  const snakeAttempt = latestGameAttempt("snake");
  const scratchAttempt = latestGameAttempt("scratch");
  return `
    <section class="page-head arcade-head">
      <div><span class="eyebrow">İHP Oyun Alanı</span><h2>Refleks, strateji ve biraz şans.</h2><p>Antrenman ücretsizdir. Kredili oyunlar sınırsızdır; her oyun başlamadan önce kesinti Kredi Sistemi'nde ayrı olarak onaylanır.</p></div>
      <div class="flappy-points-orb"><span>Kredi bakiyen</span><strong>${creditBalance}</strong><small>Oyun ödülleri bu hesaba eklenir.</small></div>
    </section>
    <section class="arcade-grid">
      ${gameCenterCard({
        key: "flappy", title: "İHP Flappy", kicker: "Refleks", iconName: "sparkles",
        description: "Daralan geçitlerde ritmini koru ve 10.000 skora ulaş.",
        facts: [["Kredili giriş", `${flappy.entry_cost} kredi`], ["Ödül", `+${flappy.reward_points} kredi`], ["Can", "3"]],
        attempt: flappySession,
        actions: `<button class="btn btn-secondary btn-sm" type="button" data-action="start-flappy-practice" ${flappy.enabled ? "" : "disabled"}>Antrenman</button>${paidGameAction("flappy", flappySession, flappy.enabled)}`
      })}
      ${gameCenterCard({
        key: "snake", title: "İHP Snake", kicker: "Strateji", iconName: "activity",
        description: "Hızlanan alanda rotanı planla, büyü ve hedef skora ulaş.",
        facts: [["Kredili giriş", `${snake.entry_cost} kredi`], ["Hedef", Number(snake.target_score).toLocaleString("tr-TR")], ["Ödül", `+${snake.reward_points} kredi`]],
        attempt: snakeAttempt,
        actions: `<button class="btn btn-secondary btn-sm" type="button" data-action="start-snake-practice" ${snake.enabled ? "" : "disabled"}>Antrenman</button>${paidGameAction("snake", snakeAttempt, snake.enabled)}`
      })}
      ${gameCenterCard({
        key: "scratch", title: "İHP Kazı Kazan", kicker: "Şans", iconName: "gift",
        description: "1-10 kartlık paketini seç; kartları tek tek kazı veya tamamını birlikte aç.",
        facts: [["Kart bedeli", `${scratch.entry_cost} kredi`], ["Ödül", `+${scratch.reward_points} kredi`], ["İhtimal", `%${(Number(scratch.win_probability_basis_points) / 100).toLocaleString("tr-TR")}`]],
        attempt: scratchAttempt,
        actions: paidGameAction("scratch", scratchAttempt, scratch.enabled)
      })}
    </section>
    <section class="panel glass arcade-integrity"><span>${icon("shield")}</span><div><strong>Açık kredi onayı</strong><p>Oyun giriş bedeli doğrudan düşmez. Talep Kredi Sistemi'ne gider; tutarı görüp onayladığınızda kesilir ve oyun hakkı açılır.</p></div></section>
    ${adminGameSettingsPanel()}
  `;
}

function openGameTerms(kind) {
  const settings = gameCenterSetting(kind);
  const name = kind === "snake" ? "İHP Snake" : "İHP Kazı Kazan";
  modal({
    title: `${name} kredili hak`,
    subtitle: "Bu işlem onayladığınız oyun giriş kredisini kullanır.",
    body: `<div class="flappy-terms-box"><span class="flappy-terms-icon">${icon("shield")}</span><div><strong>Kredi kullanım onayı</strong><p>${settings.entry_cost} kredi hesabımdan kalıcı olarak düşülür. Oyunu kapatsam, bağlantım kesilse veya kazanamasam bile kredinin iade edilmeyeceğini anladım.</p></div></div><label class="flappy-consent"><input type="checkbox" data-game-consent="${kind}" /> <span>Metni okudum, anladım ve kabul ediyorum.</span></label>`,
    actions: `<div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="button" data-action="confirm-${kind}" disabled>${settings.entry_cost} kredi kullan</button></div>`
  });
}

function openScratchPurchase() {
  const settings = gameCenterSetting("scratch");
  modal({
    title: "Kazı Kazan kart paketi",
    subtitle: "1 ile 10 arasında kart seçin.",
    body: `
      <div class="scratch-purchase-panel">
        <div class="scratch-quantity-stepper">
          <button type="button" data-action="scratch-quantity-down" aria-label="Kart azalt">-</button>
          <label><span>Kart adedi</span><input class="field" data-scratch-quantity type="number" min="1" max="10" value="1" /></label>
          <button type="button" data-action="scratch-quantity-up" aria-label="Kart artır">+</button>
        </div>
        <div class="scratch-purchase-total"><span>Toplam onay tutarı</span><strong data-scratch-total>${Number(settings.entry_cost || 0).toLocaleString("tr-TR")} kredi</strong><small>Kart başı ${Number(settings.entry_cost || 0).toLocaleString("tr-TR")} kredi</small></div>
      </div>
      <label class="flappy-consent"><input type="checkbox" data-scratch-purchase-consent /> <span>Kredi Sistemi'nde onayladığım toplam tutarın iade edilmeyeceğini, her kart sonucunun sunucuda belirlendiğini okudum ve kabul ediyorum.</span></label>
    `,
    actions: `<div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="button" data-action="confirm-scratch-purchase" disabled>Onaya gönder</button></div>`
  });
}

function updateScratchPurchaseTotal() {
  const input = modalRoot.querySelector("[data-scratch-quantity]");
  if (!input) return;
  const quantity = Math.max(1, Math.min(10, Number(input.value || 1)));
  input.value = String(quantity);
  const total = modalRoot.querySelector("[data-scratch-total]");
  if (total) total.textContent = `${(quantity * Number(gameCenterSetting("scratch").entry_cost || 0)).toLocaleString("tr-TR")} kredi`;
}

function stopSnakeGame() {
  if (!activeSnakeGame) return;
  clearTimeout(activeSnakeGame.timer);
  document.removeEventListener("keydown", activeSnakeGame.onKeyDown);
  activeSnakeGame = null;
}

function snakeMarkup(mode, target) {
  return `<div class="snake-shell" data-snake-game><div class="snake-topline"><span>${mode === "ranked" ? "Sınırsız kredili oyun" : "Sınırsız antrenman"}</span><strong><b data-snake-score>0</b> / ${Number(target).toLocaleString("tr-TR")}</strong></div><div class="snake-board-wrap"><canvas class="snake-board" width="500" height="600" aria-label="İHP Snake oyun alanı"></canvas><div class="snake-countdown" data-snake-countdown>3</div><div class="snake-result" data-snake-result hidden></div></div><div class="snake-controls" aria-label="Yön kontrolleri"><button type="button" data-snake-direction="up">↑</button><button type="button" data-snake-direction="left">←</button><button type="button" data-snake-direction="down">↓</button><button type="button" data-snake-direction="right">→</button></div><p>Yön tuşları veya WASD ile oyna.</p></div>`;
}

function drawSnake(game) {
  const ctx = game.canvas.getContext("2d");
  const cell = game.canvas.width / SNAKE_CONFIG.columns;
  const gradient = ctx.createLinearGradient(0, 0, 0, game.canvas.height);
  gradient.addColorStop(0, "#061a35"); gradient.addColorStop(1, "#0a3158");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, game.canvas.width, game.canvas.height);
  ctx.strokeStyle = "rgba(148,197,255,.055)"; ctx.lineWidth = 1;
  for (let x = 1; x < SNAKE_CONFIG.columns; x += 1) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, game.canvas.height); ctx.stroke(); }
  for (let y = 1; y < SNAKE_CONFIG.rows; y += 1) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(game.canvas.width, y * cell); ctx.stroke(); }
  if (game.state.food) {
    const x = (game.state.food.x + .5) * cell, y = (game.state.food.y + .5) * cell;
    const glow = ctx.createRadialGradient(x, y, 2, x, y, cell * .75); glow.addColorStop(0, "#ff8094"); glow.addColorStop(1, "rgba(255,73,105,0)");
    ctx.fillStyle = glow; ctx.fillRect(x - cell, y - cell, cell * 2, cell * 2);
    ctx.fillStyle = "#ff4d6d"; ctx.beginPath(); ctx.arc(x, y, cell * .25, 0, Math.PI * 2); ctx.fill();
  }
  game.state.body.forEach((part, index) => {
    const inset = index ? 3 : 1.5;
    ctx.fillStyle = index ? `hsl(${207 + Math.min(index, 16)}, 88%, ${66 - Math.min(index, 18)}%)` : "#eef7ff";
    ctx.beginPath(); ctx.roundRect(part.x * cell + inset, part.y * cell + inset, cell - inset * 2, cell - inset * 2, index ? 7 : 9); ctx.fill();
  });
}

function queueSnakeDirection(game, direction) {
  if (!game.started || !game.state.alive) return;
  const tick = game.state.tick + 1;
  if (game.events.at(-1)?.tick === tick) game.events.pop();
  game.events.push({ tick, direction });
}

async function endSnake(game) {
  if (game.finished) return;
  game.finished = true;
  const result = game.root.querySelector("[data-snake-result]");
  result.hidden = false;
  result.innerHTML = `<span>${game.state.score.toLocaleString("tr-TR")}</span><h3>${game.state.outcome === "won" ? "Hedef tamamlandı" : "Oyun bitti"}</h3><p>${game.mode === "ranked" ? "Sonuç sunucuda doğrulanıyor." : "Antrenman puan harcamaz."}</p>`;
  if (game.mode === "practice") {
    result.innerHTML += `<button class="btn btn-primary btn-sm" type="button" data-action="restart-snake-practice">Tekrar oyna</button><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Kapat</button>`;
    return;
  }
  try {
    const response = await portalServerRequest("/api/flappy-session", { module: "game_center", action: "finish_snake", attemptId: game.attempt.id, directionEvents: game.events, finalTick: game.state.tick });
    state.cache.gameCenter = response;
    result.innerHTML = `<span>${Number(response.attempt.score || 0).toLocaleString("tr-TR")}</span><h3>${response.attempt.status === "won" ? "Tebrikler!" : "Deneme tamamlandı"}</h3><p>${response.attempt.status === "won" ? `Kredi hesabına ${response.attempt.reward_points} kredi eklendi.` : "Antrenman modu her zaman ücretsiz."}</p><button class="btn btn-primary btn-sm" type="button" data-action="close-game-result">Tamamla</button>`;
    if (response.attempt.status === "won") {
      state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);
      maybeCelebrateRewards();
    }
  } catch (error) {
    result.innerHTML += `<p class="form-error">${esc(error.message)}</p><button class="btn btn-primary btn-sm" type="button" data-action="retry-snake-result">Yeniden dene</button>`;
    game.finished = false;
  }
}

function launchSnake(mode, attempt = null) {
  stopSnakeGame();
  const target = Number(attempt?.target_score || gameCenterSetting("snake").target_score || 1000);
  const seed = Number(attempt?.seed || randomPracticeSeed());
  modal({ title: mode === "ranked" ? "İHP Snake" : "Snake antrenmanı", subtitle: mode === "ranked" ? "Sonuç sunucuda yeniden hesaplanır." : "Sınırsız ve puansız.", body: snakeMarkup(mode, target) });
  modalRoot.querySelector(".modal")?.classList.add("snake-game-modal");
  const root = modalRoot.querySelector("[data-snake-game]");
  const canvas = root?.querySelector("canvas");
  if (!root || !canvas) return;
  const game = { mode, attempt, root, canvas, state: createSnakeState(seed, target), events: [], timer: 0, started: false, finished: false };
  game.onKeyDown = (event) => {
    const direction = ({ ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" })[event.code];
    if (direction) { event.preventDefault(); queueSnakeDirection(game, direction); }
  };
  document.addEventListener("keydown", game.onKeyDown);
  root.querySelectorAll("[data-snake-direction]").forEach((button) => button.addEventListener("pointerdown", (event) => { event.preventDefault(); queueSnakeDirection(game, button.dataset.snakeDirection); }));
  activeSnakeGame = game;
  drawSnake(game);
  let count = 3;
  const countdown = root.querySelector("[data-snake-countdown]");
  const begin = () => {
    if (activeSnakeGame !== game) return;
    if (count > 0) { countdown.textContent = count; count -= 1; game.timer = setTimeout(begin, 650); return; }
    countdown.hidden = true; game.started = true;
    const tick = () => {
      if (activeSnakeGame !== game || !game.state.alive) { if (activeSnakeGame === game) endSnake(game); return; }
      advanceSnake(game.state, game.state.tick + 1, game.events);
      root.querySelector("[data-snake-score]").textContent = game.state.score.toLocaleString("tr-TR");
      drawSnake(game);
      if (!game.state.alive) { endSnake(game); return; }
      game.timer = setTimeout(tick, snakeTickDuration(game.state.foodsEaten));
    };
    game.timer = setTimeout(tick, snakeTickDuration(0));
  };
  begin();
}

function scratchCardMarkup(attempt) {
  const won = attempt.status === "won";
  return `<div class="scratch-stage" data-scratch-stage><div class="scratch-ticket"><div class="scratch-result ${won ? "won" : "lost"}"><span>${won ? "TEBRİKLER" : "BU KEZ OLMADI"}</span><strong>${won ? `+${attempt.reward_points} KREDİ` : "YENİ DÖNEM, YENİ ŞANS"}</strong><small>İHP Kazı Kazan</small></div><canvas class="scratch-canvas" width="760" height="380" aria-label="Kazı Kazan kartı"></canvas></div><p>Kartın üzerini parmağınla veya farenle kazı.</p><button class="btn btn-primary btn-sm" type="button" data-action="finish-scratch" hidden>Kartı tamamla</button></div>`;
}

function launchScratch(attempt) {
  modal({ title: "İHP Kazı Kazan", subtitle: "Kartın hazır. Sonucu görmek için yüzeyi kazı.", body: scratchCardMarkup(attempt) });
  modalRoot.querySelector(".modal")?.classList.add("scratch-modal");
  const root = modalRoot.querySelector("[data-scratch-stage]");
  const canvas = root?.querySelector("canvas");
  if (!root || !canvas) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#8fc7ff"); gradient.addColorStop(.45, "#dceeff"); gradient.addColorStop(1, "#5d9ee8");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(5,27,56,.88)"; ctx.font = "800 52px system-ui"; ctx.textAlign = "center"; ctx.fillText("İHP KAZI KAZAN", canvas.width / 2, 165);
  ctx.font = "600 24px system-ui"; ctx.fillText("KAZI VE ŞANSINI GÖR", canvas.width / 2, 218);
  let drawing = false, moves = 0, revealed = false;
  const erase = (event) => {
    if (!drawing || revealed) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    ctx.save(); ctx.globalCompositeOperation = "destination-out"; ctx.beginPath(); ctx.arc(x, y, 42, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    moves += 1;
    if (moves % 8 === 0) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      for (let index = 3; index < pixels.length; index += 16) if (pixels[index] < 30) clear += 1;
      if (clear / (pixels.length / 16) > .42) {
        revealed = true; canvas.classList.add("revealed"); root.querySelector('[data-action="finish-scratch"]').hidden = false;
      }
    }
  };
  canvas.addEventListener("pointerdown", (event) => { drawing = true; canvas.setPointerCapture(event.pointerId); erase(event); });
  canvas.addEventListener("pointermove", erase);
  canvas.addEventListener("pointerup", () => { drawing = false; });
  activeScratchCard = { root, canvas, attempt };
}

function scratchBatchCard(attempt, index) {
  const won = attempt.status === "won";
  return `
    <article class="scratch-batch-card ${won ? "won" : "lost"}" data-scratch-card="${index}">
      <div class="scratch-batch-result"><span>${won ? "TEBRİKLER" : "BU KEZ OLMADI"}</span><strong>${won ? `+${Number(attempt.reward_points || 0)} KREDİ` : "YENİ ŞANS"}</strong><small>Kart ${index + 1}</small></div>
      <canvas width="520" height="300" aria-label="${index + 1}. Kazı Kazan kartı"></canvas>
    </article>
  `;
}

function paintScratchCover(canvas, index) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#7960ea");
  gradient.addColorStop(.52, "#5f8ff1");
  gradient.addColorStop(1, "#3a6fda");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.textAlign = "center";
  ctx.font = "800 34px system-ui";
  ctx.fillText("İHP KAZI KAZAN", canvas.width / 2, 132);
  ctx.font = "650 17px system-ui";
  ctx.fillText(`KART ${index + 1}`, canvas.width / 2, 168);
  return ctx;
}

function revealScratchBatchCard(card) {
  if (!card || card.classList.contains("revealed")) return;
  card.classList.add("revealed");
  card.querySelector("canvas")?.classList.add("revealed");
}

function bindScratchBatchCard(card, index) {
  const canvas = card.querySelector("canvas");
  if (!canvas) return;
  const ctx = paintScratchCover(canvas, index);
  let drawing = false;
  let moves = 0;
  const erase = (event) => {
    if (!drawing || card.classList.contains("revealed")) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    moves += 1;
    if (moves % 7 === 0) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      for (let cursor = 3; cursor < pixels.length; cursor += 20) if (pixels[cursor] < 30) clear += 1;
      if (clear / (pixels.length / 20) > .38) revealScratchBatchCard(card);
    }
  };
  canvas.addEventListener("pointerdown", (event) => { drawing = true; canvas.setPointerCapture(event.pointerId); erase(event); });
  canvas.addEventListener("pointermove", erase);
  canvas.addEventListener("pointerup", () => { drawing = false; });
  canvas.addEventListener("pointercancel", () => { drawing = false; });
}

function launchScratchBatch(attempts) {
  const wonCount = attempts.filter((attempt) => attempt.status === "won").length;
  const reward = attempts.reduce((sum, attempt) => sum + Number(attempt.reward_points || 0), 0);
  modal({
    title: "İHP Kazı Kazan",
    subtitle: `${attempts.length} kart hazır. Sonuçlar sunucuda güvence altında.`,
    body: `
      <div class="scratch-batch-stage" data-scratch-batch>
        <div class="scratch-batch-summary"><span>${attempts.length} kart</span><strong>${wonCount ? `${wonCount} kazanç, +${reward} kredi` : "Kartlarını aç"}</strong><button class="btn btn-primary btn-sm" type="button" data-action="reveal-all-scratch">Tümünü aç</button></div>
        <div class="scratch-batch-grid">${attempts.map(scratchBatchCard).join("")}</div>
        <button class="btn btn-secondary btn-sm scratch-batch-finish" type="button" data-action="finish-scratch">Tamamla</button>
      </div>
    `
  });
  modalRoot.querySelector(".modal")?.classList.add("scratch-modal", "scratch-batch-modal");
  const root = modalRoot.querySelector("[data-scratch-batch]");
  root?.querySelectorAll("[data-scratch-card]").forEach((card, index) => bindScratchBatchCard(card, index));
  activeScratchCard = { root, attempts };
}

const gameCenterBaseCloseModal = closeModal;
closeModal = function gameCenterCloseModal() {
  stopSnakeGame();
  activeScratchCard = null;
  return gameCenterBaseCloseModal();
};

const gameCenterBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function gameCenterRenderPortalPage(page) {
  if (page === "games") return gameCenterPage();
  return gameCenterBaseRenderPortalPage(page);
};

const gameCenterBaseLoadPage = loadPage;
loadPage = async function gameCenterLoadPage(page) {
  if (page !== "games") return gameCenterBaseLoadPage(page);
  state.loading = true; state.pageError = null; render();
  try {
    const [gameCenter, flappyStatus, notifications] = await Promise.all([
      portalServerRequest("/api/flappy-session", { module: "game_center", action: "status" }),
      portalServerRequest("/api/flappy-session", { action: "status" }),
      loadNotifications().catch(() => state.cache.notifications || [])
    ]);
    state.cache.gameCenter = gameCenter; state.cache.flappyStatus = flappyStatus; state.cache.notifications = notifications;
  } catch (error) { state.pageError = { page, message: error.message }; }
  finally { state.loading = false; render(); }
};

const gameCenterBaseHandleClick = handleClick;
handleClick = async function gameCenterHandleClick(event) {
  const target = event.target.closest("[data-action], [data-snake-direction]");
  const action = target?.dataset.action;
  if (action === "start-snake-practice") { event.preventDefault(); launchSnake("practice"); return; }
  if (action === "open-scratch-purchase") { event.preventDefault(); openScratchPurchase(); return; }
  if (action === "scratch-quantity-down" || action === "scratch-quantity-up") {
    event.preventDefault();
    const input = modalRoot.querySelector("[data-scratch-quantity]");
    if (input) input.value = String(Math.max(1, Math.min(10, Number(input.value || 1) + (action.endsWith("up") ? 1 : -1))));
    updateScratchPurchaseTotal();
    return;
  }
  if (action === "confirm-scratch-purchase") {
    event.preventDefault();
    const quantity = Math.max(1, Math.min(10, Number(modalRoot.querySelector("[data-scratch-quantity]")?.value || 1)));
    target.disabled = true;
    try {
      state.cache.gameCenter = await portalServerRequest("/api/flappy-session", { module: "game_center", action: "request_credit", gameKey: "scratch", quantity });
      closeModal();
      showToast(`${quantity} kart için kredi onayı oluşturuldu.`, "success");
      navigate("portal/credit");
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "request-game-credit") {
    event.preventDefault(); target.disabled = true;
    try {
      state.cache.gameCenter = await portalServerRequest("/api/flappy-session", { module: "game_center", action: "request_credit", gameKey: target.dataset.gameKey });
      showToast("Kredi talebi onayınıza gönderildi.", "success");
      navigate("portal/credit");
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "start-approved-snake") {
    event.preventDefault(); target.disabled = true;
    try {
      const response = await portalServerRequest("/api/flappy-session", { module: "game_center", action: "start_snake", acceptedTerms: true });
      state.cache.gameCenter = response;
      launchSnake("ranked", response.attempt);
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "play-approved-scratch") {
    event.preventDefault(); target.disabled = true;
    try {
      const quantity = Math.max(1, Math.min(10, Number(target.dataset.quantity || 1)));
      const response = await portalServerRequest("/api/flappy-session", { module: "game_center", action: "play_scratch_batch", quantity, acceptedTerms: true });
      state.cache.gameCenter = response;
      launchScratchBatch(response.batchAttempts || []);
      if (Number(response.wonCount || 0) > 0) {
        state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);
        maybeCelebrateRewards();
      }
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "reveal-all-scratch") {
    event.preventDefault();
    activeScratchCard?.root?.querySelectorAll("[data-scratch-card]").forEach(revealScratchBatchCard);
    target.disabled = true;
    target.textContent = "Kartlar açıldı";
    return;
  }
  if (action === "restart-snake-practice") { event.preventDefault(); launchSnake("practice"); return; }
  if (action === "retry-snake-result") { event.preventDefault(); if (activeSnakeGame) { activeSnakeGame.finished = false; endSnake(activeSnakeGame); } return; }
  if (action === "close-game-result" || action === "finish-scratch") { event.preventDefault(); closeModal(); await loadPage("games"); return; }
  if (action === "save-game-settings") {
    event.preventDefault(); target.disabled = true;
    try {
      const settings = [...document.querySelectorAll("[data-game-setting]")].map((card) => ({
        gameKey: card.dataset.gameSetting,
        enabled: card.querySelector("[data-game-enabled]").checked,
        entryCost: Number(card.querySelector("[data-game-cost]").value),
        rewardPoints: Number(card.querySelector("[data-game-reward]").value),
        winProbabilityBasisPoints: Math.round(Number(card.querySelector("[data-game-probability]")?.value || 0) * 100)
      }));
      state.cache.gameCenter = await portalServerRequest("/api/flappy-session", { module: "game_center", action: "update_settings", settings });
      showToast("Oyun ayarları güncellendi.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  return gameCenterBaseHandleClick(event);
};

const gameCenterBaseHandleFilter = handleFilter;
handleFilter = async function gameCenterHandleFilter(event) {
  if (event.target.matches("[data-scratch-quantity]")) {
    updateScratchPurchaseTotal();
    return;
  }
  if (event.target.matches("[data-scratch-purchase-consent]")) {
    const button = modalRoot.querySelector('[data-action="confirm-scratch-purchase"]');
    if (button) button.disabled = !event.target.checked;
    return;
  }
  const kind = event.target.dataset.gameConsent;
  if (kind) {
    const button = modalRoot.querySelector(`[data-action="confirm-${kind}"]`);
    if (button) button.disabled = !event.target.checked;
    return;
  }
  return gameCenterBaseHandleFilter(event);
};
