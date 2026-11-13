// The log line's shape (worker/log.ts): the standard fields on every line, the
// caught error as `error` and `stack`, and no field a call site passes can
// overwrite the standard ones.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logFor, logLine, versionOf } from '../log';

const context = { route: 'admin', requestId: 'abc-LHR', version: 'v1' };

test('every line has level, msg, route, requestId and version', () => {
  const line = JSON.parse(logLine('info', 'admin write', context, { status: 200 }));
  assert.deepEqual(line, { status: 200, level: 'info', msg: 'admin write', route: 'admin', requestId: 'abc-LHR', version: 'v1' });
});

test('a caught error becomes error and stack', () => {
  const line = JSON.parse(logLine('error', 'boom', context, { err: new Error('bad') }));
  assert.equal(line.error, 'bad');
  assert.match(line.stack, /bad/);
  assert.equal('err' in line, false);
});

test('a call site cannot overwrite the standard fields', () => {
  const line = JSON.parse(logLine('warn', 'x', context, { level: 'info', route: 'other', msg: 'y' }));
  assert.equal(line.level, 'warn');
  assert.equal(line.route, 'admin');
  assert.equal(line.msg, 'x');
});

test('version is the tag, else the id, else dev', () => {
  assert.equal(versionOf({}), 'dev');
  assert.equal(versionOf({ CF_VERSION_METADATA: { id: 'uuid-1' } }), 'uuid-1');
  assert.equal(versionOf({ CF_VERSION_METADATA: { id: 'uuid-1', tag: 'abc1234' } }), 'abc1234');
});

test('logFor writes to the matching console method with a request id from cf-ray', (t) => {
  const error = t.mock.method(console, 'error', () => {});
  const log = logFor({}, new Request('https://album.guide/x', { headers: { 'cf-ray': 'ray-1' } }), 'sentry');
  log.error('failed', { err: 'nope' });
  const line = JSON.parse(String(error.mock.calls[0].arguments[0]));
  assert.deepEqual([line.level, line.msg, line.route, line.requestId, line.version], ['error', 'failed', 'sentry', 'ray-1', 'dev']);
});
