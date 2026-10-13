const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const A = require('../scripts/airborne');

const join = (...xs) => Buffer.concat(xs.map(x => Buffer.from(x)));
const gunzip = b => new Uint8Array(zlib.gunzipSync(b));
const seg = (segment, extra = {}) => ({ cid: '1', category: 'sponsor', actionType: 'skip', segment, ...extra });
const gzFrame = size => {
  const raw = zlib.gzipSync(Buffer.alloc(size, 7));
  return join(Uint8Array.of(1, (raw.length >>> 24) & 255, (raw.length >>> 16) & 255, (raw.length >>> 8) & 255, raw.length & 255), raw);
};
// Bounds regressions that would otherwise leave a promise pending forever.
const bounded = (promise, ms = 6000) => {
  let handle;
  const guard = new Promise((_, reject) => { handle = setTimeout(() => reject(Error('promise never settled: timer cleanup regression')), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(handle));
};

// --- Fix 2: normalize filters raw segments (minDuration keeps its raw meaning), merges raw
// overlaps, and only then applies the start offset once and converts merged ranges to ms.

test('regression normalize: raw filter, raw merge, single start offset, ms conversion', () => {
  const rows = [seg([10, 20]), seg([19, 30])];
  // Merged raw span [10,30]; the offset shifts the start only, the end stays unshifted.
  assert.deepEqual(A.normalize(rows, '1', A.config({ offset: 2 })), [[12000, 30000]]);
  assert.equal(A.normalize(rows, '1', A.config({ offset: 2 })).length, 1, 'overlapping raw pieces merge before offset');
  assert.deepEqual(A.normalize(rows, '1', A.config({ offset: 0 })), [[10000, 30000]]);
  assert.deepEqual(A.normalize(rows, '1', A.config({ offset: -4 })), [[6000, 30000]]);
});

test('regression normalize: minDuration applies to raw duration, never to the merged span', () => {
  const rows = [seg([10, 20]), seg([19, 30])];
  // Raw durations are 10s and 11s.
  assert.deepEqual(A.normalize(rows, '1', A.config({ offset: 0, minDuration: 11 })), [[19000, 30000]]);
  assert.deepEqual(A.normalize(rows, '1', A.config({ offset: 0, minDuration: 12 })), []);
  // The merged span is 20s long, but that must not resurrect sub-minimum raw pieces.
  assert.deepEqual(A.normalize(rows, '1', A.config({ offset: 0, minDuration: 20 })), []);
});

test('regression normalize: offset guard and ordering evaluated on merged ranges', () => {
  assert.deepEqual(A.normalize([seg([10, 30])], '1', { categories: ['sponsor'], min: 8, offset: 29 }), [],
    'start at or past the merged end drops the merged range');
  assert.deepEqual(
    A.normalize([seg([30, 40]), seg([60, 70]), seg([35, 50])], '1', { categories: ['sponsor'], min: 8, offset: 1 }),
    [[31000, 50000], [61000, 70000]],
    'merged ranges stay sorted by start after offset and ms conversion'
  );
});

// --- Fix 3: the sum of decompressed frame payloads must stay within the 4 MiB budget.

test('regression frames: cumulative inflated size is capped at MAX', () => {
  const half = 2621440; // 2.5 MiB, under MAX on its own
  assert.equal(A.frames(gzFrame(half), 'gzip', gunzip).length, 1);
  assert.throws(() => A.frames(join(gzFrame(half), gzFrame(half)), 'gzip', gunzip), /inflated size/);
  assert.throws(() => A.frames(join(gzFrame(half), gzFrame(half), gzFrame(1)), 'gzip', gunzip), /inflated size/);
  const identity = A.frame(A.f(1, 'x'));
  assert.equal(A.frames(join(identity, identity), 'identity').length, 2);
  const rawFrame = payload => join(Uint8Array.of(0, (payload.length >>> 24) & 255, (payload.length >>> 16) & 255, (payload.length >>> 8) & 255, payload.length & 255), payload);
  assert.equal(A.frames(join(gzFrame(2097152), gzFrame(2097152)), 'gzip', gunzip).length, 2, 'exactly MAX total is allowed');
  assert.throws(() => A.frames(join(gzFrame(half), rawFrame(Buffer.alloc(2097152, 9))), 'gzip', gunzip), /inflated size/);
});

// --- Fix 1: timer cleanup (missing or throwing clearTimeout) must never strand or reject the
// promise; `settled` alone must stop late callbacks.

function fixture({ clearTimeout = id => { timers.delete(id); }, argument = {} } = {}) {
  const calls = [], done = [], timers = new Map(), store = {};
  let id = 0;
  const body = A.frame(A.f(99, 'original'));
  const e = {
    $argument: argument,
    $request: { url: 'https://grpc.biliapi.net/bilibili.community.service.dm.v1.DM/DmSegMobile', method: 'POST', headers: {},
      body: A.frame(join(A.f(1, 170001), A.f(2, 456), A.f(3, 1), A.f(4, 1))) },
    $persistentStore: { read: k => store[k], write: (v, k) => { store[k] = v; return true; } },
    $httpClient: {
      get: (o, cb) => { calls.push({ method: 'GET', o }); cb(null, { status: 200 }, JSON.stringify([{ cid: '456', category: 'sponsor', actionType: 'skip', segment: [0, 114] }])); },
      post: (o, cb) => { calls.push({ method: 'POST', o }); cb(null, { status: 200, headers: { 'Content-Type': 'application/grpc' }, h2_trailers: { 'grpc-status': '0' } }, body); }
    },
    $done: o => done.push(o),
    setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimeout
  };
  return { e, calls, done, timers, body };
}

test('regression timers: throwing or missing clearTimeout still settles the http promise', async () => {
  const rejections = [];
  const listener = error => rejections.push(error);
  process.on('unhandledRejection', listener);
  try {
    const variants = [['baseline', id => {}], ['throwing', () => { throw Error('no cleanup interface'); }], ['missing', undefined]];
    for (const [name, clearTimeout] of variants) {
      const v = fixture({ clearTimeout });
      if (clearTimeout === undefined) delete v.e.clearTimeout;
      await bounded(A.run(v.e));
      assert.equal(v.done.length, 1, `${name}: exactly one $done`);
      assert.ok(v.done[0].response, `${name}: resolved work must not fall back to the watchdog`);
      assert.equal(v.calls.filter(c => c.method === 'POST').length, 1, `${name}: grpc re-request happened`);
      assert.equal(v.calls.filter(c => c.method === 'GET').length, 1, `${name}: cold query happened`);
      const injected = A.frames(v.done[0].response.body, 'identity')[0];
      assert.ok(A.fields(injected).some(f => f.no === 1), `${name}: injected airborne element present`);
    }
    assert.deepEqual(rejections, []);
  } finally { process.removeListener('unhandledRejection', listener); }
});

test('regression timers: timeout and watchdog cleanup stay exactly-once', async () => {
  const v = fixture({ clearTimeout: () => { throw Error('no cleanup interface'); } });
  let grpcCallback;
  v.e.$httpClient.post = (o, cb) => { v.calls.push({ method: 'POST', o }); grpcCallback = cb; };
  const running = A.run(v.e);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const watchdog = [...v.timers.values()].find(t => t.ms >= 8500);
  assert.ok(watchdog, 'watchdog timer registered');
  for (const t of [...v.timers.values()]) if (t.ms < 8500) t.fn();
  await bounded(running);
  assert.deepEqual(v.done, [{}], 'grpc timeout fails open without a replacement');
  watchdog.fn();
  grpcCallback(null, { status: 200, headers: {}, h2_trailers: { 'grpc-status': '0' } }, v.body);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.deepEqual(v.done, [{}], 'late callback and watchdog cannot finish twice');
});
