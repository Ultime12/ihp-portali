const IHP_FLAPPY_GAME_V1 = true;
const FLAPPY_PAGE_ID = "games";
let activeFlappyGame = null;

if (!navItems.some(([id]) => id === FLAPPY_PAGE_ID)) {
  const settingsIndex = navItems.findIndex(([id]) => id === "settings");
  navItems.splice(settingsIndex < 0 ? navItems.length : settingsIndex, 0, [
    FLAPPY_PAGE_ID,
    "Oyun Alanı",
    "sparkles",
    () => !(typeof isEntryAccessAccount === "function" && isEntryAccessAccount())
  ]);
}

function flappyStatusLabel(status) {
  return ({
    active: "Başlatıldı",
    won: "Ödül kazanıldı",
    failed: "Tamamlandı",
    expired: "Süresi doldu"
  })[status] || "Kullanılmadı";
}

function flappyStatusTone(status) {
  return status === "won" ? "green" : status === "active" ? "gold" : status ? "gray" : "blue";
}

function flappyNextPeriodText() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const values = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const anchor = Date.UTC(2026, 0, 1);
  const elapsedDays = Math.floor((today.getTime() - anchor) / 86_400_000);
  const next = new Date(anchor + (Math.floor(elapsedDays / 2) * 2 + 2) * 86_400_000);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(next);
}

function flappyPage() {
  const status = state.cache.flappyStatus || {};
  const session = status.session;
  const creditBalance = Number(status.creditBalance || 0);
  const config = status.config || { entryCost: 5, reward: 10, targetScore: 10000, scorePerPipe: 400 };
  const rankedAvailable = !session && creditBalance >= config.entryCost;
  return `
    <section class="page-head flappy-page-head">
      <div><span class="eyebrow">Sınırsız meydan okuma</span><h2>İHP Flappy</h2><p>Refleksini antrenmanda geliştir, hazır olduğunda kredili oyuna istediğin kadar katıl.</p></div>
      <div class="flappy-points-orb"><span>Kredi bakiyen</span><strong>${creditBalance}</strong></div>
    </section>
    <section class="flappy-mode-grid">
      <article class="panel glass flappy-mode-card flappy-practice-card">
        <span class="flappy-card-icon">${icon("sparkles")}</span>
        <div><span class="panel-kicker">Sınırsız</span><h3>Antrenman</h3><p>Kredi harcamadan istediğin kadar oyna. Oyun zorluğu ve fizik kuralları kredili modla aynıdır.</p></div>
        <div class="flappy-facts"><span>Kredi bedeli <b>0</b></span><span>Deneme <b>Sınırsız</b></span></div>
        <button class="btn btn-secondary" type="button" data-action="start-flappy-practice">Antrenmana başla ${icon("arrow")}</button>
      </article>
      <article class="panel glass flappy-mode-card flappy-ranked-card">
        <span class="flappy-card-icon">${icon("shield")}</span>
        <div><span class="panel-kicker">2 günde bir</span><h3>Kredili deneme</h3><p>Giriş bedeli ve kredi ödülü Admin tarafından belirlenir.</p></div>
        <div class="flappy-facts"><span>Hedef <b>${Number(config.targetScore).toLocaleString("tr-TR")}</b></span><span>Ödül <b>+${config.reward}</b></span></div>
        ${session ? `
          <div class="flappy-week-result">
            ${badge(flappyStatusLabel(session.status), flappyStatusTone(session.status))}
            <strong>${Number(session.score || 0).toLocaleString("tr-TR")} skor</strong>
            <small>Yeni kredi onayıyla hemen tekrar oynayabilirsiniz.</small>
          </div>
        ` : `
          <button class="btn btn-primary" type="button" data-action="open-ranked-flappy-terms" ${rankedAvailable ? "" : "disabled"}>
            ${creditBalance < config.entryCost ? "Yetersiz kredi" : "Kredili denemeye gir"} ${icon("arrow")}
          </button>
        `}
      </article>
    </section>
    <section class="panel glass flappy-rules-panel">
      <div class="panel-head"><div><span class="panel-kicker">Oyun kuralları</span><h3>Zor ama adil</h3></div>${badge("25 geçiş = 10.000", "blue")}</div>
      <div class="flappy-rule-grid">
        <div><b>01</b><span>Her engel 400 skor kazandırır.</span></div>
        <div><b>02</b><span>Hız kademeli artar, geçiş aralığı daralır.</span></div>
        <div><b>03</b><span>Kredili sonuç sunucuda yeniden hesaplanır.</span></div>
        <div><b>04</b><span>İki günlük deneme başlatıldıktan sonra iade edilmez.</span></div>
      </div>
    </section>
  `;
}

function openRankedFlappyTerms() {
  const config = state.cache.flappyStatus?.config || { entryCost: 5 };
  modal({
    title: "Kredili oyun onayı",
    subtitle: "Her kredili oyun için Kredi Sistemi üzerinden ayrı onay gerekir.",
    body: `
      <div class="flappy-terms-box">
        <span class="flappy-terms-icon">${icon("shield")}</span>
        <div><strong>Kredi kullanımı aydınlatma metni</strong><p>Bu oyun başlatıldığında ${config.entryCost} kredi hesabımdan kalıcı olarak düşülür. Oyunu kapatsam, bağlantım kesilse veya başarısız olsam dahi kredinin iade edilmeyeceğini anladım.</p></div>
      </div>
      <label class="flappy-consent"><input type="checkbox" data-flappy-consent /> <span>Metni okudum, anladım ve kabul ediyorum.</span></label>
    `,
    actions: `
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="close-modal">Vazgeç</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="confirm-ranked-flappy" disabled>${config.entryCost} kredi kullan ve başlat</button>
      </div>
    `
  });
}

function randomPracticeSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return Math.max(1, values[0] % 2147483646);
}

function flappyGameMarkup(mode) {
  return `
    <div class="flappy-game-shell" data-flappy-game>
      <div class="flappy-game-topline">
        <span>${mode === "ranked" ? "Sınırsız kredili oyun" : "Sınırsız antrenman"}</span>
        <div><span class="flappy-lives" data-flappy-lives>3 can</span><b data-flappy-score>0</b><small>/ 10.000</small></div>
      </div>
      <div class="flappy-canvas-wrap">
        <canvas class="flappy-canvas" width="840" height="1440" aria-label="İHP Flappy oyun alanı"></canvas>
        <div class="flappy-countdown" data-flappy-countdown>3</div>
        <div class="flappy-game-result" data-flappy-result hidden></div>
      </div>
      <p class="flappy-controls">Boşluk tuşu, tıklama veya dokunma ile yüksel.</p>
    </div>
  `;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function renderFlappyCanvas(game) {
  const { canvas, state: gameState } = game;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, FLAPPY_CONFIG.width, FLAPPY_CONFIG.height);

  const sky = ctx.createLinearGradient(0, 0, 0, FLAPPY_CONFIG.height);
  sky.addColorStop(0, "#061b38");
  sky.addColorStop(0.55, "#0d3260");
  sky.addColorStop(1, "#165179");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, FLAPPY_CONFIG.width, FLAPPY_CONFIG.height);

  ctx.globalAlpha = 0.42;
  for (let index = 0; index < 24; index += 1) {
    const x = (seededVisual(game.seed, index) * FLAPPY_CONFIG.width - gameState.timeMs * (0.006 + index % 3 * 0.002)) % FLAPPY_CONFIG.width;
    const y = 35 + seededVisual(game.seed + 91, index) * 420;
    ctx.fillStyle = index % 4 ? "#8ac5ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x < 0 ? x + FLAPPY_CONFIG.width : x, y, index % 5 === 0 ? 1.8 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const glow = ctx.createRadialGradient(335, 155, 4, 335, 155, 110);
  glow.addColorStop(0, "rgba(134,195,255,.38)");
  glow.addColorStop(1, "rgba(134,195,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(220, 35, 220, 230);

  for (const pipe of gameState.pipes) {
    const gapTop = pipe.gapY - pipe.gap / 2;
    const gapBottom = pipe.gapY + pipe.gap / 2;
    const pipeGradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + FLAPPY_CONFIG.pipeWidth, 0);
    pipeGradient.addColorStop(0, "#27669d");
    pipeGradient.addColorStop(0.45, "#78bded");
    pipeGradient.addColorStop(1, "#174a78");
    ctx.fillStyle = pipeGradient;
    drawRoundedRect(ctx, pipe.x, -12, FLAPPY_CONFIG.pipeWidth, gapTop + 12, 10);
    drawRoundedRect(ctx, pipe.x, gapBottom, FLAPPY_CONFIG.pipeWidth, FLAPPY_CONFIG.groundY - gapBottom + 14, 10);
    ctx.fillStyle = "rgba(219,242,255,.78)";
    ctx.fillRect(pipe.x + 7, 0, 4, Math.max(0, gapTop - 5));
    ctx.fillRect(pipe.x + 7, gapBottom + 5, 4, Math.max(0, FLAPPY_CONFIG.groundY - gapBottom - 5));
  }

  ctx.save();
  ctx.translate(FLAPPY_CONFIG.birdX, gameState.birdY);
  ctx.rotate(gameState.rotation);
  ctx.shadowColor = "rgba(96,165,250,.85)";
  ctx.shadowBlur = 18;
  const bird = ctx.createLinearGradient(-18, -14, 18, 14);
  bird.addColorStop(0, "#f8fbff");
  bird.addColorStop(1, "#70adff");
  ctx.fillStyle = bird;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#092445";
  ctx.font = "700 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("İHP", -1, 1);
  ctx.fillStyle = "#a9d3ff";
  ctx.beginPath();
  ctx.ellipse(-13, 7, 11, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const ground = ctx.createLinearGradient(0, FLAPPY_CONFIG.groundY, 0, FLAPPY_CONFIG.height);
  ground.addColorStop(0, "#6eb5e5");
  ground.addColorStop(1, "#09284a");
  ctx.fillStyle = ground;
  ctx.fillRect(0, FLAPPY_CONFIG.groundY, FLAPPY_CONFIG.width, FLAPPY_CONFIG.height - FLAPPY_CONFIG.groundY);
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.fillRect(0, FLAPPY_CONFIG.groundY, FLAPPY_CONFIG.width, 2);
}

function seededVisual(seed, index) {
  let value = (Number(seed) + Math.imul(index + 3, 2654435761)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507);
  value ^= value >>> 13;
  return (value >>> 0) / 4294967296;
}

function updateFlappyResult(game, title, body, actions) {
  const result = game.root.querySelector("[data-flappy-result]");
  if (!result) return;
  result.hidden = false;
  result.innerHTML = `<span class="flappy-result-score">${game.state.score.toLocaleString("tr-TR")}</span><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="flappy-result-actions">${actions}</div>`;
}

async function finishRankedFlappy(game) {
  if (game.submitting || game.submitted) return;
  game.submitting = true;
  updateFlappyResult(game, "Skor doğrulanıyor", "Oyun sunucuda aynı fizik kurallarıyla yeniden hesaplanıyor.", `<span class="button-loader" aria-label="Yükleniyor"></span>`);
  try {
    const result = await portalServerRequest("/api/flappy-session", {
      action: "finish",
      sessionId: game.session.id,
      flapTimes: game.flapTimes,
      durationMs: Math.ceil(game.state.timeMs)
    });
    game.submitted = true;
    game.serverResult = result;
    state.cache.flappyStatus = {
      ...(state.cache.flappyStatus || {}),
      session: result.session,
      creditBalance: result.creditBalance
    };
    if (result.verified?.won || result.session?.status === "won") {
      updateFlappyResult(game, "Tebrikler!", `10.000 skora ulaştın. Kredi hesabına ${result.session.reward_points} kredi eklendi.`, `<button class="btn btn-primary btn-sm" type="button" data-action="close-flappy-result">Tamamla</button>`);
      state.cache.notifications = await loadNotifications().catch(() => state.cache.notifications || []);
      maybeCelebrateRewards();
    } else {
      updateFlappyResult(game, "Deneme tamamlandı", `Bu haftaki skorun ${Number(result.session?.score || game.state.score).toLocaleString("tr-TR")}. Antrenman modu her zaman açık.`, `<button class="btn btn-primary btn-sm" type="button" data-action="close-flappy-result">Tamamla</button>`);
    }
  } catch (error) {
    updateFlappyResult(game, "Sonuç gönderilemedi", error.message, `<button class="btn btn-primary btn-sm" type="button" data-action="retry-flappy-submit">Yeniden dene</button>`);
  } finally {
    game.submitting = false;
  }
}

function finishPracticeFlappy(game) {
  const won = game.state.outcome === "won";
  updateFlappyResult(
    game,
    won ? "Hedef tamam!" : "Antrenman bitti",
    won ? "Kredili deneme için hazırsın." : `${game.state.pipesPassed} engel geçtin. Bir sonraki antrenman kredi harcamaz.`,
    `<button class="btn btn-primary btn-sm" type="button" data-action="restart-flappy-practice">Tekrar oyna</button><button class="btn btn-secondary btn-sm" type="button" data-action="close-flappy-result">Kapat</button>`
  );
}

function stopActiveFlappyGame() {
  if (!activeFlappyGame) return;
  cancelAnimationFrame(activeFlappyGame.frameId);
  clearTimeout(activeFlappyGame.countdownTimer);
  document.removeEventListener("keydown", activeFlappyGame.onKeyDown);
  document.removeEventListener("visibilitychange", activeFlappyGame.onVisibility);
  activeFlappyGame.canvas?.removeEventListener("pointerdown", activeFlappyGame.onPointer);
  activeFlappyGame = null;
}

function launchFlappyGame(mode, session = null) {
  stopActiveFlappyGame();
  const seed = Number(session?.seed || randomPracticeSeed());
  modal({
    title: mode === "ranked" ? "İki günlük kredili deneme" : "Antrenman modu",
    subtitle: mode === "ranked" ? "Kredi onaylandı. Oyun kaydedilir ve sunucuda doğrulanır." : "Sınırsız, ücretsiz ve aynı zorlukta.",
    body: flappyGameMarkup(mode)
  });
  const root = modalRoot.querySelector("[data-flappy-game]");
  const canvas = root?.querySelector("canvas");
  if (!root || !canvas) return;
  modalRoot.querySelector(".modal")?.classList.add("flappy-game-modal");

  const game = {
    mode,
    session,
    seed,
    root,
    canvas,
    state: createFlappyState(seed),
    flapTimes: [0],
    countdownStart: performance.now(),
    startAt: performance.now() + 2600,
    startedAt: 0,
    started: false,
    ended: false,
    pausedAt: 0,
    frameId: 0,
    countdownTimer: 0,
    submitting: false,
    submitted: false
  };

  game.onPointer = (event) => {
    event.preventDefault();
    flap(game);
  };
  game.onKeyDown = (event) => {
    if (["Space", "ArrowUp"].includes(event.code)) {
      event.preventDefault();
      flap(game);
    }
  };
  game.onVisibility = () => {
    if (game.mode !== "practice" || !game.started || game.ended) return;
    if (document.hidden) game.pausedAt = performance.now();
    else if (game.pausedAt) {
      game.startedAt += performance.now() - game.pausedAt;
      game.pausedAt = 0;
    }
  };

  canvas.addEventListener("pointerdown", game.onPointer);
  document.addEventListener("keydown", game.onKeyDown);
  document.addEventListener("visibilitychange", game.onVisibility);
  activeFlappyGame = game;

  const frame = (now) => {
    if (activeFlappyGame !== game) return;
    const countdown = root.querySelector("[data-flappy-countdown]");
    if (!game.started) {
      const remaining = Math.max(0, game.startAt - now);
      if (countdown) countdown.textContent = remaining > 1700 ? "3" : remaining > 850 ? "2" : remaining > 0 ? "1" : "BAŞLA";
      renderFlappyCanvas(game);
      if (remaining <= 0) {
        game.started = true;
        game.startedAt = now;
        if (countdown) countdown.hidden = true;
      }
      game.frameId = requestAnimationFrame(frame);
      return;
    }
    if (game.pausedAt) {
      game.frameId = requestAnimationFrame(frame);
      return;
    }

    const elapsed = Math.min(FLAPPY_CONFIG.maxDurationMs, Math.max(0, Math.round(now - game.startedAt)));
    advanceFlappy(game.state, elapsed, game.flapTimes);
    renderFlappyCanvas(game);
    const score = root.querySelector("[data-flappy-score]");
    if (score) score.textContent = game.state.score.toLocaleString("tr-TR");
    const lives = root.querySelector("[data-flappy-lives]");
    if (lives) lives.textContent = `${game.state.lives} can`;
    const respawnRemaining = Math.max(0, game.state.respawningUntilMs - game.state.timeMs);
    if (countdown && respawnRemaining > 0) {
      countdown.hidden = false;
      countdown.textContent = String(Math.max(1, Math.ceil(respawnRemaining / 1000)));
    } else if (countdown) {
      countdown.hidden = true;
    }

    if (!game.state.alive && !game.ended) {
      game.ended = true;
      if (mode === "ranked") finishRankedFlappy(game);
      else finishPracticeFlappy(game);
      return;
    }
    game.frameId = requestAnimationFrame(frame);
  };
  game.frameId = requestAnimationFrame(frame);
}

function flap(game) {
  if (!game?.started || game.ended || game.pausedAt || game.state.respawningUntilMs > game.state.timeMs) return;
  const time = Math.max(0, Math.round(performance.now() - game.startedAt));
  const previous = game.flapTimes.at(-1) ?? -Infinity;
  if (time - previous < FLAPPY_CONFIG.minimumFlapIntervalMs) return;
  game.flapTimes.push(time);
}

const flappyBaseCloseModal = closeModal;
closeModal = function flappyCloseModal() {
  stopActiveFlappyGame();
  return flappyBaseCloseModal();
};

const flappyBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function flappyRenderPortalPage(page) {
  if (page === FLAPPY_PAGE_ID) return flappyPage();
  return flappyBaseRenderPortalPage(page);
};

const flappyBaseLoadPage = loadPage;
loadPage = async function flappyLoadPage(page) {
  if (page !== FLAPPY_PAGE_ID) return flappyBaseLoadPage(page);
  state.loading = true;
  state.pageError = null;
  render();
  try {
    const [gameStatus, notifications] = await Promise.all([
      portalServerRequest("/api/flappy-session", { action: "status" }),
      loadNotifications().catch(() => state.cache.notifications || [])
    ]);
    state.cache.flappyStatus = gameStatus;
    state.cache.notifications = notifications;
    maybeCelebrateRewards();
  } catch (error) {
    state.pageError = { page, message: error.message };
  } finally {
    state.loading = false;
    render();
  }
};

const flappyBaseHandleClick = handleClick;
handleClick = async function flappyHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;

  if (action === "start-flappy-practice") {
    event.preventDefault();
    launchFlappyGame("practice");
    return;
  }
  if (action === "open-ranked-flappy-terms") {
    event.preventDefault();
    openRankedFlappyTerms();
    return;
  }
  if (action === "confirm-ranked-flappy") {
    event.preventDefault();
    const accepted = Boolean(modalRoot.querySelector("[data-flappy-consent]")?.checked);
    if (!accepted) {
      showToast("Devam etmek için aydınlatma metnini kabul edin.", "error");
      return;
    }
    target.disabled = true;
    try {
      const result = await portalServerRequest("/api/flappy-session", { action: "start", acceptedTerms: true });
      state.cache.flappyStatus = { ...(state.cache.flappyStatus || {}), session: result.session, creditBalance: result.creditBalance };
      flappyBaseCloseModal();
      launchFlappyGame("ranked", result.session);
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "start-approved-flappy") {
    event.preventDefault();
    target.disabled = true;
    try {
      const result = await portalServerRequest("/api/flappy-session", { action: "start", acceptedTerms: true });
      state.cache.flappyStatus = { ...(state.cache.flappyStatus || {}), session: result.session, creditBalance: result.creditBalance };
      launchFlappyGame("ranked", result.session);
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "restart-flappy-practice") {
    event.preventDefault();
    launchFlappyGame("practice");
    return;
  }
  if (action === "retry-flappy-submit") {
    event.preventDefault();
    if (activeFlappyGame) finishRankedFlappy(activeFlappyGame);
    return;
  }
  if (action === "close-flappy-result") {
    event.preventDefault();
    closeModal();
    await loadPage(FLAPPY_PAGE_ID);
    return;
  }
  return flappyBaseHandleClick(event);
};

const flappyBaseHandleFilter = handleFilter;
handleFilter = async function flappyHandleFilter(event) {
  if (event.target.matches("[data-flappy-consent]")) {
    const button = modalRoot.querySelector('[data-action="confirm-ranked-flappy"]');
    if (button) button.disabled = !event.target.checked;
    return;
  }
  return flappyBaseHandleFilter(event);
};
