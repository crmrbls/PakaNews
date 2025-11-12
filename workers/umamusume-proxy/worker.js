/**
 * Simple Cloudflare Worker proxy for Umamusume official API.
 *
 * Routes:
 *  - GET /api/list?per_page=5&page=1&announce_label=1
 *      -> proxies to https://umamusume.jp/api/ajax/pr_info_index?format=json&per_page=...&page=...&announce_label=...
 *  - GET /api/article?announce_id=2907
 *      -> proxies to https://umamusume.jp/api/ajax/pr_info_detail?format=json&announce_id=...
 *  - GET /api/translate?id=2907&lang=id
 *      -> convenience endpoint that returns { title, message, ts }
 *         (currently returns original article fields; replace with Azure Translator call if you add credentials).
 *
 * Add CORS headers so the browser can call this worker from any origin.
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

const ORIGIN = 'https://umamusume.jp';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

async function proxyFetch(url) {
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: Object.assign({'Content-Type': res.headers.get('content-type') || 'application/json'}, corsHeaders())
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    if (url.pathname === '/api/list') {
      const per_page = url.searchParams.get('per_page') || '20';
      const page = url.searchParams.get('page') || '1';
      const announce_label = url.searchParams.get('announce_label') || '0';
      const target = `${ORIGIN}/api/ajax/pr_info_index?format=json&per_page=${encodeURIComponent(per_page)}&page=${encodeURIComponent(page)}&announce_label=${encodeURIComponent(announce_label)}`;
      return await proxyFetch(target);
    }

    if (url.pathname === '/api/article') {
      const announce_id = url.searchParams.get('announce_id');
      if (!announce_id) return new Response(JSON.stringify({ error: 'missing announce_id' }), { status: 400, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders()) });
      const target = `${ORIGIN}/api/ajax/pr_info_detail?format=json&announce_id=${encodeURIComponent(announce_id)}`;
      return await proxyFetch(target);
    }

    if (url.pathname === '/api/translate') {
      const id = url.searchParams.get('id');
      const lang = url.searchParams.get('lang') || 'id';
      if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders()) });

      // Fetch article detail from official API
      const target = `${ORIGIN}/api/ajax/pr_info_detail?format=json&announce_id=${encodeURIComponent(id)}`;
      const r = await fetch(target, { method: 'GET' });
      if (!r.ok) return new Response(JSON.stringify({ error: 'failed to fetch article' }), { status: 502, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders()) });
      const json = await r.json();
      const detail = json && json.detail ? json.detail : json;

      // By default, return the original title/message. Replace this block with Azure Translator call
      // if you want server-side translation. Example (pseudo-code):
      // const translated = await callAzureTranslate(detail.message, { to: lang });

      const payload = {
        title: detail.title || '',
        message: detail.message || '',
        ts: Date.now()
      };

      return new Response(JSON.stringify(payload), { status: 200, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders()) });
    }

    // Health
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('ok', { status: 200, headers: corsHeaders() });
    }

    return new Response('not found', { status: 404, headers: corsHeaders() });
  } catch (err) {
    return new Response(String(err || 'error'), { status: 500, headers: corsHeaders() });
  }
}
