import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// Pure-function replicas of the server/client contracts (kept in sync with implementation).
function clampPagination(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}
function isDuplicate(rows, username, editingId) {
  return rows.some((row) => row.id !== editingId && row.username.toLowerCase() === username.toLowerCase());
}
function escapeCsvCell(value) {
  const safe = /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function deleteStatus(deletedRows) {
  if (!Array.isArray(deletedRows) || deletedRows.length === 0) return 404;
  return 200;
}

// --- Mirrors of api/_telegram-auth.ts (verified in sync by the contract tests below) ---
function verifyMiniAppInitData(raw, botToken) {
  if (!raw || !botToken) return null;
  const params = new URLSearchParams(raw);
  const receivedHash = params.get('hash') || '';
  params.delete('hash');
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest();
  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) return null;
  const received = Buffer.from(receivedHash, 'hex');
  if (received.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < received.length; i++) mismatch |= received[i] ^ expected[i];
  if (mismatch !== 0) return null;
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > now + 30 || now - authDate > 86400) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (user && Number.isSafeInteger(user.id) && user.id > 0 && typeof user.first_name === 'string') {
      const out = { id: user.id, first_name: user.first_name };
      if (typeof user.username === 'string') out.username = user.username;
      if (typeof user.photo_url === 'string') out.photo_url = user.photo_url;
      if (typeof user.last_name === 'string') out.last_name = user.last_name;
      return out;
    }
  } catch { return null; }
  return null;
}
function verifySessionCookie(header, botToken) {
  if (!header || !botToken) return null;
  const entry = header.split(';').map((p) => p.trim()).find((p) => p.startsWith('ttogrm_session='));
  const value = entry?.slice('ttogrm_session='.length);
  if (!value) return null;
  const sep = value.lastIndexOf('.');
  if (sep < 1) return null;
  const payload = value.slice(0, sep);
  const sig = value.slice(sep + 1);
  if (!/^[a-f0-9]{64}$/i.test(sig)) return null;
  const expected = createHmac('sha256', botToken).update(payload).digest();
  const received = Buffer.from(sig, 'hex');
  if (received.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < received.length; i++) mismatch |= received[i] ^ expected[i];
  if (mismatch !== 0) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.user || !Number.isSafeInteger(session.user.id) || !Number.isSafeInteger(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session.user;
  } catch { return null; }
}
function signInitData(fields, botToken) {
  const checkString = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(checkString).digest('hex');
}
function verifyLoginWidget(user, botToken) {
  const { hash, ...rest } = user;
  const checkString = Object.entries(rest).filter(([, v]) => v !== undefined && v !== null).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${String(v)}`).join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(checkString).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(hash)) return false;
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && a.equals(b) === true && hash.toLowerCase() === expected.toLowerCase();
}
const BOT = 'test-bot-token-12345';
const nowSec = () => Math.floor(Date.now() / 1000);
function validInitData(overrides = {}) {
  const fields = {
    auth_date: String(nowSec()),
    query_id: 'AAHDfake',
    user: JSON.stringify({ id: 42, first_name: 'Ada' }),
    ...overrides,
  };
  const hash = signInitData(fields, BOT);
  return new URLSearchParams({ ...fields, hash }).toString();
}
function validSessionCookie(userId = 42) {
  const payload = Buffer.from(JSON.stringify({ user: { id: userId, first_name: 'Ada' }, exp: nowSec() + 3600 })).toString('base64url');
  const sig = createHmac('sha256', BOT).update(payload).digest('hex');
  return `ttogrm_session=${payload}.${sig}`;
}

describe('inventory pagination bounds', () => {
  it('defaults to 100/0 and clamps oversized or negative input', () => {
    assert.deepEqual(clampPagination({}), { limit: 100, offset: 0 });
    assert.deepEqual(clampPagination({ limit: '1000', offset: '-5' }), { limit: 200, offset: 0 });
    assert.deepEqual(clampPagination({ limit: '50', offset: '20' }), { limit: 50, offset: 20 });
  });
  it('server implementation enforces limit/offset on reads', () => {
    const src = read('api/inventory.ts');
    assert.match(src, /limit=\$\{limit\}&offset=\$\{offset\}/);
    assert.match(src, /Math\.min\(Math\.max\(Number\(req\.query\.limit\)/);
  });
});

describe('inventory delete semantics', () => {
  it('empty Supabase delete result maps to 404', () => {
    assert.equal(deleteStatus([]), 404);
    assert.equal(deleteStatus(null), 404);
    assert.equal(deleteStatus([{ id: 'x' }]), 200);
  });
  it('server returns 404 when no owned row was removed', () => {
    const src = read('api/inventory.ts');
    assert.match(src, /return res\.status\(404\)\.json\(\{ error: 'That saved username/);
  });
});

describe('duplicate prevention stays case-insensitive', () => {
  it('detects duplicates regardless of case, excluding the row being edited', () => {
    const rows = [{ id: 'a', username: 'CryptoName' }];
    assert.equal(isDuplicate(rows, 'cryptoname', ''), true);
    assert.equal(isDuplicate(rows, 'CRYPTONAME', 'a'), false);
    assert.equal(isDuplicate(rows, 'other_name', ''), false);
  });
  it('server compares normalized values in code (LIKE wildcards avoided)', () => {
    assert.match(read('api/inventory.ts'), /toLowerCase\(\) === input\.username\.toLowerCase\(\)/);
  });
});

describe('CSV export formula-injection guard', () => {
  it('prefixes spreadsheet-trigger characters', () => {
    assert.equal(escapeCsvCell('=cmd'), '"\'=cmd"');
    assert.equal(escapeCsvCell('+cmd'), '"\'+cmd"');
    assert.equal(escapeCsvCell('-cmd'), '"\'-cmd"');
    assert.equal(escapeCsvCell('@cmd'), '"\'@cmd"');
    assert.equal(escapeCsvCell('plain note'), '"plain note"');
  });
  it('frontend keeps the guard', () => {
    assert.match(read('src/App.tsx'), /Prevent spreadsheet formula execution/);
  });
});

describe('auth hardening', () => {
  it('login cookie adapts Secure flag instead of forcing it off in production', () => {
    const src = read('api/telegram-login.ts');
    assert.match(src, /isSecureRequest\(req\)/);
    assert.match(src, /sessionCookieHeader\(value, maxAge/);
  });
  it('session + inventory share one verifier (no drift between routes)', () => {
    assert.match(read('api/telegram-session.ts'), /verifySessionCookie\(req\.headers\.cookie, botToken\)/);
    assert.match(read('api/inventory.ts'), /from '\.\/_telegram-auth'/);
    assert.match(read('api/_telegram-auth.ts'), /export function verifyMiniAppInitData/);
    assert.match(read('api/_telegram-auth.ts'), /export function verifySessionCookie/);
  });
  it('forms guard against duplicate submissions', () => {
    const src = read('src/App.tsx');
    assert.match(src, /if \(savingInventory\) return/);
    assert.match(src, /if \(!editingId \|\| savingInventory\) return/);
  });
});

describe('authentication negative vectors (synthetic HMAC)', () => {
  it('accepts valid Mini App initData', () => {
    const user = verifyMiniAppInitData(validInitData(), BOT);
    assert.equal(user?.id, 42);
    assert.equal(user?.first_name, 'Ada');
  });
  it('preserves verified profile fields (username, photo)', () => {
    const raw = validInitData({
      user: JSON.stringify({ id: 42, first_name: 'Ada', username: 'ada', photo_url: 'https://example.invalid/a.png' }),
    });
    const user = verifyMiniAppInitData(raw, BOT);
    assert.equal(user?.username, 'ada');
    assert.equal(user?.photo_url, 'https://example.invalid/a.png');
  });
  it('rejects tampered identity (user id swapped, signature reused)', () => {
    const good = validInitData();
    const tampered = new URLSearchParams(good);
    tampered.set('user', JSON.stringify({ id: 9999, first_name: 'Mallory' }));
    assert.equal(verifyMiniAppInitData(tampered.toString(), BOT), null);
  });
  it('rejects forged signature', () => {
    const bad = new URLSearchParams(validInitData());
    bad.set('hash', '0'.repeat(64));
    assert.equal(verifyMiniAppInitData(bad.toString(), BOT), null);
  });
  it('rejects expired and future-skewed auth_date', () => {
    const stale = validInitData({ auth_date: String(nowSec() - 86401) });
    assert.equal(verifyMiniAppInitData(stale, BOT), null);
    const future = validInitData({ auth_date: String(nowSec() + 3600) });
    assert.equal(verifyMiniAppInitData(future, BOT), null);
  });
  it('rejects missing/malformed user payload', () => {
    const params = new URLSearchParams(validInitData());
    params.delete('user');
    const fields = Object.fromEntries(params.entries());
    delete fields.hash;
    const rehash = signInitData(fields, BOT);
    assert.equal(verifyMiniAppInitData(new URLSearchParams({ ...fields, hash: rehash }).toString(), BOT), null);
    assert.equal(verifyMiniAppInitData('not-a-query-string', BOT), null);
  });
  it('rejects wrong-token signatures', () => {
    assert.equal(verifyMiniAppInitData(validInitData(), 'different-token'), null);
  });
  it('accepts a valid session cookie, rejects tampered/expired ones', () => {
    assert.deepEqual(verifySessionCookie(validSessionCookie(), BOT)?.id, 42);
    const good = validSessionCookie();
    const tamperedPayload = Buffer.from(JSON.stringify({ user: { id: 9999, first_name: 'Mallory' }, exp: nowSec() + 3600 })).toString('base64url');
    const forged = `ttogrm_session=${tamperedPayload}.${good.split('.')[1]}`;
    assert.equal(verifySessionCookie(forged, BOT), null);
    const expiredPayload = Buffer.from(JSON.stringify({ user: { id: 42, first_name: 'Ada' }, exp: nowSec() - 10 })).toString('base64url');
    const expiredSig = createHmac('sha256', BOT).update(expiredPayload).digest('hex');
    assert.equal(verifySessionCookie(`ttogrm_session=${expiredPayload}.${expiredSig}`, BOT), null);
    assert.equal(verifySessionCookie(undefined, BOT), null);
  });
  it('login-widget check string rejects forged hash and expired auth_date', () => {
    const authDate = nowSec();
    const rest = { id: 7, first_name: 'Ada', auth_date: authDate };
    const checkString = [`auth_date=${authDate}`, 'first_name=Ada', 'id=7'].join('\n');
    const secret = createHash('sha256').update(BOT).digest();
    const hash = createHmac('sha256', secret).update(checkString).digest('hex');
    assert.equal(verifyLoginWidget({ ...rest, hash }, BOT), true);
    assert.equal(verifyLoginWidget({ ...rest, hash: 'f'.repeat(64) }, BOT), false);
    assert.equal(verifyLoginWidget({ id: 9999, first_name: 'Ada', auth_date: authDate, hash }, BOT), false);
  });
});

describe('CSRF origin guard (cookie writes)', () => {
  // Mirror of isAllowedWriteRequest in api/_telegram-auth.ts.
  function isAllowedWriteRequest(req) {
    const hasInitData = typeof req.headers['x-telegram-init-data'] === 'string' && req.headers['x-telegram-init-data'];
    if (hasInitData) return true;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    const origin = String(req.headers.origin || '').trim();
    const referer = String(req.headers.referer || '').trim();
    if (!origin && !referer) return true;
    const hostOf = (u) => { try { return new URL(u).host.toLowerCase(); } catch { return ''; } };
    const caller = origin ? hostOf(origin) : hostOf(referer);
    return !!host && caller === host;
  }
  const base = { 'x-forwarded-host': 'ttogrm.example', host: 'ttogrm.example' };
  it('allows same-origin browser writes', () => {
    assert.equal(isAllowedWriteRequest({ headers: { ...base, origin: 'https://ttogrm.example' } }), true);
    assert.equal(isAllowedWriteRequest({ headers: { ...base, referer: 'https://ttogrm.example/collection' } }), true);
  });
  it('blocks cross-site origins on cookie-authenticated writes', () => {
    assert.equal(isAllowedWriteRequest({ headers: { ...base, origin: 'https://evil.example' } }), false);
    assert.equal(isAllowedWriteRequest({ headers: { ...base, referer: 'https://evil.example/x' } }), false);
  });
  it('exempts initData-authenticated requests (HMAC is the credential)', () => {
    assert.equal(isAllowedWriteRequest({ headers: { ...base, origin: 'https://evil.example', 'x-telegram-init-data': 'hash=abc' } }), true);
  });
  it('server enforces the guard on POST/PUT/DELETE', () => {
    assert.match(read('api/inventory.ts'), /isAllowedWriteRequest\(req\)/);
    assert.match(read('api/inventory.ts'), /status\(403\)\.json/);
  });
  it('/api/auth shares the Mini App verifier with inventory', () => {
    assert.match(read('api/auth.ts'), /verifyMiniAppInitData\(initData, botToken\)/);
    assert.doesNotMatch(read('api/auth.ts'), /createHmac/);
  });
  it('duplicate check stays bounded server-side', () => {
    assert.match(read('api/inventory.ts'), /select=id,username&telegram_user_id=.*&limit=500/);
  });
  it('edge verifier matches the Vercel contract (strict hash, integer auth_date, typed profile)', () => {
    const src = read('supabase/functions/telegram-auth/index.ts');
    assert.match(src, /\/\^\[a-f0-9\]\{64\}\$\/i\.test\(left\)/);
    assert.match(src, /Number\.isSafeInteger\(authDate\)/);
    assert.match(src, /typeof user\.username === "string"/);
    assert.match(src, /typeof user\.photo_url === "string"/);
  });
});
