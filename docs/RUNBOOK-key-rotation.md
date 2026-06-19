# Runbook — Secret & key rotation

Operational guide for rotating every credential the project uses. Rotation
matters because secrets leak (a committed `.env`, a screenshot, an ex-collaborator)
and because regular rotation limits the blast radius if one already has.

> **Cadence:** rotate the service-role key and `CRON_SECRET` every ~90 days, and
> **immediately** on any suspected exposure. The anon key only needs rotating if
> compromised (it's public by design). Track the last-rotated date per secret.

## Inventory — what exists and where it lives

| Secret | Where it's stored | Exposure if leaked |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env`, Vercel env, frontend bundle | None — not secret |
| `VITE_SUPABASE_ANON_KEY` | `.env`, Vercel env, frontend bundle | Low — public by design; RLS is the real guard |
| `SUPABASE_SERVICE_ROLE_KEY` | local `.env`, edge-function env (auto), CI secrets | **Critical** — bypasses RLS, full DB access |
| `CRON_SECRET` | edge-function secret **and** Vault (`live_feed_cron_secret`) | Medium — lets someone trigger the live-feed poll |
| `VITE_API_FOOTBALL_KEY` | `.env` (if used) | Low/Medium — quota theft |
| Google OAuth client secret | Supabase Auth provider config | High — impersonate the OAuth app |

The **FotMob** and **Polymarket** sources use no key.

---

## 1. Supabase anon key
Public, so rotate only if you need to invalidate it (rare). Rotating it forces
re-issuing the key everywhere it's embedded.

1. Supabase Dashboard → **Settings → API → Project API keys → roll `anon`**.
2. Update `VITE_SUPABASE_ANON_KEY` in: local `.env`, **Vercel → Settings → Environment Variables**, and any load-test invocation.
3. Redeploy the site (Vercel) so the new key ships in the bundle.
4. Verify: load the site signed-out; Schedule/Teams data loads.

## 2. Supabase service-role key — CRITICAL
Bypasses RLS. Used by the edge functions (auto-injected, so no manual update
there) and by local scripts / any CI that writes.

1. Dashboard → **Settings → API → roll `service_role`**.
2. Edge functions: **no action** — Supabase injects `SUPABASE_SERVICE_ROLE_KEY`
   automatically; it updates on the next invocation.
3. Update anywhere you set it manually:
   - local `.env` → `SUPABASE_SERVICE_KEY=...`
   - any GitHub Actions secret named `SUPABASE_SERVICE_KEY` (Settings → Secrets → Actions)
4. Verify: run `node scripts/fetchResults.js` (or trigger the live-feed function)
   and confirm a successful write; check `net._http_response` for `200`s.
5. **On confirmed leak:** roll immediately, then audit `auth.audit_log_entries`
   and recent row changes for anything unexpected.

## 3. CRON_SECRET (live-feed) — must match in TWO places
The function rejects calls whose `x-cron-secret` header ≠ its `CRON_SECRET`, and
the cron job reads the value from Vault. **Both must be updated together** or the
feed 401s.

```bash
# 1. Generate a new value
SECRET=$(openssl rand -hex 24); echo "$SECRET"

# 2. Set it on the function
npx supabase secrets set CRON_SECRET="$SECRET"
```
```sql
-- 3. Update the Vault copy (SQL editor) — paste the printed value, no $:
select vault.update_secret(
  (select id from vault.secrets where name = 'live_feed_cron_secret'),
  'PASTE_THE_VALUE'
);
```
```bash
# 4. Redeploy the function so the new secret is live
npx supabase functions deploy live-feed --no-verify-jwt
```
5. Verify: run one manual `net.http_post` to the function and confirm
   `status_code = 200` in `net._http_response` (see migration 009 comments).

## 4. API-Football key (if used)
1. API-Football dashboard → regenerate key.
2. Update `VITE_API_FOOTBALL_KEY` in `.env` (and Vercel env if read at build).
3. Verify the relevant fetch script runs without a 401/403.

## 5. Google OAuth client secret
1. Google Cloud Console → APIs & Services → Credentials → rotate the client secret.
2. Supabase Dashboard → **Authentication → Sign In / Providers → Google** → paste the new secret.
3. Verify: sign in with Google end-to-end.

---

## Emergency: a secret is exposed (e.g. committed to git)
1. **Rotate the affected secret now** (sections above) — don't wait.
2. If it was committed: rotating is what matters (the value in history is already
   burned). Optionally scrub history with `git filter-repo`, but assume it's public.
3. For the **service-role key**: after rotating, review recent DB activity and
   Supabase logs for unauthorized access.
4. Add the file to `.gitignore` if it wasn't (`.env` already is; confirm).
5. Record the incident: what leaked, when, rotated-at, what you checked.

## Notes
- Edge-function secrets are **not** versioned by Supabase — there's no rollback;
  re-set the old value manually if a rotation breaks something.
- Keep a private record (password manager / Vault) of each secret's last-rotated
  date so the 90-day cadence is auditable.
