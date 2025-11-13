# PakaNews Worker Configuration Guide

## Overview

The PakaNews translation worker is language-agnostic and can be configured to translate news to any language supported by DeepL. 

**Important:** The Umamusume official API returns news in **Japanese**. The `TARGET_LANGUAGE` environment variable determines what language to translate to via DeepL.

Translation caches are organized by language using KV namespace keys: `translation_{id}_{language}`.

**Default fallback:** If `TARGET_LANGUAGE` is not set, the worker defaults to `ja` (Japanese), which is the original language of the API data.

## Environment Variables

### Required Variables

- **`TARGET_LANGUAGE`** - DeepL target language code (e.g., `id` for Indonesian, `ja` for Japanese, `en` for English)
  - **Fallback:** `ja` (Japanese) - since Umamusume API is in Japanese
  - This means if you don't set `TARGET_LANGUAGE`, news will not be translated (returned as-is in Japanese)
- **`DEEPL_API_KEY`** - Your DeepL API key (use api-free endpoint for free tier keys containing `:fx`)
- **`ADMIN_SECRET`** - Secret for cache invalidation endpoint

## Local Development Setup

### 1. Create `.dev.vars` file in `workers/` directory:

```bash
cat > workers/.dev.vars <<EOF
TARGET_LANGUAGE=id
DEEPL_API_KEY=451511cc-cd50-436b-9210-954726df55ff:fx
ADMIN_SECRET=TokaiTeio
EOF
```

### 2. Start worker with wrangler:

```bash
cd workers
npx wrangler dev --local
```

Worker will be available at: `http://localhost:8787`

### 3. In separate terminal, start Vite dev server:

```bash
npm run dev
```

Vite will be available at: `http://localhost:5173`

## Production Deployment

### Option 1: Manual Deployment (Bash)

```bash
cd workers
export TARGET_LANGUAGE=id
export DEEPL_API_KEY="your-production-key"
export ADMIN_SECRET="your-production-secret"
npx wrangler deploy
```

Or use the provided deploy script:

```bash
./workers/deploy.sh id "your-deepl-key" "your-admin-secret"
```

### Option 2: GitHub Actions (Automated)

Set these secrets in GitHub repository settings:
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `DEEPL_API_KEY` - Your DeepL API key
- `ADMIN_SECRET` - Your admin secret

Push to `main` branch or manually trigger workflow:

```bash
git push origin main
```

The workflow in `.github/workflows/deploy-worker.yml` will:
1. Deploy worker with `TARGET_LANGUAGE=id`
2. Use secrets from GitHub Actions
3. Cache keys will be in format: `translation_{id}_id`

## Cache Management

### Cache Key Format

All translations are cached with keys: `translation_{id}_{language}`

The language code comes from the `TARGET_LANGUAGE` environment variable (or defaults to `ja` if not set).

Examples with different deployments:
- **Deployment with `TARGET_LANGUAGE=id`:** `translation_2907_id` (translated to Indonesian)
- **Deployment with `TARGET_LANGUAGE=ja`:** `translation_2907_ja` (returns as-is in Japanese)
- **Deployment with no `TARGET_LANGUAGE` set:** `translation_2907_ja` (defaults to Japanese)
- Indonesian: `translation_2907_id`
- Japanese: `translation_2907_ja`
- English: `translation_2907_en`

### Invalidate Specific Articles

```bash
curl -X POST http://localhost:8787/api/admin/invalidate?ids=2907,2908 \
  -H 'x-admin-secret: TokaiTeio'
```

### Clear All Cache (for a language)

To clear all translations for a specific language, you need to delete all keys matching `translation_*_{language}`. This requires direct KV access via Wrangler CLI:

```bash
# List all keys
npx wrangler kv:key list --binding=TRANSLATION_KV --namespace-id=8387fc78bdde4693865198cfc6e59215

# Delete specific key
npx wrangler kv:key delete "translation_2907_id" --binding=TRANSLATION_KV --namespace-id=8387fc78bdde4693865198cfc6e59215
```

## Supporting Multiple Languages

To add support for additional languages (e.g., Japanese), create separate workers or use environment-based deployments:

### Multi-language Setup (Advanced)

1. Create separate Cloudflare workers for each language
2. Each worker uses its own `TARGET_LANGUAGE` env var
3. All point to same KV namespace
4. Cache keys naturally partition by language

Example:
- Worker 1: `TARGET_LANGUAGE=id` → cache key: `translation_{id}_id`
- Worker 2: `TARGET_LANGUAGE=ja` → cache key: `translation_{id}_ja`
- Worker 3: `TARGET_LANGUAGE=en` → cache key: `translation_{id}_en`

All can read/write to same KV namespace without conflicts.

## Testing

### Health Check

```bash
curl http://localhost:8787/health
```

### Test Translation

```bash
curl "http://localhost:8787/api/translate?id=2907&nocache=1"
```

Response:
```json
{
  "title": "Translated title here",
  "message": "<translated HTML message>",
  "ts": 1699860000000,
  "translated": true,
  "source": "worker"
}
```

### Test Cache Invalidation

```bash
curl -X POST "http://localhost:8787/api/admin/invalidate?ids=2907" \
  -H 'x-admin-secret: TokaiTeio'
```

Response:
```json
{
  "ok": true,
  "results": {
    "2907": { "ok": true }
  }
}
```

## Troubleshooting

### DeepL Translation Not Working

Check worker logs for `[DEBUG]` messages:

```bash
# In toolbox, watch wrangler dev output
npx wrangler dev --local
```

Common issues:
1. **`deeplKeyAvailable=false`** - DEEPL_API_KEY not set in .dev.vars
   - Solution: Restart `wrangler dev` after updating .dev.vars
   
2. **`DeepL HTTP 401`** - Invalid API key
   - Solution: Verify key format and that it's in .dev.vars
   
3. **`DeepL HTTP 403`** - Quota exceeded or wrong endpoint
   - Solution: Check if using api-free endpoint for free tier keys

### Cache Not Updating

Add `?nocache=1` to bypass cache:

```bash
curl "http://localhost:8787/api/translate?id=2907&nocache=1"
```

## API Reference

### GET /api/list

Lists all news articles.

Query parameters:
- `per_page` - Items per page (default: 20)
- `page` - Page number (default: 1)
- `announce_label` - Filter by label: 0 (all), 1 (game only)

### GET /api/article

Gets single article detail.

Query parameters:
- `announce_id` - Article ID (required)

### GET /api/translate

Gets translated article with caching.

Query parameters:
- `id` - Article ID (required)
- `nocache` - Set to `1` to bypass cache (optional)

Response includes:
- `title` - Translated or original title
- `message` - Translated or original HTML message
- `ts` - Timestamp
- `translated` - Boolean indicating if translation was applied
- `source` - Source of data (`worker`, `official`, etc.)

### POST /api/admin/invalidate

Invalidates cached translations (requires authentication).

Query parameters:
- `ids` - Comma-separated article IDs
- `secret` - Admin secret (or use header)

Headers:
- `x-admin-secret` - Admin secret
