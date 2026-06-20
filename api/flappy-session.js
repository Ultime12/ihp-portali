import { randomInt } from "node:crypto";
import { FLAPPY_CONFIG, verifyFlappyRun } from "../src/features/flappy-engine.js";
import gameCenterHandler from "../server/game-center.js";

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function authenticateMember(request) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;
  const token = bearer.slice(7);
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    }
  });
  if (!authResponse.ok) return null;

  const authUser = await authResponse.json();
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,status,discipline_points,is_system_account&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active" || profile.is_system_account) return null;
  return { authUser, profile };
}

function istanbulPeriodStart(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const anchor = Date.UTC(2026, 0, 1);
  const elapsedDays = Math.floor((date.getTime() - anchor) / 86_400_000);
  const periodStart = new Date(anchor + Math.floor(elapsedDays / 2) * 2 * 86_400_000);
  return periodStart.toISOString().slice(0, 10);
}

async function freshPoints(profileId) {
  const response = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}&select=discipline_points&limit=1`
  );
  const [profile] = await response.json().catch(() => []);
  return Number(profile?.discipline_points ?? 0);
}

async function currentSession(profileId) {
  const weekStart = istanbulPeriodStart();
  const response = await supabaseRequest(
    `/rest/v1/flappy_sessions?profile_id=eq.${encodeURIComponent(profileId)}&week_start=eq.${weekStart}&select=*&limit=1`
  );
  const [session] = await response.json().catch(() => []);
  if (!response.ok) throw new Error("Iki gunluk oyun durumu alinamadi.");

  if (session?.status === "active" && new Date(session.expires_at).getTime() < Date.now()) {
    const expireResponse = await supabaseRequest(
      `/rest/v1/flappy_sessions?id=eq.${encodeURIComponent(session.id)}&status=eq.active`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "expired", finished_at: new Date().toISOString() })
      }
    );
    const [expired] = await expireResponse.json().catch(() => []);
    return expired || { ...session, status: "expired" };
  }
  return session || null;
}

async function flappySettings() {
  const response = await supabaseRequest(
    "/rest/v1/game_settings?game_key=eq.flappy&select=*&limit=1"
  );
  const [settings] = await response.json().catch(() => []);
  if (!response.ok || !settings) throw new Error("Flappy ayarlari alinamadi.");
  return settings;
}

async function callRpc(name, body) {
  const rpcResponse = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const payload = await rpcResponse.json().catch(() => null);
  if (!rpcResponse.ok) {
    const error = new Error(payload?.message || "Oyun islemi tamamlanamadi.");
    error.status = rpcResponse.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

export default async function handler(request, response) {
  if (request.method === "POST" && request.body?.module === "game_center") {
    return gameCenterHandler(request, response);
  }
  if (request.method !== "POST") return json(response, 405, { error: "Yalnizca POST istegi kabul edilir." });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapilandirmasi eksik." });
  }

  const member = await authenticateMember(request);
  if (!member) return json(response, 403, { error: "Oyun alani yalnizca aktif uyelere aciktir." });
  const action = request.body?.action || "status";

  try {
    if (action === "status") {
      const settings = await flappySettings();
      return json(response, 200, {
        session: await currentSession(member.profile.id),
        disciplinePoints: await freshPoints(member.profile.id),
        config: {
          enabled: settings.enabled,
          entryCost: settings.entry_cost,
          reward: settings.reward_points,
          targetScore: FLAPPY_CONFIG.targetScore,
          scorePerPipe: FLAPPY_CONFIG.scorePerPipe
        }
      });
    }

    if (action === "start") {
      if (request.body?.acceptedTerms !== true) {
        return json(response, 400, { error: "Puanin iade edilmeyecegine dair metni kabul etmelisiniz." });
      }
      const existing = await currentSession(member.profile.id);
      if (existing) return json(response, 409, { error: "Bu haftaki puanli oyun hakkiniz kullanildi." });
      const settings = await flappySettings();
      if (!settings.enabled) return json(response, 409, { error: "IHP Flappy su anda Admin tarafindan kapatildi." });

      const session = await callRpc("start_weekly_flappy", {
        p_profile_id: member.profile.id,
        p_seed: randomInt(1, 2147483647),
        p_terms_accepted: true
      });
      return json(response, 200, {
        session,
        disciplinePoints: await freshPoints(member.profile.id)
      });
    }

    if (action === "finish") {
      const sessionId = String(request.body?.sessionId || "");
      const sessionResponse = await supabaseRequest(
        `/rest/v1/flappy_sessions?id=eq.${encodeURIComponent(sessionId)}&profile_id=eq.${encodeURIComponent(member.profile.id)}&select=*&limit=1`
      );
      const [session] = await sessionResponse.json().catch(() => []);
      if (!sessionResponse.ok || !session) return json(response, 404, { error: "Oyun oturumu bulunamadi." });
      if (session.status !== "active") {
        return json(response, 200, {
          session,
          disciplinePoints: await freshPoints(member.profile.id),
          alreadyFinished: true
        });
      }
      if (new Date(session.expires_at).getTime() < Date.now()) {
        await currentSession(member.profile.id);
        return json(response, 410, { error: "Oyun oturumunun suresi doldu." });
      }

      const durationMs = Number(request.body?.durationMs);
      const elapsedMs = Date.now() - new Date(session.started_at).getTime();
      if (!Number.isFinite(durationMs) || durationMs > elapsedMs + 3000) {
        return json(response, 400, { error: "Oyun suresi dogrulanamadi." });
      }

      const verified = verifyFlappyRun(session.seed, request.body?.flapTimes, durationMs);
      if (!verified.valid) return json(response, 400, { error: "Oyun sonucu dogrulanamadi." });

      const finished = await callRpc("finish_weekly_flappy", {
        p_session_id: session.id,
        p_profile_id: member.profile.id,
        p_score: verified.score,
        p_pipes_passed: verified.pipesPassed,
        p_flap_count: verified.flapCount,
        p_duration_ms: verified.durationMs,
        p_won: verified.won
      });
      return json(response, 200, {
        session: finished,
        verified,
        disciplinePoints: await freshPoints(member.profile.id)
      });
    }

    return json(response, 400, { error: "Gecersiz oyun islemi." });
  } catch (error) {
    const status = /daha once|kullanildi/i.test(error.message) ? 409 : (error.status >= 400 && error.status < 500 ? error.status : 400);
    return json(response, status, { error: error.message || "Oyun islemi tamamlanamadi." });
  }
}
