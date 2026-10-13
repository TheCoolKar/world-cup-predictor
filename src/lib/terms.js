import { supabase } from "./supabase";
import { getAnonymousId } from "./clientIdentity";

export const TERMS_VERSION = "v2";
export const TERMS_STORAGE_KEY = `wc2026-disclaimer-${TERMS_VERSION}`;

export function hasAcceptedDisclaimer() {
  try { return localStorage.getItem(TERMS_STORAGE_KEY) === "accepted"; }
  catch { return false; }
}

export function persistAcceptance() {
  try { localStorage.setItem(TERMS_STORAGE_KEY, "accepted"); }
  catch { /* Storage may be blocked. */ }
}

function recordedKey(userId, anonymousId) {
  return `wc2026-terms-recorded-${TERMS_VERSION}-${userId ?? anonymousId}`;
}

/**
 * Records an acceptance at most once per account/version. Anonymous visitors
 * are de-duplicated by a random browser id; signing in creates the single
 * account-linked acceptance required for the audit log.
 */
export async function recordTermsAcceptance(knownUser = undefined) {
  let user = knownUser;
  if (user === undefined) {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  }

  const anonymousId = getAnonymousId();
  const marker = recordedKey(user?.id ?? null, anonymousId);
  try {
    if (localStorage.getItem(marker) === "recorded") return { recorded: false, duplicate: true };
  } catch { /* The database constraint remains the source of truth. */ }

  const { error } = await supabase.from("terms_acceptances").insert({
    user_id:      user?.id ?? null,
    email:        user?.email ?? null,
    anonymous_id: anonymousId,
    version:      TERMS_VERSION,
    user_agent:   navigator.userAgent,
  });

  if (error && error.code !== "23505") throw error;

  try { localStorage.setItem(marker, "recorded"); }
  catch { /* De-duplication is still enforced by Postgres. */ }
  return { recorded: !error, duplicate: Boolean(error) };
}
