# PakaNews GitHub Actions Setup Guide

## Secrets Required in GitHub Repository

Go to: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

Add these secrets:

### 1. Cloudflare Credentials
- **Name:** `CLOUDFLARE_API_TOKEN`
  - Get from: https://dash.cloudflare.com/profile/api-tokens
  - Permissions: Worker Scripts (edit)
  
- **Name:** `CLOUDFLARE_ACCOUNT_ID`
  - Get from: https://dash.cloudflare.com/profile/api-tokens
  - It's your account ID

### 2. DeepL Credentials
- **Name:** `DEEPL_API_KEY`
  - Get from: https://www.deepl.com/account/keys
  - For free tier: key contains `:fx` suffix (e.g., `451511cc-....:fx`)
  - For pro tier: key without suffix

### 3. Worker Configuration
- **Name:** `ADMIN_SECRET`
  - Use a secure random string
  - Example: `openssl rand -hex 32`
  - Used for `/api/admin/invalidate` endpoint

## Workflow Configuration

The workflow in `.github/workflows/deploy-worker.yml`:
- Triggers on `push` to `main` branch (in `workers/` path)
- Automatically deploys worker with `TARGET_LANGUAGE=id` (Indonesian)
- Uses secrets from GitHub Actions

## Manual Deployment (without GitHub Actions)

If you prefer manual deployment:

```bash
cd workers

# Export secrets
export CLOUDFLARE_API_TOKEN="your-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export TARGET_LANGUAGE="id"
export DEEPL_API_KEY="your-deepl-key"
export ADMIN_SECRET="your-admin-secret"

# Deploy
npx wrangler deploy
```

## Testing Deployment

After deployment, test the worker:

```bash
# Test translation endpoint
curl "https://your-worker.workers.dev/api/translate?id=2907&nocache=1"

# Test list endpoint
curl "https://your-worker.workers.dev/api/list?page=1&per_page=5"

# Test admin invalidate
curl -X POST "https://your-worker.workers.dev/api/admin/invalidate?ids=2907" \
  -H "x-admin-secret: your-admin-secret"
```

## Multi-language Deployment

To deploy multiple language variants:

### Option 1: Modify Workflow
Edit `.github/workflows/deploy-worker.yml` and add matrix:

```yaml
strategy:
  matrix:
    language: [id, ja, en]
env:
  TARGET_LANGUAGE: ${{ matrix.language }}
```

### Option 2: Manual Deployment
```bash
# Indonesian
TARGET_LANGUAGE=id npx wrangler deploy

# Japanese
TARGET_LANGUAGE=ja npx wrangler deploy

# English
TARGET_LANGUAGE=en npx wrangler deploy
```

**Note:** All variants use the same KV namespace, cache keys partition by language.

## Troubleshooting

### Deployment fails with "unauthorized"
- Verify `CLOUDFLARE_API_TOKEN` is correct
- Verify `CLOUDFLARE_ACCOUNT_ID` is correct
- Ensure token has "Worker Scripts (edit)" permission

### Translation returns `translated: false`
- Verify `DEEPL_API_KEY` is set
- For free tier, ensure key contains `:fx` suffix
- Check wrangler logs: `wrangler tail`

### Cache keys different than expected
- Verify `TARGET_LANGUAGE` is set in GitHub secrets or environment
- Check deployment logs for `[DEBUG]` output

## File Structure

Important files for CI/CD:
```
.github/workflows/
  └── deploy-worker.yml          # GitHub Actions workflow
workers/
  ├── .dev.vars.template          # Template (commit this)
  ├── .dev.vars                   # Local secrets (DO NOT COMMIT)
  ├── wrangler.toml               # Worker config (commit this)
  ├── CONFIG.md                   # Setup documentation
  ├── deploy.sh                   # Manual deploy script
  └── src/
      └── worker.js               # Worker source code
```

## Quick Start Checklist

- [ ] Create GitHub secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DEEPL_API_KEY, ADMIN_SECRET)
- [ ] Push to `main` branch with changes in `workers/` folder
- [ ] Workflow automatically deploys worker
- [ ] Test worker endpoint with curl
- [ ] Verify cache is working with `?nocache=1` parameter
- [ ] Test admin invalidation endpoint
