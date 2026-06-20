import { randomInt } from "node:crypto";
import { verifySnakeRun } from "../src/features/snake-engine.js";

const GAME_KEYS = new Set(["flappy", "snake", "scratch"]);

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

async function authenticate(request) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;
  const token = bearer.slice(7);
  const authResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!authResponse.ok) return null;
  const user = await authResponse.json();
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,roles,status,discipline_points,is_system_account&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active" || profile.is_system_account) return null;
  const roles = [...new Set([...(profile.roles || []), profile.role].filter(Boolean))];
  return { user, profile, roles, isAdmin: roles.includes("super_admin") };
}

async function callRpc(name, body) {
  const result = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  const payload = await result.json().catch(() => null);
  if (!result.ok) {
    const error = new Error(payload?.message || "Oyun islemi tamamlanamadi.");
    error.status = result.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

async function gameSettings() {
  const result = await supabaseRequest("/rest/v1/game_settings?select=*&order=game_key.asc");
  const rows = await result.json().catch(() => []);
  if (!result.ok) throw new Error("Oyun ayarlari alinamadi.");
  return rows;
}

function periodStart() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const anchor = Date.UTC(2026, 0, 1);
  const elapsedDays = Math.floor((date.getTime() - anchor) / 86_400_000);
  const start = new Date(anchor + Math.floor(elapsedDays / 2) * 2 * 86_400_000);
  return start.toISOString().slice(0, 10);
}

async function statusFor(member) {
  const settings = await gameSettings();
  const attemptsResponse = await supabaseRequest(
    `/rest/v1/game_attempts?profile_id=eq.${encodeURIComponent(member.profile.id)}&select=*&order=created_at.desc&limit=12`
  );
  const attempts = await attemptsResponse.json().catch(() => []);
  const result = {
    settings,
    attempts: attemptsResponse.ok ? attempts : [],
    disciplinePoints: Number(member.profile.discipline_points || 0)
  };
  if (member.isAdmin) {
    const since = `${periodStart()}T00:00:00.000Z`;
    const [gameResponse, flappyResponse, profilesResponse] = await Promise.all([
      supabaseRequest(`/rest/v1/game_attempts?created_at=gte.${encodeURIComponent(since)}&select=id,profile_id,game_key,status`),
      supabaseRequest(`/rest/v1/flappy_sessions?started_at=gte.${encodeURIComponent(since)}&select=id,profile_id,status`),
      supabaseRequest("/rest/v1/profiles?status=eq.active&is_system_account=eq.false&select=id,display_name,discipline_points&order=display_name.asc")
    ]);
    const gameRows = await gameResponse.json().catch(() => []);
    const flappyRows = await flappyResponse.json().catch(() => []);
    const profiles = await profilesResponse.json().catch(() => []);
    result.adminStats = {
      flappy: flappyRows.length,
      snake: gameRows.filter((item) => item.game_key === "snake").length,
      scratch: gameRows.filter((item) => item.game_key === "scratch").length
    };
    result.memberStatus = profiles.map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      disciplinePoints: Number(profile.discipline_points || 0),
      flappy: flappyRows.some((item) => item.profile_id === profile.id),
      snake: gameRows.some((item) => item.profile_id === profile.id && item.game_key === "snake"),
      scratch: gameRows.some((item) => item.profile_id === profile.id && item.game_key === "scratch")
    }));
  }
  return result;
}

function integer(value, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Yalnizca POST istegi kabul edilir." });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapilandirmasi eksik." });
  }
  const member = await authenticate(request);
  if (!member) return json(response, 403, { error: "Oyun alani yalnizca aktif uyelere aciktir." });
  const action = request.body?.action || "status";

  try {
    if (action === "status") return json(response, 200, await statusFor(member));

    if (action === "start_snake") {
      if (request.body?.acceptedTerms !== true) return json(response, 400, { error: "Puan kullanim metnini kabul etmelisiniz." });
      const attempt = await callRpc("start_ranked_snake", {
        p_profile_id: member.profile.id,
        p_seed: randomInt(1, 2147483647),
        p_terms_accepted: true
      });
      return json(response, 200, { attempt, ...(await statusFor(member)) });
    }

    if (action === "finish_snake") {
      const attemptId = String(request.body?.attemptId || "");
      const attemptResponse = await supabaseRequest(
        `/rest/v1/game_attempts?id=eq.${encodeURIComponent(attemptId)}&profile_id=eq.${encodeURIComponent(member.profile.id)}&game_key=eq.snake&select=*&limit=1`
      );
      const [attempt] = await attemptResponse.json().catch(() => []);
      if (!attemptResponse.ok || !attempt) return json(response, 404, { error: "Snake oturumu bulunamadi." });
      if (attempt.status !== "active") return json(response, 200, { attempt, alreadyFinished: true, ...(await statusFor(member)) });
      const verified = verifySnakeRun(
        Number(attempt.seed),
        request.body?.directionEvents,
        Number(request.body?.finalTick),
        Number(attempt.target_score)
      );
      if (!verified.valid) return json(response, 400, { error: "Snake oyunu dogrulanamadi." });
      const elapsed = Date.now() - new Date(attempt.started_at).getTime();
      if (elapsed + 2500 < verified.durationMs) return json(response, 400, { error: "Oyun suresi dogrulanamadi." });
      const finished = await callRpc("finish_ranked_snake", {
        p_attempt_id: attempt.id,
        p_profile_id: member.profile.id,
        p_score: verified.score,
        p_event_count: verified.eventCount,
        p_duration_ms: verified.durationMs,
        p_won: verified.won,
        p_outcome: verified.outcome
      });
      return json(response, 200, { attempt: finished, verified, ...(await statusFor(member)) });
    }

    if (action === "play_scratch") {
      if (request.body?.acceptedTerms !== true) return json(response, 400, { error: "Puan kullanim metnini kabul etmelisiniz." });
      const attempt = await callRpc("play_scratch", {
        p_profile_id: member.profile.id,
        p_random_roll: randomInt(0, 10000),
        p_terms_accepted: true
      });
      return json(response, 200, {
        attempt,
        won: attempt.status === "won",
        rewardPoints: Number(attempt.reward_points || 0),
        ...(await statusFor(member))
      });
    }

    if (action === "update_settings") {
      if (!member.isAdmin) return json(response, 403, { error: "Oyun ayarlarini yalnizca Admin degistirebilir." });
      const updates = Array.isArray(request.body?.settings) ? request.body.settings : [];
      if (!updates.length || updates.length > 3) return json(response, 400, { error: "Oyun ayarlari gecersiz." });
      for (const update of updates) {
        const gameKey = String(update.gameKey || "");
        const entryCost = integer(update.entryCost, 0, 100);
        const rewardPoints = integer(update.rewardPoints, 0, 100);
        const probability = gameKey === "scratch" ? integer(update.winProbabilityBasisPoints, 0, 10000) : 0;
        if (!GAME_KEYS.has(gameKey) || entryCost === null || rewardPoints === null || probability === null) {
          return json(response, 400, { error: "Oyun ayarlarindan biri gecersiz." });
        }
        const patch = {
          enabled: Boolean(update.enabled),
          entry_cost: entryCost,
          reward_points: rewardPoints,
          win_probability_basis_points: probability,
          updated_by: member.profile.id
        };
        const updateResponse = await supabaseRequest(`/rest/v1/game_settings?game_key=eq.${encodeURIComponent(gameKey)}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch)
        });
        if (!updateResponse.ok) throw new Error("Oyun ayarlari kaydedilemedi.");
      }
      return json(response, 200, await statusFor(member));
    }

    return json(response, 400, { error: "Bilinmeyen oyun islemi." });
  } catch (error) {
    return json(response, error.status || 400, { error: error.message || "Oyun islemi tamamlanamadi." });
  }
}
