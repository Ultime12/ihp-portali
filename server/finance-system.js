import { getMarketSnapshot, isMarketSymbol } from "./market-data.js";

const MAX_FINANCE_TRANSFER = 100_000_000;
const MAX_TRADE_QUANTITY = 1_000_000;
const PORTFOLIO_FEE_BASIS_POINTS = 1000;
const PORTFOLIO_FEE_RATE = PORTFOLIO_FEE_BASIS_POINTS / 10000;

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function authenticate(request) {
  const bearer = String(request.headers.authorization || "");
  if (!bearer.startsWith("Bearer ")) return null;
  const userResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: bearer
    }
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,status,is_system_account&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active" || profile.is_system_account) return null;
  return { user, profile };
}

async function rows(path, errorMessage) {
  const response = await supabaseRequest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(payload?.message || errorMessage);
  return payload;
}

async function rpc(name, body) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || "Finans işlemi tamamlanamadı.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

function financeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_FINANCE_TRANSFER
    ? number
    : null;
}

function tradeQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.001 && number <= MAX_TRADE_QUANTITY
    ? Math.round(number * 1_000_000) / 1_000_000
    : null;
}

function nextWeeklyDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function financeFeeInfo(account, costValue, lastApplication = null) {
  if (!account) {
    return {
      rateBasisPoints: PORTFOLIO_FEE_BASIS_POINTS,
      weeklyRatePercent: 10,
      consentRequired: true,
      consentedAt: null,
      lastChargedAt: null,
      nextChargeAt: null,
      debt: 0,
      basis: 0,
      weeklyEstimate: 0,
      lastApplication
    };
  }
  const basis = Math.max(0, Number(account.cash_balance || 0) + Math.ceil(Number(costValue || 0)));
  const lastChargedAt = account.portfolio_fee_last_charged_at || account.portfolio_fee_consent_at || null;
  return {
    rateBasisPoints: PORTFOLIO_FEE_BASIS_POINTS,
    weeklyRatePercent: 10,
    consentRequired: !account.portfolio_fee_consent_at,
    consentedAt: account.portfolio_fee_consent_at || null,
    lastChargedAt,
    nextChargeAt: nextWeeklyDate(lastChargedAt),
    debt: Number(account.portfolio_fee_debt || 0),
    basis,
    weeklyEstimate: Math.ceil(basis * PORTFOLIO_FEE_RATE),
    lastApplication
  };
}

async function requireFinanceTerms(profileId) {
  const [account] = await rows(
    `/rest/v1/finance_accounts?profile_id=eq.${encodeURIComponent(profileId)}&select=id,portfolio_fee_consent_at&limit=1`,
    "Yatırım hesabı alınamadı."
  );
  if (!account) {
    const error = new Error("Önce İHP Finans hesabınızı açmalısınız.");
    error.status = 403;
    throw error;
  }
  if (!account.portfolio_fee_consent_at) {
    const error = new Error("Portföy kesinti onayı verilmeden finans işlemi yapılamaz.");
    error.status = 403;
    throw error;
  }
  return rpc("apply_finance_portfolio_fee", { p_profile_id: profileId });
}

async function financeStatus(profileId, requestedSymbol, requestedRange = "1w") {
  const marketPromise = getMarketSnapshot(requestedSymbol, requestedRange).catch((error) => ({
    selectedSymbol: String(requestedSymbol || "THYAO.IS").toUpperCase(),
    range: String(requestedRange || "1w").toLowerCase(),
    instruments: [],
    series: [],
    refreshSeconds: 60,
    source: "Piyasa veri servisi",
    error: error.message
  }));
  let [creditRows, accountRows, market] = await Promise.all([
    rows(
      `/rest/v1/credit_accounts?profile_id=eq.${encodeURIComponent(profileId)}&status=eq.active&select=id,account_code,balance,status&limit=1`,
      "Kredi hesabı alınamadı."
    ),
    rows(
      `/rest/v1/finance_accounts?profile_id=eq.${encodeURIComponent(profileId)}&select=*&limit=1`,
      "Yatırım hesabı alınamadı."
    ),
    marketPromise
  ]);
  let creditAccount = creditRows[0] || null;
  let account = accountRows[0] || null;
  let feeApplication = null;
  if (account?.portfolio_fee_consent_at) {
    feeApplication = await rpc("apply_finance_portfolio_fee", { p_profile_id: profileId });
    [creditRows, accountRows] = await Promise.all([
      rows(
        `/rest/v1/credit_accounts?profile_id=eq.${encodeURIComponent(profileId)}&status=eq.active&select=id,account_code,balance,status&limit=1`,
        "Kredi hesabı alınamadı."
      ),
      rows(
        `/rest/v1/finance_accounts?profile_id=eq.${encodeURIComponent(profileId)}&select=*&limit=1`,
        "Yatırım hesabı alınamadı."
      )
    ]);
    creditAccount = creditRows[0] || null;
    account = accountRows[0] || null;
  }
  if (!account) {
    return {
      creditAccount,
      account: null,
      positions: [],
      transactions: [],
      totals: { marketValue: 0, costValue: 0, profit: 0, totalValue: 0 },
      fee: {
        rateBasisPoints: PORTFOLIO_FEE_BASIS_POINTS,
        weeklyRatePercent: 10,
        consentRequired: Boolean(creditAccount),
        consentedAt: null,
        lastChargedAt: null,
        nextChargeAt: null,
        debt: 0,
        basis: 0,
        weeklyEstimate: 0,
        lastApplication: null
      },
      market
    };
  }

  const [positions, transactions] = await Promise.all([
    rows(
      `/rest/v1/finance_positions?finance_account_id=eq.${encodeURIComponent(account.id)}&select=*&order=updated_at.desc`,
      "Yatırım pozisyonları alınamadı."
    ),
    rows(
      `/rest/v1/finance_transactions?finance_account_id=eq.${encodeURIComponent(account.id)}&select=*&order=created_at.desc&limit=100`,
      "Finans işlem geçmişi alınamadı."
    )
  ]);
  const instrumentBySymbol = new Map((market.instruments || []).map((item) => [item.symbol, item]));
  const enrichedPositions = positions.map((position) => {
    const instrument = instrumentBySymbol.get(position.symbol) || null;
    const quantity = Number(position.quantity || 0);
    const averageCost = Number(position.average_cost || 0);
    const currentPrice = Number(instrument?.price || 0);
    const marketValue = currentPrice ? Math.floor(quantity * currentPrice) : null;
    const costValue = quantity * averageCost;
    return {
      ...position,
      quantity,
      average_cost: averageCost,
      instrument,
      current_price: currentPrice || null,
      market_value: marketValue,
      cost_value: costValue,
      profit: marketValue === null ? null : marketValue - costValue
    };
  });
  const marketValue = enrichedPositions.reduce(
    (sum, position) => sum + Number(position.market_value || 0),
    0
  );
  const costValue = enrichedPositions.reduce(
    (sum, position) => sum + Number(position.cost_value || 0),
    0
  );

  return {
    creditAccount,
    account,
    positions: enrichedPositions,
    transactions,
    totals: {
      marketValue,
      costValue,
      profit: marketValue - costValue,
      totalValue: Number(account.cash_balance || 0) + marketValue
    },
    fee: financeFeeInfo(account, costValue, feeApplication),
    market
  };
}

export default async function financeSystemHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Yalnızca POST isteği kabul edilir." });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapılandırması eksik." });
  }

  const actor = await authenticate(request);
  if (!actor) return json(response, 401, { error: "Geçerli üye oturumu bulunamadı." });
  const action = String(request.body?.action || "status");
  const symbol = String(request.body?.symbol || "THYAO.IS").toUpperCase();
  const range = String(request.body?.range || "1w").toLowerCase();

  try {
    if (action === "status") {
      return json(response, 200, await financeStatus(actor.profile.id, symbol, range));
    }
    if (action === "open_account" || action === "accept_terms") {
      if (request.body?.acceptedPortfolioFee !== true) {
        return json(response, 400, { error: "Haftalık %10 portföy kesintisi onaylanmadan İHP Finans kullanılamaz." });
      }
      await rpc("accept_finance_portfolio_terms", { p_profile_id: actor.profile.id });
      return json(response, 200, await financeStatus(actor.profile.id, symbol, range));
    }
    if (action === "transfer") {
      const amount = financeInteger(request.body?.amount);
      const direction = String(request.body?.direction || "");
      if (amount === null || !["deposit", "withdrawal"].includes(direction)) {
        return json(response, 400, { error: "Aktarım bilgileri geçersiz." });
      }
      await requireFinanceTerms(actor.profile.id);
      await rpc("transfer_finance_credit", {
        p_profile_id: actor.profile.id,
        p_amount: amount,
        p_direction: direction
      });
      return json(response, 200, await financeStatus(actor.profile.id, symbol, range));
    }
    if (action === "trade") {
      const side = String(request.body?.side || "");
      const quantity = tradeQuantity(request.body?.quantity);
      if (!isMarketSymbol(symbol) || !["buy", "sell"].includes(side) || quantity === null) {
        return json(response, 400, { error: "Alım-satım bilgileri geçersiz." });
      }
      await requireFinanceTerms(actor.profile.id);
      const market = await getMarketSnapshot(symbol, range);
      const instrument = market.instruments.find((item) => item.symbol === symbol);
      if (!instrument?.price) {
        return json(response, 502, { error: "İşlem fiyatı şu anda alınamıyor." });
      }
      const trade = await rpc("execute_finance_trade", {
        p_profile_id: actor.profile.id,
        p_symbol: symbol,
        p_quantity: quantity,
        p_unit_price: Number(instrument.price),
        p_side: side
      });
      return json(response, 200, {
        trade,
        ...(await financeStatus(actor.profile.id, symbol, range))
      });
    }
    return json(response, 400, { error: "Bilinmeyen finans işlemi." });
  } catch (error) {
    return json(response, error.status || 400, {
      error: error.message || "Finans işlemi tamamlanamadı."
    });
  }
}
