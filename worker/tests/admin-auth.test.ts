// Who gets into /admin (worker/admin-auth.ts). Tokens are signed here with a
// key made for the test, so nothing reaches Cloudflare.
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import { staffEmail, TEST_COOKIE, TEST_EMAIL, testCookieValue, testLoginAllowed, type AdminEnv } from '../admin-auth';

const TEAM = 'team.cloudflareaccess.com';
const AUD = 'audience-tag-of-the-admin-app';
const env: AdminEnv = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: 'Owner@Example.com, second@example.com' };

let keys: JWTVerifyGetKey;
let sign: (claims: Record<string, unknown>, options?: { issuer?: string; audience?: string; expired?: boolean; key?: CryptoKey }) => Promise<string>;
let otherKey: CryptoKey;

before(async () => {
  const pair = await generateKeyPair('RS256');
  otherKey = (await generateKeyPair('RS256')).privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }] });
  sign = (claims, options = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(options.issuer ?? `https://${TEAM}`)
      .setAudience(options.audience ?? AUD)
      .setIssuedAt(options.expired ? 1_000 : undefined)
      .setExpirationTime(options.expired ? 2_000 : '1h')
      .sign(options.key ?? pair.privateKey);
});

const ask = (token?: string, host = 'album.guide', cookie?: string) =>
  new Request(`https://${host}/admin`, {
    headers: { ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  });

test('a valid Access token for a listed email is let in, whatever the case of the email', async () => {
  assert.equal(await staffEmail(ask(await sign({ email: 'owner@example.com' })), env, keys), 'owner@example.com');
  assert.equal(await staffEmail(ask(await sign({ email: 'SECOND@example.com' })), env, keys), 'second@example.com');
});

test('no token is refused', async () => {
  assert.equal(await staffEmail(ask(), env, keys), null);
});

test('with any setting missing or empty, everyone is refused', async () => {
  const token = await sign({ email: 'owner@example.com' });
  for (const missing of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ADMIN_EMAILS'] as const) {
    assert.equal(await staffEmail(ask(token), { ...env, [missing]: undefined }, keys), null, `${missing} missing`);
    assert.equal(await staffEmail(ask(token), { ...env, [missing]: '' }, keys), null, `${missing} empty`);
  }
  assert.equal(await staffEmail(ask(token), { ...env, ADMIN_EMAILS: ' , ,' }, keys), null);
  assert.equal(await staffEmail(ask(token), {}, keys), null);
});

test('an email that is not on the list is refused, as is a token with no email', async () => {
  assert.equal(await staffEmail(ask(await sign({ email: 'stranger@example.com' })), env, keys), null);
  assert.equal(await staffEmail(ask(await sign({ email: 'owner@example.com.evil.test' })), env, keys), null);
  assert.equal(await staffEmail(ask(await sign({ common_name: 'service-token' })), env, keys), null);
  assert.equal(await staffEmail(ask(await sign({ email: ['owner@example.com'] })), env, keys), null);
});

test('a token for another app, another team, an expired one or one signed by someone else is refused', async () => {
  const claims = { email: 'owner@example.com' };
  assert.equal(await staffEmail(ask(await sign(claims, { audience: 'another-app' })), env, keys), null);
  assert.equal(await staffEmail(ask(await sign(claims, { issuer: 'https://evil.cloudflareaccess.com' })), env, keys), null);
  assert.equal(await staffEmail(ask(await sign(claims, { expired: true })), env, keys), null);
  assert.equal(await staffEmail(ask(await sign(claims, { key: otherKey })), env, keys), null);
  assert.equal(await staffEmail(ask('not.a.token'), env, keys), null);
  const unsigned = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify({ ...claims, aud: AUD, iss: `https://${TEAM}` }))}.`;
  assert.equal(await staffEmail(ask(unsigned), env, keys), null);
});

test('the test sign-in works on a preview host with the right cookie, and only when the code is configured', async () => {
  const preview = 'feat-x-album-guide-site-preview.jj-23b.workers.dev';
  const good = `${TEST_COOKIE}=${await testCookieValue('the-code')}`;
  assert.equal(await staffEmail(ask(undefined, preview, good), { ADMIN_TEST_CODE: 'the-code' }, keys), TEST_EMAIL);
  assert.equal(await staffEmail(ask(undefined, preview, `other=1; ${good}`), { ADMIN_TEST_CODE: 'the-code' }, keys), TEST_EMAIL);
  assert.equal(await staffEmail(ask(undefined, preview, good), {}, keys), null);
  assert.equal(await staffEmail(ask(undefined, preview, good), { ADMIN_TEST_CODE: '' }, keys), null);
  assert.equal(await staffEmail(ask(undefined, preview, good), { ADMIN_TEST_CODE: 'changed' }, keys), null);
  assert.equal(await staffEmail(ask(undefined, preview, `${TEST_COOKIE}=the-code`), { ADMIN_TEST_CODE: 'the-code' }, keys), null);
  assert.equal(await staffEmail(ask(undefined, preview), { ADMIN_TEST_CODE: 'the-code' }, keys), null);
});

test('the test sign-in is never honoured on album.guide, even if the code were set there', async () => {
  const good = `${TEST_COOKIE}=${await testCookieValue('the-code')}`;
  for (const host of ['album.guide', 'www.album.guide']) {
    const request = ask(undefined, host, good);
    assert.equal(testLoginAllowed(request, { ADMIN_TEST_CODE: 'the-code' }), false);
    assert.equal(await staffEmail(request, { ...env, ADMIN_TEST_CODE: 'the-code' }, keys), null);
  }
});
