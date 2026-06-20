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
    attempt_period: "weekly"
  };
}

function latestGameAttempt(key) {
  return (state.cache.gameCenter?.attempts || []).find((item) => item.game_key === key) || null;
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
      ${attempt ? `<div class="arcade-result">${badge(gameAttemptLabel(attempt), attempt.status === "won" ? "green" : "gray")}<strong>${Number(attempt.score || 0).toLocaleString("tr-TR")} skor</strong><small>Yeni hak ${flappyNextWeekText()} tarihinde açılır.</small></div>` : ""}
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
      <div class="panel-head"><div><span class="panel-kicker">Admin kontrol merkezi</span><h3>Oyun kuralları</h3></div>${badge("Bu haftaki oyunlar: ${(stats.flappy || 0) + (stats.snake || 0) + (stats.scratch || 0)}", "blue")}</div>
      <div class="game-admin-grid">
        ${["flappy", "snake", "scratch"].map((key) => {
          const item = gameCenterSetting(key);
          return `<fieldset class="game-admin-card" data-game-setting="${key}">
            <legend>${esc(item.display_name || key)}</legend>
            <label class="switch-row"><span>Oyun açık</span><input type="checkbox" data-game-enabled ${item.enabled ? "checked" : ""} /></label>
            <label>Giriş bedeli<input class="field" data-game-cost type="number" min="0" max="100" value="${item.entry_cost}" /></label>
            <label>Ödül puanı<input class="field" data-game-reward type="number" min="0" max="100" value="${item.reward_points}" /></label>
            ${key === "scratch" ? `<label>Kazanma ihtimali (%)<input class="field" data-game-probability type="number" min="0" max="100" step="0.1" value="${Number(item.win_probability_basis_points || 0) / 100}" /></label>` : ""}
            <small>Bu hafta ${Number(stats[key] || 0)} puanlı kullanım</small>
          </fieldset>`;
        }).join("")}
      </div>
      <div class="game-member-status">
        <div class="panel-head compact"><div><span class="panel-kicker">Haftalık durum</span><h4>Üye oyun hakları</h4></div>${badge(`${members.length} üye`, "blue")}</div>
        ${members.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Üye</th><th>Puan</th><th>Flappy</th><th>Snake</th><th>Kazı Kazan</th></tr></thead><tbody>${members.map((member) => `<tr><td><strong>${esc(member.displayName)}</strong></td><td>${member.disciplinePoints}</td><td>${badge(member.flappy ? "Kullandı" : "Hazır", member.flappy ? "gray" : "green")}</td><td>${badge(member.snake ? "Kullandı" : "Hazır", member.snake ? "gray" : "green")}</td><td>${badge(member.scratch ? "Kullandı" : "Hazır", member.scratch ? "gray" : "green")}</td></tr>`).join("")}</tbody></table></div>` : emptyCard("Aktif üye yok", "Üye oyun durumları burada görünür.")}
      </div>
      <div class="panel-actions"><button class="btn btn-primary btn-sm" type="button" data-action="save-game-settings">Oyun ayarlarını kaydet</button></div>
    </section>
  `;
}

function gameCenterPage() {
  const points = Number(state.cache.gameCenter?.disciplinePoints ?? state.cache.flappyStatus?.disciplinePoints ?? disciplinePoints(state.profile));
  const flappy = gameCenterSetting("flappy");
  const snake = gameCenterSetting("snake");
  const scratch = gameCenterSetting("scratch");
  const flappySession = state.cache.flappyStatus?.session || null;
  const snakeAttempt = latestGameAttempt("snake");
  const scratchAttempt = latestGameAttempt("scratch");
  return `
    <section class="page-head arcade-head">
      <div><span class="eyebrow">İHP Oyun Alanı</span><h2>Refleks, strateji ve biraz şans.</h2><p>Antrenman ücretsizdir. Puanlı haklar haftalıktır ve sonuçlar sunucuda doğrulanır.</p></div>
      <div class="flappy-points-orb"><span>Disiplin puanın</span><strong>${points}</strong></div>
    </section>
    <section class="arcade-grid">
      ${gameCenterCard({
        key: "flappy", title: "İHP Flappy", kicker: "Refleks", iconName: "sparkles",
        description: "Daralan geçitlerde ritmini koru ve 10.000 skora ulaş.",
        facts: [["Puanlı giriş", `${flappy.entry_cost} puan`], ["Ödül", `+${flappy.reward_points}`]],
        attempt: flappySession,
        actions: `<button class="btn btn-secondary btn-sm" type="button" data-action="start-flappy-practice" ${flappy.enabled ? "" : "disabled"}>Antrenman</button>${flappySession ? "" : `<button class="btn btn-primary btn-sm" type="button" data-action="open-ranked-flappy-terms" ${flappy.enabled && points >= flappy.entry_cost ? "" : "disabled"}>Puanlı oyna</button>`}`
      })}
      ${gameCenterCard({
        key: "snake", title: "İHP Snake", kicker: "Strateji", iconName: "activity",
        description: "Hızlanan alanda rotanı planla, büyü ve hedef skora ulaş.",
        facts: [["Puanlı giriş", `${snake.entry_cost} puan`], ["Hedef", Number(snake.target_score).toLocaleString("tr-TR")], ["Ödül", `+${snake.reward_points}`]],
        attempt: snakeAttempt,
        actions: `<button class="btn btn-secondary btn-sm" type="button" data-action="start-snake-practice" ${snake.enabled ? "" : "disabled"}>Antrenman</button>${snakeAttempt ? "" : `<button class="btn btn-primary btn-sm" type="button" data-action="open-ranked-snake-terms" ${snake.enabled && points >= snake.entry_cost ? "" : "disabled"}>Puanlı oyna</button>`}`
      })}
      ${gameCenterCard({
        key: "scratch", title: "İHP Kazı Kazan", kicker: "Şans", iconName: "gift",
        description: "Haftalık kartını kazı. Sonuç güvenli biçimde sunucuda belirlenir.",
        facts: [["Kart bedeli", `${scratch.entry_cost} puan`], ["Ödül", `+${scratch.reward_points}`], ["İhtimal", `%${(Number(scratch.win_probability_basis_points) / 100).toLocaleString("tr-TR")}`]],
        attempt: scratchAttempt,
        actions: scratchAttempt ? "" : `<button class="btn btn-primary btn-sm" type="button" data-action="open-scratch-terms" ${scratch.enabled && points >= scratch.entry_cost ? "" : "disabled"}>Kartı al</button>`
      })}
    </section>
    <section class="panel glass arcade-integrity"><span>${icon("shield")}</span><div><strong>Adil oyun koruması</strong><p>Puanlı skorlar ve şans sonuçları sunucuda doğrulanır. Bağlantı kesilse bile kullanılan giriş bedeli iade edilmez.</p></div></section>
    ${adminGameSettingsPanel()}
  `;
}

function openGameTerms(kind) {
  const settings = gameCenterSetting(kind);
  const name = kind === "snake" ? "İHP Snake" : "İHP Kazı Kazan";
  modal({
    title: `${name} puanlı hak`,
    subtitle: "Bu işlem haftalık oyun hakkınızı kullanır.",
    body: `<div class="flappy-terms-box"><span class="flappy-terms-icon">${icon("shield")}</span><div><strong>Puan kullanım onayı</strong><p>${settings.entry_cost} disiplin puanı hesabımdan kalıcı olarak düşülür. Oyunu kapatsam, bağlantım kesilse veya kazanamasam bile puanın iade edilmeyeceğini ve bu dönem yeniden giriş yapamayacağımı anladım.</p></div></div><label class="flappy-consent"><input type="checkbox" data-game-consent="${kind}" /> <span>Metni okudum, anladım ve kabul ediyorum.</span></label>`,
    actions: `<div class="modal-actions"><button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button><button class="btn btn-primary btn-sm" type="button" data-action="confirm-${kind}" disabled>${settings.entry_cost} puan kullan</button></div>`
  });
}

function stopSnakeGame() {
  if (!activeSnakeGame) return;
  clearTimeout(activeSnakeGame.timer);
  document.removeEventListener("keydown", activeSnakeGame.onKeyDown);
  activeSnakeGame = null;
}

function snakeMarkup(mode, target) {
  return `<div class="snake-shell" data-snake-game><div class="snake-topline"><span>${mode === "ranked" ? "Haftalık puanlı deneme" : "Sınırsız antrenman"}</span><strong><b data-snake-score>0</b> / ${Number(target).toLocaleString("tr-TR")}</strong></div><div class="snake-board-wrap"><canvas class="snake-board" width="500" height="600" aria-label="İHP Snake oyun alanı"></canvas><div class="snake-countdown" data-snake-countdown>3</div><div class="snake-result" data-snake-result hidden></div></div><div class="snake-controls" aria-label="Yön kontrolleri"><button type="button" data-snake-direction="up">↑</button><button type="button" data-snake-direction="left">←</button><button type="button" data-snake-direction="down">↓</button><button type="button" data-snake-direction="right">→</button></div><p>Yön tuşları veya WASD ile oyna.</p></div>`;
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
    const response = await portalServerRequest("/api/game-center", { action: "finish_snake", attemptId: game.attempt.id, directionEvents: game.events, finalTick: game.state.tick });
    state.cache.gameCenter = response;
    state.profile.discipline_points = response.disciplinePoints;
    result.innerHTML = `<span>${Number(response.attempt.score || 0).toLocaleString("tr-TR")}</span><h3>${response.attempt.status === "won" ? "Tebrikler!" : "Deneme tamamlandı"}</h3><p>${response.attempt.status === "won" ? `Hesabına ${response.attempt.reward_points} disiplin puanı eklendi.` : "Antrenman modu her zaman ücretsiz."}</p><button class="btn btn-primary btn-sm" type="button" data-action="close-game-result">Tamamla</button>`;
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
  return `<div class="scratch-stage" data-scratch-stage><div class="scratch-ticket"><div class="scratch-result ${won ? "won" : "lost"}"><span>${won ? "TEBRİKLER" : "BU KEZ OLMADI"}</span><strong>${won ? `+${attempt.reward_points} PUAN` : "YENİ HAFTA, YENİ ŞANS"}</strong><small>İHP Kazı Kazan</small></div><canvas class="scratch-canvas" width="760" height="380" aria-label="Kazı Kazan kartı"></canvas></div><p>Kartın üzerini parmağınla veya farenle kazı.</p><button class="btn btn-primary btn-sm" type="button" data-action="finish-scratch" hidden>Kartı tamamla</button></div>`;
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
      portalServerRequest("/api/game-center", { action: "status" }),
      portalServerRequest("/api/flappy-session", { action: "status" }),
      loadNotifications().catch(() => state.cache.notifications || [])
    ]);
    state.cache.gameCenter = gameCenter; state.cache.flappyStatus = flappyStatus; state.cache.notifications = notifications;
    state.profile.discipline_points = gameCenter.disciplinePoints;
  } catch (error) { state.pageError = { page, message: error.message }; }
  finally { state.loading = false; render(); }
};

const gameCenterBaseHandleClick = handleClick;
handleClick = async function gameCenterHandleClick(event) {
  const target = event.target.closest("[data-action], [data-snake-direction]");
  const action = target?.dataset.action;
  if (action === "start-snake-practice") { event.preventDefault(); launchSnake("practice"); return; }
  if (action === "open-ranked-snake-terms") { event.preventDefault(); openGameTerms("snake"); return; }
  if (action === "open-scratch-terms") { event.preventDefault(); openGameTerms("scratch"); return; }
  if (action === "confirm-snake") {
    event.preventDefault(); target.disabled = true;
    try {
      const response = await portalServerRequest("/api/game-center", { action: "start_snake", acceptedTerms: true });
      state.cache.gameCenter = response; state.profile.discipline_points = response.disciplinePoints;
      gameCenterBaseCloseModal(); launchSnake("ranked", response.attempt);
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  if (action === "confirm-scratch") {
    event.preventDefault(); target.disabled = true;
    try {
      const response = await portalServerRequest("/api/game-center", { action: "play_scratch", acceptedTerms: true });
      state.cache.gameCenter = response; state.profile.discipline_points = response.disciplinePoints;
      gameCenterBaseCloseModal(); launchScratch(response.attempt);
      if (response.won) {
        state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);
        maybeCelebrateRewards();
      }
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
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
      state.cache.gameCenter = await portalServerRequest("/api/game-center", { action: "update_settings", settings });
      showToast("Oyun ayarları güncellendi.", "success"); render();
    } catch (error) { showToast(error.message, "error"); target.disabled = false; }
    return;
  }
  return gameCenterBaseHandleClick(event);
};

const gameCenterBaseHandleFilter = handleFilter;
handleFilter = async function gameCenterHandleFilter(event) {
  const kind = event.target.dataset.gameConsent;
  if (kind) {
    const button = modalRoot.querySelector(`[data-action="confirm-${kind}"]`);
    if (button) button.disabled = !event.target.checked;
    return;
  }
  return gameCenterBaseHandleFilter(event);
};
