// Create one approved, email-confirmed account for an authenticated desk admin.
// Never logs credentials; the browser sends this request over HTTPS.
const projectKey = (raw: string | undefined, prefix: string): string | undefined => {
  try {
    const keys = JSON.parse(raw || '{}');
    return Object.values(keys).find((value): value is string =>
      typeof value === 'string' && value.startsWith(prefix));
  } catch { return undefined; }
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = ['https://baueruknews.github.io'];
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : '';
  const cors = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  if (origin && !allowedOrigin) return reply(403, { error: 'This website is not enabled to create accounts.' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const publicKey = Deno.env.get('DESK_PUBLIC_KEY') ||
    projectKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'), 'sb_publishable_') ||
    Deno.env.get('SUPABASE_ANON_KEY') || '';
  const secretKey = Deno.env.get('DESK_SERVICE_KEY') ||
    projectKey(Deno.env.get('SUPABASE_SECRET_KEYS'), 'sb_secret_') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !publicKey || !secretKey) {
    return reply(503, { error: 'Account creation is not configured. Contact Owen.' });
  }

  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { error: 'Please sign in again.' });
  try {
    const authResponse = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: authorization },
      signal: AbortSignal.timeout(10000),
    });
    if (!authResponse.ok) return reply(401, { error: 'Please sign in again.' });
    const caller = await authResponse.json();
    if (!caller.id || !caller.email_confirmed_at) return reply(403, { error: 'A confirmed administrator account is required.' });

    // Check the user's admin status with their own token. desk_is_admin() also
    // requires active access, so a paused/revoked account cannot create users.
    const adminResponse = await fetch(`${url}/rest/v1/rpc/desk_is_admin`, {
      method: 'POST',
      headers: { apikey: publicKey, Authorization: authorization, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(10000),
    });
    if (!adminResponse.ok) return reply(403, { error: 'Administrator access is required.' });
    if (await adminResponse.json() !== true) return reply(403, { error: 'Administrator access is required.' });

    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 8192) return reply(413, { error: 'Request too large.' });
    let body: { email?: unknown; password?: unknown };
    try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Enter an email address and temporary password.' }); }
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply(400, { error: 'Enter a valid email address.' });
    }
    if (password.length < 12 || password.length > 128) {
      return reply(400, { error: 'Use a temporary password between 12 and 128 characters.' });
    }

    const adminHeaders: Record<string, string> = { apikey: secretKey, 'Content-Type': 'application/json' };
    if (secretKey.startsWith('eyJ')) adminHeaders.Authorization = `Bearer ${secretKey}`;
    const createResponse = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!createResponse.ok) {
      const details = await createResponse.json().catch(() => ({}));
      const message = typeof details.msg === 'string' ? details.msg : typeof details.message === 'string' ? details.message : '';
      return reply(createResponse.status === 429 ? 429 : 400, {
        error: message || 'Supabase could not create that account. Check whether the email is already in use and try again.',
      });
    }
    const created = await createResponse.json();
    if (!created.id) return reply(502, { error: 'Supabase did not return the new account. Refresh the account list before retrying.' });

    // The auth.users trigger creates a default unapproved member. Promote only
    // this new account; it remains a normal user and can be revoked in the UI.
    const memberResponse = await fetch(`${url}/rest/v1/desk_members?on_conflict=user_id`, {
      method: 'POST', headers: {
        ...adminHeaders,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }, body: JSON.stringify({ user_id: created.id, email, approved: true }),
      signal: AbortSignal.timeout(12000),
    });
    if (!memberResponse.ok) {
      // Roll back a provisioned login if approval could not be recorded.
      const rollback = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(created.id)}`, {
        method: 'DELETE', headers: adminHeaders, signal: AbortSignal.timeout(10000),
      }).catch(() => null);
      return reply(503, { error: rollback?.ok
        ? 'The account could not be approved and was removed. Please try again.'
        : 'The account was created but is not approved. Refresh the account list; it cannot access releases until approved.' });
    }
    return reply(200, { ok: true, email });
  } catch {
    return reply(503, { error: 'Account creation could not reach Supabase. Please try again.' });
  }
});
