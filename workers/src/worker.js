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

// Allowed origins for CORS
// Only allow GitHub Pages domain and localhost for development
const ALLOWED_ORIGINS = [
  'https://crmrbls.github.io',      // GitHub Pages (production)
  'http://localhost:5173',           // Local dev (Vite default)
  'http://localhost:3000',           // Alternative local dev
  'http://127.0.0.1:5173',           // IPv4 localhost
];

function corsHeaders(origin = '*') {
  // Check if origin is allowed
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const allowedOrigin = isAllowed ? origin : 'null';
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',  // 24 hours
    'Vary': 'Origin'
  };
}

async function proxyFetch(url, requestOrigin = '*') {
  // Add common browser headers to reduce chance the origin blocks the request.
  // Some sites return 403 when requests look like automated bots or lack a Referer.
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Referer': ORIGIN,
      'User-Agent': 'Mozilla/5.0 (compatible; PakaNews/1.0)',
      'Accept': 'application/json, text/html, */*'
    }
  });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: Object.assign({'Content-Type': res.headers.get('content-type') || 'application/json'}, corsHeaders(requestOrigin))
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // Extract origin from request header
  const requestOrigin = request.headers.get('Origin') || '*';

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(requestOrigin) });
  }

  try {
    if (url.pathname === '/api/list') {
      const per_page = url.searchParams.get('per_page') || '20';
      const page = url.searchParams.get('page') || '1';
      const announce_label = url.searchParams.get('announce_label') || '0';
      const target = `${ORIGIN}/api/ajax/pr_info_index?format=json&per_page=${encodeURIComponent(per_page)}&page=${encodeURIComponent(page)}&announce_label=${encodeURIComponent(announce_label)}`;
      return await proxyFetch(target, requestOrigin);
    }

    if (url.pathname === '/api/article') {
      const announce_id = url.searchParams.get('announce_id');
      if (!announce_id) return new Response(JSON.stringify({ error: 'missing announce_id' }), { status: 400, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
      const target = `${ORIGIN}/api/ajax/pr_info_detail?format=json&announce_id=${encodeURIComponent(announce_id)}`;
      return await proxyFetch(target, requestOrigin);
    }

    if (url.pathname === '/api/translate') {
  const id = url.searchParams.get('id');
  // Get target language from environment; ignore client-specified lang to avoid abuse
  // This prevents attackers from forcing translations to other languages and consuming DeepL/worker resources.
  // Default fallback to 'JA' (Japanese) since Umamusume API responses are in Japanese
  const targetLanguage = (typeof TARGET_LANGUAGE !== 'undefined') ? String(TARGET_LANGUAGE).toUpperCase() : 'JA';
  const requestedLang = url.searchParams.get('lang');
  if (requestedLang && String(requestedLang).toUpperCase() !== targetLanguage) {
        console.warn(`Ignored client-specified lang='${requestedLang}'. Worker enforces '${targetLanguage}'.`);
      }
      if (!id) return new Response(JSON.stringify({ error: 'missing id' }), { status: 400, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });

      // CACHING + TRANSLATION FLOW
      // 1) Try KV cache (TRANSLATION_KV) if bound (skip if ?nocache=1)
      // 2) If cache miss and DEEPL_API_KEY is bound -> call DeepL and store result in KV
      // 3) If no key or DeepL fails, return original article fields (translated: false)

  const cacheKey = `translation_${id}_${targetLanguage.toLowerCase()}`;
  const nocache = url.searchParams.get('nocache') === '1';

      // helper: build JSON response
      const makeResp = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });

      // 1) Try KV cache (if available, unless ?nocache=1)
      if (!nocache) {
        try {
          if (typeof TRANSLATION_KV !== 'undefined' && TRANSLATION_KV) {
            const cached = await TRANSLATION_KV.get(cacheKey);
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                console.log(`[DEBUG] Cache hit for ${cacheKey}`);
                return makeResp(parsed);
              } catch (e) {
                // fallthrough to fetch & refresh cache
              }
            }
          }
        } catch (e) {
          // KV read error: continue to attempt translation/fetch
          console.warn('TRANSLATION_KV read failed', e);
        }
      } else {
        console.log(`[DEBUG] Cache bypass: ?nocache=1`);
      }

      // Fetch article detail from official API
      const target = `${ORIGIN}/api/ajax/pr_info_detail?format=json&announce_id=${encodeURIComponent(id)}`;
      const r = await fetch(target, { method: 'GET', headers: { 'Referer': ORIGIN, 'User-Agent': 'Mozilla/5.0 (compatible; PakaNews/1.0)', 'Accept': 'application/json, text/html, */*' } });
      if (!r.ok) {
        // capture a short snippet of origin body to help debugging (trim to 2k chars)
        let bodyText = '';
        try { bodyText = (await r.text()).slice(0, 2000); } catch (e) { bodyText = ''; }
        const payload = { error: 'failed to fetch article', origin_status: r.status, origin_statusText: r.statusText, origin_body_snippet: bodyText };
        return new Response(JSON.stringify(payload), { status: 502, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
      }
      const json = await r.json();
      const detail = json && json.detail ? json.detail : json;

      const titlePlain = detail.title || '';
      const messageHtml = detail.message || '';

      // If DeepL key available, call DeepL; otherwise return original payload
      const deeplKey = (typeof DEEPL_API_KEY !== 'undefined') ? DEEPL_API_KEY : null;
      console.log(`[DEBUG /api/translate] id=${id}, deeplKeyAvailable=${!!deeplKey}, titleLen=${titlePlain.length}, messageLen=${messageHtml.length}`);
      
      let payload = {
        title: titlePlain,
        message: messageHtml,
        ts: Date.now(),
        translated: false,
        source: 'worker'
      };

      if (deeplKey) {
        try {
          // Use Authorization header + JSON body (DeepL recommended format)
          // Key contains ':fx' -> use api-free, otherwise use api
          const deeplBase = (typeof deeplKey === 'string' && deeplKey.includes(':fx')) ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
          console.log(`[DEBUG] DeepL endpoint selected: ${deeplBase}, keyHasFxSuffix=${deeplKey.includes(':fx')}`);
          
          const translateText = async (text, isHtml = false) => {
            const body = {
              text: [text || ''],
              target_lang: targetLanguage
            };
            if (isHtml) {
              body.tag_handling = 'html';
            }

            console.log(`[DEBUG] Translating text (length=${text?.length || 0}), isHtml=${isHtml}`);
            const resp = await fetch(deeplBase, {
              method: 'POST',
              headers: {
                'Authorization': `DeepL-Auth-Key ${deeplKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(body)
            });
            console.log(`[DEBUG] DeepL response: status=${resp.status}, ok=${resp.ok}`);
            
            if (!resp.ok) {
              const txt = await resp.text().catch(() => '(no body)');
              console.error(`[ERROR] DeepL HTTP ${resp.status} ${resp.statusText}: ${txt.slice(0, 500)}`);
              throw new Error(`DeepL HTTP ${resp.status} ${resp.statusText} ${txt}`);
            }
            const j = await resp.json();
            console.log(`[DEBUG] DeepL response JSON: translations=${j && Array.isArray(j.translations) ? j.translations.length : 0}`);
            return j && Array.isArray(j.translations) && j.translations[0] && j.translations[0].text ? j.translations[0].text : text;
          };

          const [tTitle, tMessage] = await Promise.all([
            translateText(titlePlain, false),
            translateText(messageHtml, true)
          ]);

          payload = {
            title: tTitle || titlePlain,
            message: tMessage || messageHtml,
            ts: Date.now(),
            translated: true,
            source: 'worker'
          };

          // store in KV if available (TTL: 7 days)
          try {
            if (typeof TRANSLATION_KV !== 'undefined' && TRANSLATION_KV) {
              await TRANSLATION_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 7 });
            }
          } catch (e) {
            console.warn('TRANSLATION_KV put failed', e);
          }

          return makeResp(payload);
        } catch (e) {
          console.error('DeepL translation failed', e);
          // fall through and return original payload (translated: false)
        }
      }

      // No DeepL key or translation failed: return original payload (and do not cache translated)
      return makeResp(payload);
    }

    // Health
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('ok', { status: 200, headers: corsHeaders(requestOrigin) });
    }

    // Admin: invalidate translation cache
    // Protected by ADMIN_SECRET binding. Client must supply header `x-admin-secret: <secret>`
    if (url.pathname === '/api/admin/invalidate') {
      // Require ADMIN_SECRET to be configured
      if (typeof ADMIN_SECRET === 'undefined' || !ADMIN_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'ADMIN_SECRET_NOT_CONFIGURED' }), { status: 403, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
      }

      const provided = request.headers.get('x-admin-secret') || url.searchParams.get('secret');
      if (!provided || provided !== ADMIN_SECRET) {
        return new Response(JSON.stringify({ ok: false, error: 'INVALID_ADMIN_SECRET' }), { status: 403, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
      }

      // Accept single id or comma-separated ids
      const idsParam = url.searchParams.get('ids') || url.searchParams.get('id');
      if (!idsParam) {
        return new Response(JSON.stringify({ ok: false, error: 'missing id(s)' }), { status: 400, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
      }

      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      const results = {};

      if (typeof TRANSLATION_KV === 'undefined' || !TRANSLATION_KV) {
        return new Response(JSON.stringify({ ok: false, error: 'TRANSLATION_KV_NOT_CONFIGURED' }), { status: 501, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
      }

      // Get target language for cache key matching (default to 'ja' - Umamusume API is in Japanese)
      const adminTargetLang = (typeof TARGET_LANGUAGE !== 'undefined') ? String(TARGET_LANGUAGE).toLowerCase() : 'ja';

      for (const id of ids) {
        const key = `translation_${id}_${adminTargetLang}`;
        try {
          await TRANSLATION_KV.delete(key);
          results[id] = { ok: true };
        } catch (e) {
          results[id] = { ok: false, error: String(e) };
        }
      }

      return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: Object.assign({'Content-Type':'application/json'}, corsHeaders(requestOrigin)) });
    }

    return new Response('not found', { status: 404, headers: corsHeaders(requestOrigin) });
  } catch (err) {
    return new Response(String(err || 'error'), { status: 500, headers: corsHeaders(requestOrigin) });
  }
}
