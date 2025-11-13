# PakaNews Worker Deployment Guide

This document explains how to deploy the PakaNews Cloudflare Worker with proper environment configuration.

## Overview

The PakaNews Worker (`workers/src/worker.js`) is deployed to Cloudflare Workers and handles:
- **Proxy:** Requests to Umamusume official API
- **Translation:** DeepL translation service integration
- **Caching:** Translation results in Cloudflare KV

## Environment Variables & Secrets

The Worker requires three secrets:

| Secret | Purpose | Example |
|--------|---------|---------|
| `TARGET_LANGUAGE` | DeepL target language code | `id`, `ja`, `en` |
| `DEEPL_API_KEY` | DeepL API authentication key | `xxx:fx` (free tier) or `xxx` (pro) |
| `ADMIN_SECRET` | Secret for cache invalidation endpoint | `your-secret-key` |

### Where Secrets Are Stored

- **Local Dev:** `.dev.vars` file (git-ignored)
- **Production:** Cloudflare Secrets (set via `wrangler secret put` or GitHub Actions)

---

## Deployment Methods

### Method 1: GitHub Actions (Recommended for CI/CD)

The workflow in `.github/workflows/deploy-worker.yml` automatically:

1. Checks out code when `workers/**` changes
2. Sets up secrets via `wrangler secret put`
3. Deploys to Cloudflare Workers

**Prerequisites:**

Add these secrets to your GitHub repository settings:
- `CLOUDFLARE_API_TOKEN` — Get from [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
- `CLOUDFLARE_ACCOUNT_ID` — Get from [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
- `DEEPL_API_KEY` — Get from [DeepL API Console](https://www.deepl.com/pro-api)
- `ADMIN_SECRET` — Choose a strong secret

**Steps to set up GitHub Secrets:**

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret" and add each of the above
3. Push a change to `workers/` directory to trigger deployment

Example:
```bash
git add workers/
git commit -m "Update worker"
git push origin main
```

---

### Method 2: Local Deployment (Manual)

Deploy from your local machine:

1. **Create `.dev.vars`** (for local dev testing):
   ```
   TARGET_LANGUAGE=id
   DEEPL_API_KEY=your-key-here:fx
   ADMIN_SECRET=dev-secret
   ```

2. **Install Wrangler:**
   ```bash
   npm install -g wrangler
   # or via pnpm:
   pnpm add -g wrangler
   ```

3. **Authenticate with Cloudflare:**
   ```bash
   wrangler login
   # Opens browser to authenticate
   ```

4. **Set Production Secrets:**
   ```bash
   cd workers
   wrangler secret put TARGET_LANGUAGE
   # Paste: id
   
   wrangler secret put DEEPL_API_KEY
   # Paste: your-deepl-key:fx
   
   wrangler secret put ADMIN_SECRET
   # Paste: your-secret
   ```

5. **Deploy:**
   ```bash
   wrangler deploy
   ```

6. **Verify Deployment:**
   ```bash
   curl https://pakanews.workers.dev/health
   # Should return: "ok"
   ```

---

### Method 3: Environment Variables (Alternative)

If you prefer setting secrets via environment variables before deployment:

```bash
cd workers

# Export secrets
export TARGET_LANGUAGE="id"
export DEEPL_API_KEY="your-key:fx"
export ADMIN_SECRET="your-secret"

# Deploy (will use exported env vars)
wrangler deploy
```

**Note:** This method requires secrets to be passed at deploy time. GitHub Actions workflow is more secure.

---

## Configuration Details

### wrangler.toml

Key bindings:
- **`TRANSLATION_KV`** — Cloudflare KV namespace for caching (ID: `8387fc78...`)
- **Secrets** — Automatically injected by Cloudflare runtime

### Cache Key Format

Translations are cached with keys:
```
translation_{announce_id}_{language}
```

Examples:
- `translation_2907_id` — Article 2907 translated to Indonesian
- `translation_2907_ja` — Article 2907 in Japanese (original)
- `translation_2907_en` — Article 2907 translated to English

Cache TTL: **7 days**

---

## Testing the Worker

### Health Check
```bash
curl https://pakanews.workers.dev/health
# Response: ok
```

### Test API Endpoints

**List Articles:**
```bash
curl "https://pakanews.workers.dev/api/list?per_page=5&page=1"
```

**Get Article Detail:**
```bash
curl "https://pakanews.workers.dev/api/article?announce_id=2907"
```

**Translate Article:**
```bash
curl "https://pakanews.workers.dev/api/translate?id=2907"
```

**Invalidate Cache (Admin Only):**
```bash
curl -X POST "https://pakanews.workers.dev/api/admin/invalidate?id=2907" \
  -H "x-admin-secret: your-admin-secret"
```

---

## Troubleshooting

### Secrets Not Working

**Symptom:** Worker returns `ADMIN_SECRET_NOT_CONFIGURED`

**Solution:**
```bash
# Check if secrets are set
wrangler secret list

# Re-set secrets
wrangler secret put TARGET_LANGUAGE <<< "id"
wrangler secret put DEEPL_API_KEY <<< "your-key:fx"
wrangler secret put ADMIN_SECRET <<< "your-secret"

# Redeploy
wrangler deploy
```

### Translation Not Working

**Symptom:** `/api/translate` returns `translated: false`

**Possible causes:**
1. `DEEPL_API_KEY` not set or invalid
2. DeepL API quota exceeded
3. `TARGET_LANGUAGE` not set (defaults to 'JA')

**Solution:**
```bash
# Check logs
wrangler tail

# Verify API key at DeepL Console
# Check quota: https://www.deepl.com/pro-api
```

### KV Cache Not Working

**Symptom:** Cache invalidation endpoint returns error

**Solution:**
```bash
# Check KV namespace binding
cat wrangler.toml | grep -A3 kv_namespaces

# Verify KV exists in Cloudflare Dashboard
# Workers → KV → Check namespace ID
```

---

## Local Development

### Development Mode

```bash
cd workers
wrangler dev
```

This starts a local Worker on `http://localhost:8787`

### Test with .dev.vars

Create `workers/.dev.vars`:
```
TARGET_LANGUAGE=id
DEEPL_API_KEY=your-free-key:fx
ADMIN_SECRET=dev-secret
```

Now `wrangler dev` will use these values locally.

---

## Security Best Practices

1. **Never commit secrets** — Use `.dev.vars` (git-ignored) for local dev
2. **Use Cloudflare Secrets** — Not environment variables exposed in logs
3. **Rotate API keys** — Change `DEEPL_API_KEY` periodically
4. **Strong `ADMIN_SECRET`** — Use a strong, random string
5. **Limit DEEPL quota** — Monitor API usage at [DeepL Console](https://www.deepl.com/pro-api)

---

## Production Checklist

Before pushing to production:

- [ ] GitHub Secrets set up (API token, account ID, DeepL key, admin secret)
- [ ] Cloudflare Secrets verified via `wrangler secret list`
- [ ] Worker deployed successfully via GitHub Actions
- [ ] Health check passes: `curl https://pakanews.workers.dev/health`
- [ ] Test endpoints working
- [ ] KV cache enabled and working
- [ ] Admin invalidation endpoint protected

---

## Further Reading

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare KV Storage](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [DeepL API Docs](https://www.deepl.com/docs/api/)
