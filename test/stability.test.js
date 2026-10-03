const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../scripts/airborne');
const join = (...xs) => Buffer.concat(xs.map(x => Buffer.from(x)));
const payload = () => join(A.f(99, 'original-unknown'), A.f(100, 123), A.f(2, A.f(1, 'original-chronos')));
const rows = [{ category: 'sponsor', cid: '456', actionType: 'skip', segment: [0, 114] }];
function fixture({ progress, headers = {}, trailers = { 'grpc-status': '0' }, responseHeaders = { 'Content-Type': 'application/grpc' } } = {}) {
  const calls = [], done = [], timers = new Map(), store = {};
  let id = 0;
  const body = A.frame(payload());
  const e = {
    $argument: {},
    $request: { url: 'https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile', method: 'POST', headers,
      body: A.frame(join(A.f(1, 170001), A.f(2, 456), A.f(3, 1), A.f(4, 1), ...(progress === undefined ? [] : [A.f(6, progress)]))) },
    $persistentStore: { read: k => store[k], write: (v, k) => { store[k] = v; return true; } },
    $httpClient: {
      get: (o, cb) => { calls.push({ method: 'GET', o }); cb(null, { status: 200 }, JSON.stringify(rows)); },
      post: (o, cb) => { calls.push({ method: 'POST', o }); cb(null, { status: 200, headers: responseHeaders, h2_trailers: trailers }, body); }
    },
    $done: o => done.push(o), setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimeout: n => timers.delete(n)
  };
  return { e, calls, done, timers, store, body };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function original(v) {
  assert.equal(v.done.length, 1);
  assert.ok(v.done[0].response, 'must return already fetched upstream response');
  assert.deepEqual(Buffer.from(v.done[0].response.body), Buffer.from(v.body));
}

test('cold run starts POST while GET callback remains unresolved; both use h2', async () => {
  const v = fixture(); let query;
  v.e.$httpClient.get = (o, cb) => { v.calls.push({ method: 'GET', o }); query = cb; };
  const running = A.run(v.e);
  await flush();
  const started = v.calls.some(c => c.method === 'POST');
  // Release GET even on failure so a failed assertion cannot strand the run.
  query(null, { status: 200 }, JSON.stringify(rows));
  await running;
  assert.equal(started, true, 'POST must start before unresolved cold query completes');
  assert.equal(v.calls.find(c => c.method === 'GET').o.alpn, 'h2');
  assert.equal(v.calls.find(c => c.method === 'POST').o.alpn, 'h2');
  assert.equal(v.done.length, 1);
});

for (const kind of ['timeout', 'network', 'invalid-json', 'http-500']) {
  test(`query ${kind} returns original binary exactly once, ignores late callbacks, retries without failure cache`, async () => {
    const v = fixture(); let late;
    v.e.$httpClient.get = (o, cb) => {
      v.calls.push({ method: 'GET', o }); late = cb;
      if (kind === 'network') cb('synthetic-error');
      if (kind === 'invalid-json') cb(null, { status: 200 }, '{');
      if (kind === 'http-500') cb(null, { status: 500 }, '');
    };
    const rejected = []; const listener = error => rejected.push(error);
    process.on('unhandledRejection', listener);
    try {
      const running = A.run(v.e);
      await flush();
      if (kind === 'timeout') for (const t of [...v.timers.values()]) if (t.ms < 8500) t.fn();
      await running;
      original(v);
      late(null, { status: 200 }, JSON.stringify(rows));
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(v.done.length, 1);
      assert.deepEqual(rejected, []);
      v.e.$httpClient.get = (o, cb) => { v.calls.push({ method: 'GET', o }); cb(null, { status: 200 }, JSON.stringify(rows)); };
      await A.run(v.e);
      assert.equal(v.calls.filter(c => c.method === 'GET').length, 2, 'failed query must not populate long-lived cache');
      assert.equal(v.done.length, 2);
    } finally { process.removeListener('unhandledRejection', listener); }
  });
}

test('successful warm cache performs POST but no second GET', async () => {
  const v = fixture(); await A.run(v.e); await A.run(v.e);
  assert.equal(v.calls.filter(c => c.method === 'GET').length, 1);
  assert.equal(v.calls.filter(c => c.method === 'POST').length, 2);
  assert.equal(v.done.length, 2);
});

test('progress excludes only expired ranges and preserves original protobuf and Chronos bytes', async () => {
  for (const progress of [120000, 4000]) {
    const v = fixture({ progress }); await A.run(v.e);
    assert.equal(v.done.length, 1); assert.ok(v.done[0].response);
    const out = A.frames(v.done[0].response.body, 'identity')[0];
    assert.deepEqual(Buffer.from(out.slice(0, payload().length)), payload());
    const actions = A.fields(out).filter(f => f.no === 1 && f.w === 2);
    assert.equal(actions.length, progress === 120000 ? 0 : 1);
    if (progress === 4000) assert.equal(Number(A.fields(actions[0].v).find(f => f.no === 2).v), 2000);
  }
});

for (const mutation of ['network', 'http', 'malformed', 'header-status', 'trailer-status']) {
  test(`grpc ${mutation} fails open without replacement and late callback cannot finish twice`, async () => {
    const v = fixture(); let late;
    v.e.$httpClient.post = (o, cb) => {
      v.calls.push({ method: 'POST', o }); late = cb;
      if (mutation === 'network') cb('synthetic-error');
      else cb(null, { status: mutation === 'http' ? 503 : 200,
        headers: mutation === 'header-status' ? { 'Grpc-Status': '13' } : {},
        h2_trailers: mutation === 'trailer-status' ? { 'grpc-status': '7' } : undefined
      }, mutation === 'malformed' ? Uint8Array.of(0) : v.body);
    };
    await A.run(v.e); assert.deepEqual(v.done, [{}]);
    late(null, { status: 200, headers: {}, h2_trailers: { 'grpc-status': '0' } }, v.body);
    await flush(); assert.deepEqual(v.done, [{}]);
  });
}

test('missing grpc status fix is restricted to engine=1 without trailers; undefined trailers retained', async () => {
  for (const engine of [undefined, '1', '2']) for (const trailers of [undefined, {}]) {
    const v = fixture({ headers: engine === undefined ? {} : { 'X-Bili-Moss-Engine-Type': engine }, trailers });
    // Explicit assignment avoids default parameter masking undefined.
    v.e.$httpClient.post = (o, cb) => { v.calls.push({ method: 'POST', o }); cb(null, { status: 200, headers: { 'Content-Type': 'application/grpc' }, h2_trailers: trailers }, v.body); };
    await A.run(v.e); assert.equal(v.done.length, 1); assert.ok(v.done[0].response);
    const response = v.done[0].response;
    assert.deepEqual(response.h2_trailers, trailers);
    const status = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'grpc-status');
    assert.equal(status && String(status[1]), engine === '1' && trailers === undefined ? '0' : undefined);
  }
});

for (const [token, md5] of [['bili-universal/8.0', 'e5a968f1a5055bbe5c12e67b100a6dcb'], ['bili-hd/3.0', 'f993a054969a4f6ae6b20a65f1292e47'], ['bili-inter/3.0', '8c3feda2e92bf60e8a7aeade1a231586']]) {
  test(`real grpc-c++ UA prefix selects ${token.split('/')[0]} module in actual response run`, async () => {
    const v = fixture();
    v.e.$request.url = 'https://app.bilibili.com/bilibili.app.viewunite.v1.View/ViewProgress';
    v.e.$request.headers = { 'User-Agent': `grpc-c++/1.61.0 ${token} synthetic/1.0` };
    const p = join(A.f(1, 'guide'), A.f(2, join(A.f(1, '0123456789abcdef0123456789abcdef'), A.f(2, 'https://synthetic.invalid/module'), A.f(3, 'synthetic-sign'), A.f(99, 'retained'))), A.f(4, 'dm'));
    v.e.$response = { status: 200, headers: {}, body: A.frame(p) };
    await A.run(v.e); assert.equal(v.done.length, 1); assert.ok(v.done[0].body);
    const fs = A.fields(A.frames(v.done[0].body, 'identity')[0]);
    const inner = A.fields(fs.find(f => f.no === 2).v);
    assert.equal(new TextDecoder().decode(inner.find(f => f.no === 1).v), md5);
    assert.deepEqual(Buffer.from(fs.find(f => f.no === 1).raw), Buffer.from(A.f(1, 'guide')));
    assert.deepEqual(Buffer.from(fs.find(f => f.no === 4).raw), Buffer.from(A.f(4, 'dm')));
    assert.equal(new TextDecoder().decode(inner.find(f => f.no === 99).v), 'retained');
    assert.equal(inner.some(f => f.no === 3), false);
    assert.equal(v.calls.length, 0);
  });
}

test('engine=1 never overwrites nonzero header or trailer grpc status', async () => {
  for (const location of ['header', 'trailer']) {
    const v = fixture({ headers: { 'x-bili-moss-engine-type': '1' },
      responseHeaders: location === 'header' ? { 'grpc-status': '13' } : {},
      trailers: location === 'trailer' ? { 'grpc-status': '7' } : undefined });
    if (location === 'header') v.e.$httpClient.post = (o, cb) => cb(null, { status: 200, headers: { 'grpc-status': '13' }, h2_trailers: undefined }, v.body);
    await A.run(v.e); assert.deepEqual(v.done, [{}]);
  }
});

test('grpc timeout ignores late success and finishes only once', async () => {
  const v = fixture(); let late;
  v.e.$httpClient.post = (o, cb) => { v.calls.push({ method: 'POST', o }); late = cb; };
  const running = A.run(v.e); await flush();
  for (const t of [...v.timers.values()]) if (t.ms < 8500) t.fn();
  await running; assert.deepEqual(v.done, [{}]);
  late(null, { status: 200, headers: {}, h2_trailers: { 'grpc-status': '0' } }, v.body);
  await flush(); assert.deepEqual(v.done, [{}]);
});
