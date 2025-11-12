Cloudflare Worker proxy for Umamusume API

This worker proxies three endpoints for the client:

- /api/list?per_page=...&page=...&announce_label=...
  -> proxies to https://umamusume.jp/api/ajax/pr_info_index?format=json&per_page=...&page=...&announce_label=...

- /api/article?announce_id=...
  -> proxies to https://umamusume.jp/api/ajax/pr_info_detail?format=json&announce_id=...

- /api/translate?id=...&lang=...
  -> returns { title, message, ts } from the article detail. By default this returns the original fields. Replace the translation block with calls to Azure Translator or another service and add caching (KV) if desired.

Usage

1) Local development with Wrangler (recommended):

- Install wrangler: https://developers.cloudflare.com/workers/wrangler/install
- In this folder (`workers/umamusume-proxy`) create a `wrangler.toml` with your account id and name.
- Run `wrangler dev` to run the worker locally on https://127.0.0.1:8787 by default.

2) Deploy

- Use `wrangler publish` to deploy to Cloudflare and take note of the worker URL (e.g. https://your-worker.example.workers.dev).
- In the client, set the worker base URL (for dev/test) with:

  localStorage.setItem('TRANSLATE_WORKER_URL','https://your-worker.example.workers.dev')

Notes & next steps

- For production translation, add Azure Translator integration in `/api/translate` and store results in Cloudflare KV for caching.
- The worker returns `Access-Control-Allow-Origin: *` to simplify client calls. If you prefer restricted origins, change the header.
- This worker is intentionally small and pass-through for easy auditing.
