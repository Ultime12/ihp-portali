const IHP_FINANCE_V1 = true;
const FINANCE_PAGE_ID = "finance";

if (!navItems.some(([id]) => id === FINANCE_PAGE_ID)) {
  const creditIndex = navItems.findIndex(([id]) => id === CREDIT_PAGE_ID);
  navItems.splice(creditIndex < 0 ? navItems.length : creditIndex + 1, 0, [
    FINANCE_PAGE_ID,
    "İHP Finans",
    "chart",
    canAccessCreditSystem
  ]);
}

function financeData() {
  return state.cache.financeSystem || {
    creditAccount: null,
    account: null,
    positions: [],
    transactions: [],
    totals: { marketValue: 0, costValue: 0, profit: 0, totalValue: 0 },
    fee: { weeklyRatePercent: 10, consentRequired: true, debt: 0, basis: 0, weeklyEstimate: 0 },
    market: creditMarketData()
  };
}

function financeMarketRange() {
  return financeData().market?.range || creditMarketData().range || "1w";
}

function financeApplyStatus(data) {
  state.cache.financeSystem = data;
  state.cache.creditMarket = data?.market || creditMarketData();
  return data;
}

function financeSelectedInstrument(data = financeData()) {
  const market = data.market || creditMarketData();
  return (market.instruments || []).find((item) => item.symbol === market.selectedSymbol)
    || market.instruments?.[0]
    || null;
}

function financePositionForSymbol(symbol, data = financeData()) {
  return (data.positions || []).find((position) => position.symbol === symbol) || null;
}

function financeSignedAmount(value) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${creditAmount(Math.abs(number))}`;
}

function financeProfitClass(value) {
  const number = Number(value || 0);
  return number > 0 ? "positive" : number < 0 ? "negative" : "neutral";
}

function financeTransactionLabel(kind) {
  return ({
    deposit: "Kredi hesabından yatırım nakdi",
    withdrawal: "Yatırım hesabından krediye aktarım",
    buy: "Piyasa alımı",
    sell: "Piyasa satışı",
    portfolio_fee: "Haftalık portföy kesintisi"
  })[kind] || kind;
}

function financeFeeConsentRequired(data) {
  return Boolean(data.creditAccount) && (!data.account || data.fee?.consentRequired);
}

function financeFeeTermsCard(data) {
  const isExisting = Boolean(data.account);
  return `
    <section class="finance-fee-consent glass">
      <span class="finance-fee-orb">${icon("shield")}</span>
      <div>
        <span class="panel-kicker">Zorunlu finans onayı</span>
        <h3>Haftalık %10 portföy kesintisi</h3>
        <p>İHP Finans portföyüne aktardığınız nakit ve açık pozisyonlarda tuttuğunuz tutarın her 7 günde %10'u sistem kesintisi olarak alınır. Kesinti önce yatırım nakdinden, yetmezse bağlı kredi hesabınızdan düşer; bakiye yetmezse bekleyen kesinti olarak hesabınızda görünür.</p>
        <label class="finance-fee-consent-row">
          <input type="checkbox" data-finance-fee-consent />
          <span>Bu şartı okudum; portföyde tuttuğum tutar için haftalık %10 kesinti uygulanacağını kabul ediyorum.</span>
        </label>
      </div>
      <button class="btn btn-primary" type="button" data-action="finance-open-account" disabled>
        ${isExisting ? "Onayı ver ve finansı aç" : "Onayla ve yatırım hesabını aç"} ${icon("arrow")}
      </button>
    </section>
  `;
}

function financeFeePanel(data) {
  const fee = data.fee || {};
  return `
    <section class="finance-fee-panel glass">
      <div>
        <span class="panel-kicker">Portföy kesintisi</span>
        <h3>Haftalık %${Number(fee.weeklyRatePercent || 10).toLocaleString("tr-TR")}</h3>
        <p>Kesinti portföyde tutulan nakit ve açık pozisyon maliyetine göre otomatik hesaplanır.</p>
      </div>
      <div class="finance-fee-grid">
        <article><span>Tahmini haftalık</span><strong>${creditAmount(fee.weeklyEstimate || 0)}</strong><small>Mevcut portföy bazına göre</small></article>
        <article><span>Sonraki kesinti</span><strong>${fee.nextChargeAt ? formatDate(fee.nextChargeAt, true) : "Takvim bekliyor"}</strong><small>Onay tarihinden itibaren 7 gün</small></article>
        <article class="${Number(fee.debt || 0) > 0 ? "fee-debt" : ""}"><span>Bekleyen kesinti</span><strong>${creditAmount(fee.debt || 0)}</strong><small>${Number(fee.debt || 0) > 0 ? "Bakiye geldiğinde tahsil edilir" : "Borç yok"}</small></article>
      </div>
    </section>
  `;
}

function financePositionsPanel(data) {
  const positions = data.positions || [];
  return `
    <section class="panel glass finance-positions">
      <div class="panel-head">
        <div><span class="panel-kicker">Portföy</span><h3>Açık pozisyonlar</h3></div>
        ${badge(`${positions.length} varlık`, positions.length ? "blue" : "gray")}
      </div>
      ${positions.length ? `
        <div class="finance-position-list">
          ${positions.map((position) => {
            const profit = Number(position.profit || 0);
            return `
              <article class="finance-position-card">
                <div class="finance-position-symbol"><strong>${esc(position.instrument?.code || position.symbol.replace(".IS", ""))}</strong><span>${esc(position.instrument?.name || position.symbol)}</span></div>
                <div><span>Adet</span><strong>${Number(position.quantity).toLocaleString("tr-TR", { maximumFractionDigits: 6 })}</strong></div>
                <div><span>Ortalama</span><strong>${creditMarketNumber(position.average_cost)}</strong></div>
                <div><span>Güncel değer</span><strong>${position.market_value === null ? "Veri bekleniyor" : creditAmount(position.market_value)}</strong></div>
                <div><span>Kâr / zarar</span><strong class="${financeProfitClass(profit)}">${position.profit === null ? "—" : financeSignedAmount(profit)}</strong></div>
                <button class="table-action" type="button" data-action="finance-select-position" data-symbol="${esc(position.symbol)}">İşlem yap</button>
              </article>
            `;
          }).join("")}
        </div>
      ` : emptyCard("Henüz yatırım yok", "İlk alımınızdan sonra pozisyonlar burada görünecek.")}
    </section>
  `;
}

function financeHistoryPanel(data) {
  const rows = data.transactions || [];
  return `
    <section class="panel glass finance-history">
      <div class="panel-head"><div><span class="panel-kicker">Hareketler</span><h3>Finans işlem geçmişi</h3></div>${badge(`${rows.length} kayıt`, "blue")}</div>
      ${rows.length ? `
        <div class="finance-history-list">
          ${rows.map((item) => {
            const incoming = ["deposit", "sell"].includes(item.kind);
            return `
              <article>
                <span class="finance-history-icon ${incoming ? "incoming" : "outgoing"}">${icon(incoming ? "download" : "arrow")}</span>
                <div><strong>${esc(financeTransactionLabel(item.kind))}</strong><small>${item.symbol ? `${esc(item.symbol.replace(".IS", ""))} · ${Number(item.quantity || 0).toLocaleString("tr-TR", { maximumFractionDigits: 6 })} adet` : "Hesaplar arası aktarım"}</small></div>
                <div><strong class="${incoming ? "positive" : "negative"}">${incoming ? "+" : "−"}${creditAmount(item.amount)}</strong><small>${formatDate(item.created_at, true)}</small></div>
              </article>
            `;
          }).join("")}
        </div>
      ` : emptyCard("Finans hareketi yok", "Aktarım ve alım-satım işlemleri burada saklanacak.")}
    </section>
  `;
}

function financeOnboardingPage(data) {
  const hasCredit = Boolean(data.creditAccount);
  return `
    <section class="page-head finance-head">
      <div><span class="eyebrow">İHP Finans</span><h2>Sanal yatırım merkezi.</h2><p>Gerçek para kullanılmaz. Piyasa fiyatları İHP kredi birimiyle izlenir ve işlemler yalnızca portal ekonomisinde geçerlidir.</p></div>
      <span class="finance-virtual-chip">${icon("shield")} Sanal piyasa</span>
    </section>
    <section class="finance-onboarding glass">
      <span class="finance-onboarding-icon">${icon("chart")}</span>
      <div>
        <span class="panel-kicker">Yatırım hesabı</span>
        <h3>${hasCredit ? (data.account ? "Finans onayınız gerekiyor" : "Finans hesabınızı etkinleştirin") : "Önce kredi hesabı gerekli"}</h3>
        <p>${hasCredit
          ? "Yatırım hesabınız kredi hesabınızdan ayrıdır. Finans işlemlerine başlamadan önce portföy kesinti şartını onaylamanız gerekir."
          : "İHP Finans bakiyesi kredi işlemleri üzerinden beslenir. Devam etmek için önce kredi hesabınızı oluşturun."}</p>
      </div>
      ${hasCredit
        ? badge("Onay bekliyor", "gold")
        : `<button class="btn btn-primary" type="button" data-page="credit">Kredi işlemlerine git ${icon("arrow")}</button>`}
    </section>
    ${hasCredit ? financeFeeTermsCard(data) : ""}
    ${creditMarketPanel()}
  `;
}

function financePage() {
  const data = financeData();
  if (!data.account || financeFeeConsentRequired(data)) return financeOnboardingPage(data);

  const selected = financeSelectedInstrument(data);
  const selectedPosition = selected ? financePositionForSymbol(selected.symbol, data) : null;
  const profit = Number(data.totals?.profit || 0);
  return `
    <section class="page-head finance-head">
      <div><span class="eyebrow">İHP Finans</span><h2>Yatırım ve piyasa.</h2><p>Portföyünüz canlı fiyatlarla değerlenir; alım ve satımlar portal kredisiyle gerçekleştirilir.</p></div>
      <span class="finance-virtual-chip">${icon("activity")} Sanal piyasa hesabı</span>
    </section>
    <section class="finance-value-stage">
      <article class="finance-total-card glass">
        <span>Toplam yatırım değeri</span>
        <strong>${Number(data.totals?.totalValue || 0).toLocaleString("tr-TR")}</strong>
        <small>İHP KREDİ</small>
        <div><span>Nakit ${creditAmount(data.account.cash_balance)}</span><span>Portföy ${creditAmount(data.totals?.marketValue)}</span></div>
      </article>
      <div class="finance-value-metrics">
        <article><span>Kredi hesabı</span><strong>${creditAmount(data.creditAccount?.balance)}</strong><small>${esc(data.creditAccount?.account_code || "Hesap yok")}</small></article>
        <article><span>Toplam maliyet</span><strong>${creditAmount(Math.round(data.totals?.costValue || 0))}</strong><small>Açık pozisyonlar</small></article>
        <article><span>Kâr / zarar</span><strong class="${financeProfitClass(profit)}">${financeSignedAmount(profit)}</strong><small>Güncel piyasa değerine göre</small></article>
      </div>
    </section>
    ${financeFeePanel(data)}
    <section class="finance-actions-grid">
      <article class="panel glass finance-transfer-card">
        <div class="panel-head"><div><span class="panel-kicker">Nakit yönetimi</span><h3>Hesaplar arası aktarım</h3></div>${icon("wallet")}</div>
        <label>Aktarılacak kredi<input class="field" type="number" min="1" max="100000000" step="1" data-finance-transfer-amount placeholder="100" /></label>
        <div class="finance-transfer-route"><span>Kredi hesabı</span>${icon("arrow")}<span>Yatırım nakdi</span></div>
        <div class="finance-button-pair">
          <button class="btn btn-primary btn-sm" type="button" data-action="finance-transfer" data-direction="deposit">Yatırıma aktar</button>
          <button class="btn btn-secondary btn-sm" type="button" data-action="finance-transfer" data-direction="withdrawal">Krediye geri çek</button>
        </div>
      </article>
      <article class="panel glass finance-trade-card" id="finance-trade-card">
        <div class="panel-head"><div><span class="panel-kicker">Emir paneli</span><h3>${esc(selected?.code || "Piyasa")} al / sat</h3></div>${selected ? badge(creditMarketPrice(selected.price), Number(selected.change) >= 0 ? "green" : "red") : badge("Veri bekleniyor", "gray")}</div>
        <label>Adet<input class="field" type="number" min="0.001" max="1000000" step="0.001" data-finance-quantity placeholder="1" ${selected ? "" : "disabled"} /></label>
        <div class="finance-trade-preview" data-finance-trade-preview>
          <span>Tahmini işlem tutarı</span><strong>0 kredi</strong><small>Sunucudaki işlem anı fiyatı kesin tutarı belirler.</small>
        </div>
        <div class="finance-button-pair">
          <button class="btn btn-primary btn-sm" type="button" data-action="finance-trade" data-side="buy" ${selected ? "" : "disabled"}>Al</button>
          <button class="btn btn-danger btn-sm" type="button" data-action="finance-trade" data-side="sell" ${selectedPosition ? "" : "disabled"}>Sat${selectedPosition ? ` · ${Number(selectedPosition.quantity).toLocaleString("tr-TR", { maximumFractionDigits: 6 })} adet` : ""}</button>
        </div>
      </article>
    </section>
    ${financePositionsPanel(data)}
    ${creditMarketPanel()}
    ${financeHistoryPanel(data)}
  `;
}

async function loadFinanceStatus(symbol = financeData().market?.selectedSymbol || CREDIT_MARKET_DEFAULT_SYMBOL, range = financeMarketRange()) {
  const data = await portalServerRequest("/api/manage-member", {
    module: "finance",
    action: "status",
    symbol,
    range
  });
  return financeApplyStatus(data);
}

globalThis.__IHP_FINANCE_REFRESH__ = () => loadFinanceStatus(
  financeData().market?.selectedSymbol || CREDIT_MARKET_DEFAULT_SYMBOL,
  financeMarketRange()
);

function financeUpdateTradePreview() {
  const input = document.querySelector("[data-finance-quantity]");
  const preview = document.querySelector("[data-finance-trade-preview]");
  const selected = financeSelectedInstrument();
  if (!input || !preview) return;
  const quantity = Number(input.value || 0);
  const amount = selected && Number.isFinite(quantity) && quantity > 0
    ? Math.ceil(quantity * Number(selected.price || 0))
    : 0;
  preview.querySelector("strong").textContent = creditAmount(amount);
}

function financeRevealChartPoint(chart, clientX, forcedIndex = null) {
  let points = [];
  try {
    points = JSON.parse(decodeURIComponent(chart.dataset.points || ""));
  } catch {
    return;
  }
  if (!points.length) return;
  const track = chart.querySelector(".credit-market-zoom-track");
  const rect = (track || chart).getBoundingClientRect();
  const relative = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)));
  const index = forcedIndex === null
    ? Math.round(relative * (points.length - 1))
    : Math.min(points.length - 1, Math.max(0, forcedIndex));
  const point = points[index];
  const cursor = chart.querySelector("[data-market-cursor]");
  const tooltip = chart.querySelector("[data-market-tooltip]");
  if (!cursor || !tooltip) return;
  cursor.hidden = false;
  cursor.querySelector("line").setAttribute("x1", point.x);
  cursor.querySelector("line").setAttribute("x2", point.x);
  cursor.querySelector("circle").setAttribute("cx", point.x);
  cursor.querySelector("circle").setAttribute("cy", point.y);
  tooltip.hidden = false;
  const shellRect = chart.getBoundingClientRect();
  const shellRelative = Math.min(1, Math.max(0, (clientX - shellRect.left) / Math.max(shellRect.width, 1)));
  tooltip.style.left = `${Math.min(92, Math.max(8, shellRelative * 100))}%`;
  const date = new Date(point.timestamp);
  tooltip.textContent = `${date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })} ${date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} · ${creditMarketPrice(point.value)}`;
  chart.dataset.activePoint = String(index);
}

function financeHideChartPoint(chart) {
  const cursor = chart.querySelector("[data-market-cursor]");
  const tooltip = chart.querySelector("[data-market-tooltip]");
  if (cursor) cursor.hidden = true;
  if (tooltip) tooltip.hidden = true;
}

if (!globalThis.__IHP_FINANCE_CHART_EVENTS__) {
  globalThis.__IHP_FINANCE_CHART_EVENTS__ = true;
  document.addEventListener("pointerdown", (event) => {
    const chart = event.target.closest?.("[data-finance-chart]");
    if (chart) financeRevealChartPoint(chart, event.clientX);
  });
  document.addEventListener("pointermove", (event) => {
    const chart = event.target.closest?.("[data-finance-chart]");
    if (chart && (event.pointerType === "mouse" || event.buttons > 0)) {
      financeRevealChartPoint(chart, event.clientX);
    }
  });
  document.addEventListener("pointerout", (event) => {
    const chart = event.target.closest?.("[data-finance-chart]");
    if (chart && !chart.contains(event.relatedTarget)) financeHideChartPoint(chart);
  });
  document.addEventListener("keydown", (event) => {
    const chart = event.target.closest?.("[data-finance-chart]");
    if (!chart || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const current = Number(chart.dataset.activePoint || 0);
    const next = current + (event.key === "ArrowRight" ? 1 : -1);
    financeRevealChartPoint(chart, chart.getBoundingClientRect().left, next);
  });
}

const financeBaseRenderPortalPage = renderPortalPage;
renderPortalPage = function financeRenderPortalPage(page) {
  if (page === FINANCE_PAGE_ID) return financePage();
  return financeBaseRenderPortalPage(page);
};

const financeBaseLoadPage = loadPage;
loadPage = async function financeLoadPage(page) {
  if (page !== FINANCE_PAGE_ID) return financeBaseLoadPage(page);
  state.loading = true;
  state.pageError = null;
  render();
  try {
    await loadFinanceStatus();
  } catch (error) {
    state.pageError = { page, message: error.message };
  } finally {
    state.loading = false;
    render();
    scheduleCreditMarketRefresh();
  }
};

const financeBaseHandleClick = handleClick;
handleClick = async function financeHandleClick(event) {
  const target = event.target.closest("[data-action]");
  const action = target?.dataset.action;
  if (action === "finance-open-account") {
    event.preventDefault();
    const acceptedPortfolioFee = document.querySelector("[data-finance-fee-consent]")?.checked === true;
    if (!acceptedPortfolioFee) {
      showToast("Haftalık portföy kesintisini onaylamalısınız.", "error");
      return;
    }
    target.disabled = true;
    try {
      financeApplyStatus(await portalServerRequest("/api/manage-member", {
        module: "finance",
        action: "open_account",
        acceptedPortfolioFee,
        symbol: CREDIT_MARKET_DEFAULT_SYMBOL,
        range: financeMarketRange()
      }));
      showToast("Finans onayı kaydedildi.", "success");
      render();
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "finance-transfer") {
    event.preventDefault();
    target.disabled = true;
    try {
      const amount = Number(document.querySelector("[data-finance-transfer-amount]")?.value);
      financeApplyStatus(await portalServerRequest("/api/manage-member", {
        module: "finance",
        action: "transfer",
        direction: target.dataset.direction,
        amount,
        symbol: financeData().market?.selectedSymbol,
        range: financeMarketRange()
      }));
      showToast(target.dataset.direction === "deposit" ? "Kredi yatırım hesabına aktarıldı." : "Yatırım nakdi kredi hesabına aktarıldı.", "success");
      render();
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "finance-trade") {
    event.preventDefault();
    target.disabled = true;
    try {
      const selected = financeSelectedInstrument();
      const quantity = Number(document.querySelector("[data-finance-quantity]")?.value);
      financeApplyStatus(await portalServerRequest("/api/manage-member", {
        module: "finance",
        action: "trade",
        side: target.dataset.side,
        symbol: selected?.symbol,
        quantity,
        range: financeMarketRange()
      }));
      showToast(target.dataset.side === "buy" ? "Sanal alım tamamlandı." : "Sanal satış tamamlandı.", "success");
      render();
      scheduleCreditMarketRefresh();
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "credit-market-range") {
    event.preventDefault();
    target.disabled = true;
    try {
      await loadFinanceStatus(financeData().market?.selectedSymbol || CREDIT_MARKET_DEFAULT_SYMBOL, target.dataset.range || "1w");
      render();
      scheduleCreditMarketRefresh();
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "credit-market-symbol" || action === "credit-market-refresh") {
    event.preventDefault();
    target.disabled = true;
    try {
      const symbol = action === "credit-market-symbol"
        ? target.dataset.symbol
        : financeData().market?.selectedSymbol;
      await loadFinanceStatus(symbol, financeMarketRange());
      render();
      scheduleCreditMarketRefresh();
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  if (action === "finance-select-position") {
    event.preventDefault();
    target.disabled = true;
    try {
      await loadFinanceStatus(target.dataset.symbol, financeMarketRange());
      render();
      document.querySelector("#finance-trade-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      showToast(error.message, "error");
      target.disabled = false;
    }
    return;
  }
  return financeBaseHandleClick(event);
};

const financeBaseHandleFilter = handleFilter;
handleFilter = async function financeHandleFilter(event) {
  if (event.target.matches("[data-finance-fee-consent]")) {
    const button = document.querySelector('[data-action="finance-open-account"]');
    if (button) button.disabled = event.target.checked !== true;
    return;
  }
  if (event.target.matches("[data-finance-quantity]")) {
    financeUpdateTradePreview();
    return;
  }
  return financeBaseHandleFilter(event);
};
