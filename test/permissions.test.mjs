import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ZcodeProtocolClient } from '../dist/protocol.js';

test('permission setting validates backend confirmation and refuses active turns', async () => {
  const c = new ZcodeProtocolClient();
  c.request = async (method, params) => {
    assert.equal(method, 'session/setMode');
    assert.equal(params.sessionId, 'sess_test');
    return { settings: { mode: { current: params.mode } } };
  };
  for (const mode of ['plan', 'build', 'edit', 'guarded', 'yolo']) assert.equal(await c.setSessionMode('sess_test', mode), mode);
  await assert.rejects(c.setSessionMode('sess_test', 'invalid'), /Invalid/);
  c.request = async () => ({ settings: { mode: { current: 'yolo' } } });
  await assert.rejects(c.setSessionMode('sess_test', 'plan'), /not confirmed/);
  c.request = async method => method === 'session/events'
    ? { events: [{ sessionId: 'sess_test', seq: 1, payload: { planEnabled: true } }] }
    : { settings: { mode: { current: 'yolo' } } };
  assert.equal(await c.setSessionMode('sess_test', 'plan'), 'plan');
  let planRequests = 0;
  c.request = async (method, params) => {
    if (method === 'session/setMode' && params.mode === 'plan') planRequests++;
    return method === 'session/events'
      ? { events: planRequests > 1 ? [{ sessionId: 'sess_test', seq: 1, payload: { planEnabled: true } }] : [] }
      : { settings: { mode: { current: 'build' } } };
  };
  assert.equal(await c.setSessionMode('sess_test', 'plan'), 'plan');
  assert.equal(planRequests, 2);
  c.turnWaiters.set('sess_test', () => {});
  await assert.rejects(c.setSessionMode('sess_test', 'yolo'), /running/);
});

test('MCP applies permissions to new and resumed runs, and can change an idle session without a prompt', async () => {
  assert.doesNotMatch(tmpdir(), /^C:[\\/]/i);
  const scratch = await mkdtemp(join(tmpdir(), 'permission-test-'));
  const client = new Client({ name: 'permission-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['dist/index.js'],
      env: { ...process.env, ZCODE_BIN: fileURLToPath(new URL('./fixtures/permission-app-server.cjs', import.meta.url)),
        ZCODE_MCP_STATE_DIR: scratch, ZCODE_DEFAULT_CWD: scratch } }));
    const first = await client.callTool({ name: 'zcode_run', arguments: { prompt: 'test', cwd: scratch, mode: 'plan', model: 'test' } });
    assert.equal(first.isError, undefined);
    assert.match(first.content[0].text, /mode=plan/);
    const session_id = first.content[0].text.match(/session_id: (sess_[\w-]+)/)[1];
    for (const mode of ['build', 'edit', 'guarded', 'yolo']) {
      const r = await client.callTool({ name: 'zcode_run', arguments: { prompt: 'test', cwd: scratch, session_id, mode, model: 'test' } });
      assert.equal(r.isError, undefined);
      assert.match(r.content[0].text, new RegExp(`permission_mode: ${mode}`));
      assert.match(r.content[0].text, new RegExp(`mode=${mode}`));
    }
    const changed = await client.callTool({ name: 'zcode_set_mode', arguments: { session_id, cwd: scratch, mode: 'build' } });
    assert.deepEqual(changed.structuredContent, { session_id, mode: 'build' });
    const inherited = await client.callTool({ name: 'zcode_run', arguments: { prompt: 'test', cwd: scratch, session_id, model: 'test' } });
    assert.match(inherited.content[0].text, /mode=build/);
  } finally { await client.close(); await rm(scratch, { recursive: true, force: true }); }
});
