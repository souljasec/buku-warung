// Cloud copy of the warung book: one JSON document in Workers KV, for one warung.
//   GET /api/book  -> { version, at, book } (version 0 and book null when empty)
//   PUT /api/book  -> body: book JSON, header If-Match: <version this device last saw>; 409 when the cloud is newer
// Auth: Authorization: Bearer <SYNC_TOKEN secret>. Everything else is the static app in ./web.

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function authorized(request, env) {
  const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const want = env.SYNC_TOKEN || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/book') return env.ASSETS.fetch(request);
    if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);

    const { value, metadata } = await env.BOOK.getWithMetadata('book');
    const current = metadata?.version || 0;

    if (request.method === 'GET') return json({ version: current, at: metadata?.at || null, book: value ? JSON.parse(value) : null });

    if (request.method === 'PUT') {
      if (Number(request.headers.get('if-match')) !== current) return json({ error: 'conflict', version: current }, 409);
      const text = await request.text();
      let book;
      try { book = JSON.parse(text); } catch { return json({ error: 'not json' }, 400); }
      if (book?.v !== 1 || !Array.isArray(book.moves)) return json({ error: 'not a warung book' }, 400);
      const at = new Date().toISOString(), version = current + 1;
      await env.BOOK.put('book', text, { metadata: { version, at } });
      // one dated copy per day, kept 30 days: a way back if something gets overwritten
      const dayKey = `day:${at.slice(0, 10)}`;
      if (!(await env.BOOK.get(dayKey, { cacheTtl: 3600 }))) await env.BOOK.put(dayKey, text, { expirationTtl: 30 * 86400 });
      return json({ version, at });
    }
    return json({ error: 'method not allowed' }, 405);
  },
};
