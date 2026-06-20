import { createHash, randomInt } from "node:crypto";

const ROLE_KEYS = new Set([
  "super_admin", "president", "vice_president", "presidential_aide", "spokesperson",
  "discipline_chair", "discipline_vice_chair", "discipline_member", "youth_chair",
  "youth_member", "chief_representative", "representative", "member"
]);

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
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) return null;
  const token = bearer.slice(7);
  const userResponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,roles,status,is_system_account,credit_test_access&limit=1`
  );
  const [profile] = await profileResponse.json().catch(() => []);
  if (!profile || profile.status !== "active" || (profile.is_system_account && !profile.credit_test_access)) return null;
  const roles = [...new Set([...(profile.roles || []), profile.role].filter(Boolean))];
  return {
    user,
    profile,
    roles,
    isAdmin: roles.includes("super_admin"),
    isCreditTester: Boolean(profile.credit_test_access)
  };
}

async function rpc(name, body) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || "Kredi islemi tamamlanamadi.");
    error.status = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

async function rows(path, errorMessage) {
  const response = await supabaseRequest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) throw new Error(errorMessage);
  return payload;
}

async function adminStatus() {
  const [settingsRows, accounts, profiles, loans, installments, transactions, cheques] = await Promise.all([
    rows("/rest/v1/credit_settings?id=eq.main&select=*&limit=1", "Kredi ayarlari alinamadi."),
    rows("/rest/v1/credit_accounts?select=*&order=opened_at.desc", "Kredi hesaplari alinamadi."),
    rows("/rest/v1/profiles?or=(is_system_account.eq.false,credit_test_access.eq.true)&select=id,display_name,email,member_code,status,role,roles,credit_test_access&order=display_name.asc", "Uyeler alinamadi."),
    rows("/rest/v1/credit_loans?select=*&order=requested_at.desc&limit=150", "Kredi basvurulari alinamadi."),
    rows("/rest/v1/credit_installments?select=*&order=due_at.asc&limit=300", "Taksitler alinamadi."),
    rows("/rest/v1/credit_transactions?select=*&order=created_at.desc&limit=250", "Islem kayitlari alinamadi."),
    rows("/rest/v1/credit_cheques?select=id,issuer_account_id,code_last4,amount,status,redeemed_by_account_id,issued_at,redeemed_at&order=issued_at.desc&limit=150", "Cekler alinamadi.")
  ]);
  return { settings: settingsRows[0] || null, accounts, profiles, loans, installments, transactions, cheques };
}

async function memberStatus(profileId) {
  const [settingsRows, accountRows] = await Promise.all([
    rows("/rest/v1/credit_settings?id=eq.main&select=member_access_enabled,transfer_tax_basis_points,loan_interest_basis_points,max_loan_amount,max_term_days,grace_days&limit=1", "Kredi ayarlari alinamadi."),
    rows(`/rest/v1/credit_accounts?profile_id=eq.${encodeURIComponent(profileId)}&select=*&limit=1`, "Kredi hesabi alinamadi.")
  ]);
  const account = accountRows[0] || null;
  if (!account) return { settings: settingsRows[0] || null, account: null, transactions: [], cheques: [], loans: [], installments: [] };
  const [transactions, cheques, loans] = await Promise.all([
    rows(`/rest/v1/credit_transactions?account_id=eq.${encodeURIComponent(account.id)}&select=*&order=created_at.desc&limit=100`, "Hesap hareketleri alinamadi."),
    rows(`/rest/v1/credit_cheques?or=(issuer_account_id.eq.${account.id},redeemed_by_account_id.eq.${account.id})&select=id,issuer_account_id,code_last4,amount,status,redeemed_by_account_id,issued_at,redeemed_at&order=issued_at.desc&limit=50`, "Cekler alinamadi."),
    rows(`/rest/v1/credit_loans?account_id=eq.${encodeURIComponent(account.id)}&select=*&order=requested_at.desc&limit=50`, "Kredi basvurulari alinamadi.")
  ]);
  const loanIds = loans.map((loan) => loan.id);
  const installments = loanIds.length
    ? await rows(`/rest/v1/credit_installments?loan_id=in.(${loanIds.join(",")})&select=*&order=due_at.asc`, "Taksitler alinamadi.")
    : [];
  return { settings: settingsRows[0] || null, account, transactions, cheques, loans, installments };
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function chequeHash(code) {
  return createHash("sha256").update(code).digest("hex");
}

async function openAccount(profileId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `IHP${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
    try {
      return await rpc("open_credit_account", { p_profile_id: profileId, p_account_code: code });
    } catch (error) {
      if (!/unique|duplicate/i.test(error.message)) throw error;
    }
  }
  throw new Error("Benzersiz hesap numarasi olusturulamadi.");
}

export default async function handler(request, response) {
  if (request.method === "GET") {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.authorization !== `Bearer ${secret}`) {
      return json(response, 401, { error: "Cron yetkisi gecersiz." });
    }
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const cronResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/process_credit_schedules`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: "{}"
    });
    const cronPayload = await cronResponse.json().catch(() => null);
    if (!cronResponse.ok) return json(response, 500, { error: cronPayload?.message || "Otomatik kredi islemleri tamamlanamadi." });
    return json(response, 200, cronPayload || { ok: true });
  }
  if (request.method !== "POST") return json(response, 405, { error: "Yalnizca POST veya cron GET istegi kabul edilir." });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(response, 500, { error: "Sunucu yapilandirmasi eksik." });
  }
  const actor = await authenticate(request);
  if (!actor) return json(response, 403, { error: "Aktif uye oturumu gerekir." });
  const action = request.body?.action || "status";

  try {
    if (!actor.isAdmin && !actor.isCreditTester) {
      return json(response, 403, { error: "Kredi sistemi yalnizca yetkili deneme hesaplarina aciktir." });
    }

    if (action === "admin_status") {
      if (!actor.isAdmin) return json(response, 403, { error: "Kredi paneli su anda yalnizca Admin'e aciktir." });
      return json(response, 200, await adminStatus());
    }

    if (action === "member_status") {
      return json(response, 200, await memberStatus(actor.profile.id));
    }

    if (action === "update_settings") {
      if (!actor.isAdmin) return json(response, 403, { error: "Admin yetkisi gerekir." });
      const transferTax = boundedInteger(request.body?.transferTaxBasisPoints, 0, 5000);
      const interest = boundedInteger(request.body?.loanInterestBasisPoints, 0, 10000);
      const maxLoan = boundedInteger(request.body?.maxLoanAmount, 1, 1_000_000);
      const maxTerm = boundedInteger(request.body?.maxTermDays, 1, 30);
      const grace = boundedInteger(request.body?.graceDays, 0, 7);
      const allowances = request.body?.roleAllowances || {};
      if ([transferTax, interest, maxLoan, maxTerm, grace].includes(null) || typeof allowances !== "object") {
        return json(response, 400, { error: "Kredi ayarlari gecersiz." });
      }
      const roleAllowances = {};
      for (const role of ROLE_KEYS) {
        const amount = boundedInteger(allowances[role] ?? 0, 0, 1_000_000);
        if (amount === null) return json(response, 400, { error: "Haftalik rutbe odemelerinden biri gecersiz." });
        roleAllowances[role] = amount;
      }
      const update = await supabaseRequest("/rest/v1/credit_settings?id=eq.main", {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          member_access_enabled: true,
          weekly_allowance_enabled: Boolean(request.body?.weeklyAllowanceEnabled),
          transfer_tax_basis_points: transferTax,
          loan_interest_basis_points: interest,
          max_loan_amount: maxLoan,
          max_term_days: maxTerm,
          grace_days: grace,
          role_allowances: roleAllowances,
          updated_by: actor.profile.id
        })
      });
      if (!update.ok) throw new Error("Kredi ayarlari kaydedilemedi.");
      return json(response, 200, await adminStatus());
    }

    if (action === "review_loan") {
      if (!actor.isAdmin) return json(response, 403, { error: "Admin yetkisi gerekir." });
      const decision = String(request.body?.decision || "");
      if (!["approved", "rejected"].includes(decision)) return json(response, 400, { error: "Kredi karari gecersiz." });
      await rpc("review_credit_loan", {
        p_admin_profile_id: actor.profile.id,
        p_loan_id: String(request.body?.loanId || ""),
        p_decision: decision,
        p_note: String(request.body?.note || "").slice(0, 600)
      });
      return json(response, 200, await adminStatus());
    }

    if (action === "report") {
      if (!actor.isAdmin) return json(response, 403, { error: "Admin yetkisi gerekir." });
      const hours = request.body?.range === "7d" ? 168 : 24;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const data = await adminStatus();
      data.transactions = data.transactions.filter((item) => new Date(item.created_at) >= new Date(since));
      return json(response, 200, { range: hours === 168 ? "7d" : "24h", generatedAt: new Date().toISOString(), ...data });
    }

    if (action === "open_account") {
      const result = await openAccount(actor.profile.id);
      return json(response, 200, { result, ...(await memberStatus(actor.profile.id)) });
    }
    if (action === "close_account") {
      const result = await rpc("close_credit_account", { p_profile_id: actor.profile.id });
      return json(response, 200, { result, ...(await memberStatus(actor.profile.id)) });
    }
    if (action === "transfer") {
      const result = await rpc("credit_transfer", {
        p_profile_id: actor.profile.id,
        p_recipient_code: String(request.body?.recipientCode || ""),
        p_amount: Number(request.body?.amount)
      });
      return json(response, 200, { result, ...(await memberStatus(actor.profile.id)) });
    }
    if (action === "issue_cheque") {
      const code = Array.from({ length: 24 }, () => randomInt(0, 10)).join("");
      const cheque = await rpc("issue_credit_cheque", {
        p_profile_id: actor.profile.id,
        p_code_hash: chequeHash(code),
        p_code_last4: code.slice(-4),
        p_amount: Number(request.body?.amount)
      });
      return json(response, 200, { cheque, code, ...(await memberStatus(actor.profile.id)) });
    }
    if (action === "redeem_cheque") {
      const code = String(request.body?.code || "").replace(/\D/g, "");
      if (code.length !== 24) return json(response, 400, { error: "Cek kodu 24 haneli olmalidir." });
      const cheque = await rpc("redeem_credit_cheque", {
        p_profile_id: actor.profile.id, p_code_hash: chequeHash(code)
      });
      return json(response, 200, { cheque, ...(await memberStatus(actor.profile.id)) });
    }
    if (action === "request_loan") {
      const loan = await rpc("request_credit_loan", {
        p_profile_id: actor.profile.id,
        p_amount: Number(request.body?.amount),
        p_term_days: Number(request.body?.termDays),
        p_installment_count: Number(request.body?.installmentCount)
      });
      return json(response, 200, { loan, ...(await memberStatus(actor.profile.id)) });
    }
    if (action === "pay_installment") {
      const installment = await rpc("pay_credit_installment", {
        p_profile_id: actor.profile.id, p_installment_id: String(request.body?.installmentId || "")
      });
      return json(response, 200, { installment, ...(await memberStatus(actor.profile.id)) });
    }

    return json(response, 400, { error: "Bilinmeyen kredi islemi." });
  } catch (error) {
    return json(response, error.status || 400, { error: error.message || "Kredi islemi tamamlanamadi." });
  }
}
