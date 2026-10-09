// GET /api/version -> 200 "<the deployed BUILD string>" (text/plain, no-store)
//
// The update watcher in index.html polls this once a minute and compares the answer with the BUILD
// it is running; on a mismatch the page reloads itself, so a Cloudflare deploy hard-refreshes
// every open browser (PC and mobile) within a minute of going live.
//
// The answer is read straight out of the DEPLOYED index.html through the Pages asset store
// (env.ASSETS), so it can never drift from the file the players actually get - there is no second
// copy of the build string to keep in sync. The response itself is no-store, so neither the
// browser nor an edge cache can serve a stale answer. No database, no writes, no auth: this is
// one of the cheapest calls on the free plan.

export const onRequestGet = async ({ request, env }) => {
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  try {
    const res = await env.ASSETS.fetch(new URL('/index.html', request.url));
    if (!res || !res.ok) return new Response('', { status: 200, headers });
    const html = await res.text();
    const m = html.match(/const BUILD='([^']+)'/);
    return new Response(m ? m[1] : '', { status: 200, headers });
  } catch (e) {
    // A static host without Functions answers 404 here; the watcher treats any failure as
    // "no update" and keeps playing, which is exactly the offline-first behaviour we want.
    return new Response('', { status: 200, headers });
  }
};
