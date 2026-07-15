// Routed through the existing member API to stay within Vercel Hobby function limits.
export const MARKET_INSTRUMENTS = Object.freeze([
  { symbol: "THYAO.IS", code: "THYAO", name: "Türk Hava Yolları" },
  { symbol: "TUPRS.IS", code: "TUPRS", name: "Tüpraş" },
  { symbol: "GARAN.IS", code: "GARAN", name: "Garanti BBVA" },
  { symbol: "ASELS.IS", code: "ASELS", name: "Aselsan" },
  { symbol: "BIMAS.IS", code: "BIMAS", name: "BİM Mağazalar" },
  { symbol: "KCHOL.IS", code: "KCHOL", name: "Koç Holding" }
]);

const MARKET_CACHE_TTL_MS = 60_000;
const MARKET_RANGES = Object.freeze({
  "1d": { yahooRange: "1d", interval: "5m", maxPoints: 150, label: "1 gün" },
  "1w": { yahooRange: "5d", interval: "15m", maxPoints: 170, label: "1 hafta" },
  "1y": { yahooRange: "1y", interval: "1d", maxPoints: 260, label: "1 yıl" }
});
const marketCache = new Map();

function json(response, status, body) {
  response.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
  return response.status(status).json(body);
}

async function authenticate(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return false;
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: authorization
    },
    signal: AbortSignal.timeout(8_000)
  });
  return authResponse.ok;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMarketRange(range = "1w") {
  const key = String(range || "1w").toLowerCase();
  return MARKET_RANGES[key] ? key : "1w";
}

function compactSeries(timestamps = [], closes = [], maxPoints = 96) {
  const points = timestamps
    .map((timestamp, index) => ({
      timestamp: Number(timestamp) * 1000,
      value: finiteNumber(closes[index])
    }))
    .filter((point) => Number.isFinite(point.timestamp) && point.value !== null);

  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const compact = points.filter((_, index) => index % step === 0);
  const last = points.at(-1);
  if (compact.at(-1)?.timestamp !== last?.timestamp) compact.push(last);
  return compact;
}

async function fetchInstrument(instrument, range = "1w") {
  const normalizedRange = normalizeMarketRange(range);
  const rangeOptions = MARKET_RANGES[normalizedRange];
  const cacheKey = `${instrument.symbol}:${normalizedRange}`;
  const cached = marketCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const endpoint = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.symbol)}`
  );
  endpoint.searchParams.set("range", rangeOptions.yahooRange);
  endpoint.searchParams.set("interval", rangeOptions.interval);
  endpoint.searchParams.set("includePrePost", "false");
  endpoint.searchParams.set("events", "div,splits");

  try {
    const upstream = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; IHP-Portal/1.0)"
      },
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await upstream.json().catch(() => null);
    const chart = payload?.chart?.result?.[0];
    if (!upstream.ok || !chart) {
      throw new Error(payload?.chart?.error?.description || "Piyasa verisi alınamadı.");
    }

    const closes = chart.indicators?.quote?.[0]?.close || [];
    const series = compactSeries(chart.timestamp || [], closes, rangeOptions.maxPoints);
    const lastValue = series.at(-1)?.value ?? null;
    const price = finiteNumber(chart.meta?.regularMarketPrice) ?? lastValue;
    const previousClose =
      finiteNumber(chart.meta?.chartPreviousClose)
      ?? finiteNumber(chart.meta?.previousClose)
      ?? series[0]?.value
      ?? price;
    if (price === null) throw new Error("Geçerli fiyat bulunamadı.");

    const change = previousClose ? price - previousClose : 0;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    const values = series.map((point) => point.value);
    const data = {
      ...instrument,
      price,
      previousClose,
      change,
      changePercent,
      high: values.length ? Math.max(...values) : price,
      low: values.length ? Math.min(...values) : price,
      marketState: String(chart.meta?.marketState || "CLOSED"),
      updatedAt: Number(chart.meta?.regularMarketTime || 0) * 1000 || series.at(-1)?.timestamp || Date.now(),
      series,
      range: normalizedRange,
      stale: false
    };
    marketCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + MARKET_CACHE_TTL_MS
    });
    return data;
  } catch (error) {
    if (cached?.data) return { ...cached.data, stale: true };
    throw error;
  }
}

export function isMarketSymbol(symbol) {
  return MARKET_INSTRUMENTS.some((instrument) => instrument.symbol === symbol);
}

export async function getMarketSnapshot(requestedSymbol = MARKET_INSTRUMENTS[0].symbol, requestedRange = "1w") {
  const selectedSymbol = String(requestedSymbol || MARKET_INSTRUMENTS[0].symbol).toUpperCase();
  const range = normalizeMarketRange(requestedRange);
  if (!isMarketSymbol(selectedSymbol)) {
    const error = new Error("Desteklenmeyen piyasa kodu.");
    error.status = 400;
    throw error;
  }

  const results = await Promise.allSettled(MARKET_INSTRUMENTS.map((instrument) => fetchInstrument(instrument, range)));
  const instruments = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const selected = instruments.find((instrument) => instrument.symbol === selectedSymbol);

  if (!selected) {
    const error = new Error("Piyasa verisine şu anda ulaşılamıyor. Kısa süre sonra yeniden deneyin.");
    error.status = 502;
    throw error;
  }

  return {
    unit: "İHP kredi",
    source: "Yahoo Finance",
    refreshSeconds: 60,
    selectedSymbol,
    range,
    rangeLabel: MARKET_RANGES[range].label,
    updatedAt: new Date().toISOString(),
    instruments: instruments.map(({ series, ...instrument }) => instrument),
    series: selected.series
  };
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return json(response, 405, { error: "Yalnızca POST isteği kabul edilir." });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return json(response, 500, { error: "Sunucu yapılandırması eksik." });
  }
  if (!(await authenticate(request))) {
    return json(response, 401, { error: "Geçerli üye oturumu bulunamadı." });
  }

  try {
    return json(response, 200, await getMarketSnapshot(request.body?.symbol, request.body?.range));
  } catch (error) {
    return json(response, error.status || 502, {
      error: error.message || "Piyasa verisine şu anda ulaşılamıyor."
    });
  }
}
