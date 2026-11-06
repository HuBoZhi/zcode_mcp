// Local protocol double: never runs a model or touches user data.
const modes = new Map();
let next = 0;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
send({ method: 'startup/storageState', params: {} });
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  let result = {};
  if (method === 'session/create') {
    const sessionId = `sess_fake-${++next}`;
    modes.set(sessionId, params.mode);
    result = { session: { sessionId }, settings: { mode: { current: params.mode }, model: { available: [{ ref: { providerId: 'test', modelId: 'test' } }] } } };
  } else if (method === 'session/setMode') {
    modes.set(params.sessionId, params.mode);
    result = { settings: { mode: { current: params.mode } } };
  } else if (method === 'session/messages') {
    result = { messages: [{ info: { role: 'assistant', time: { created: Date.now() } }, parts: [{ type: 'text', text: `mode=${modes.get(params.sessionId)}` }] }] };
  } else if (method === 'session/send') {
    setTimeout(() => send({ method: 'session/event', params: { sessionId: params.sessionId, type: 'turn.completed' } }), 10);
  }
  send({ id, result });
});
