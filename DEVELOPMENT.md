# PakaNews Development Checklist

## Pre-commit Verification

Before committing changes, verify:

### Files That SHOULD Be Committed
- ✅ `src/` - All TypeScript/CSS/HTML source files
- ✅ `workers/src/worker.js` - Worker source code
- ✅ `workers/wrangler.toml` - Wrangler configuration
- ✅ `workers/.dev.vars.template` - Environment variable template
- ✅ `workers/deploy.sh` - Deployment script
- ✅ `workers/CONFIG.md` - Configuration documentation
- ✅ `.github/workflows/deploy-worker.yml` - GitHub Actions workflow
- ✅ `.github/DEPLOYMENT.md` - Deployment guide
- ✅ `.gitignore` - Git ignore rules
- ✅ `package.json`, `tsconfig.json`, `vite.config.ts` - Project config
- ✅ `README.md` - Project documentation

### Files That Should NOT Be Committed
- ❌ `workers/.dev.vars` - Contains secrets (API keys, admin secret)
- ❌ `.env.local` - Contains secrets (worker URL for dev)
- ❌ `node_modules/` - Dependencies (handled by package.json)
- ❌ `workers/.wrangler/` - Wrangler build artifacts
- ❌ `dist/`, `workers/dist/` - Build output
- ❌ `.DS_Store`, `Thumbs.db` - OS-specific files
- ❌ `.vscode/*` (except `.vscode/extensions.json`) - Editor settings
- ❌ `*.log`, `npm-debug.log*` - Log files

## Development Workflow

### 1. Local Setup
```bash
# Clone repository
git clone <repo-url>
cd PakaNews

# Install main dependencies
npm install

# Create local environment files
cp .env.local.template .env.local  # If exists
cd workers
cp .dev.vars.template .dev.vars
# Edit .dev.vars and add your credentials
```

### 2. Development Server (in toolbox container)
```bash
# Terminal 1: Start worker
cd workers
npx wrangler dev --local

# Terminal 2: Start Vite dev server
npm run dev

# Browser: http://localhost:5173
```

### 3. Testing Before Commit
```bash
# Check TypeScript
npm run build  # This runs: tsc && vite build

# Verify no lint errors
npm run build

# Test worker endpoints
curl "http://localhost:8787/api/translate?id=2907&nocache=1"
```

### 4. Git Workflow
```bash
# Check git status
git status

# Verify .gitignore is working (no .dev.vars, .env.local shown)
git ls-files | grep -E "\.dev\.vars|\.env\.local"

# Stage changes
git add .

# Commit with clear message
git commit -m "feat: add translation caching with TARGET_LANGUAGE env var"

# Push to branch
git push origin feature-branch
```

## Pre-deployment Checklist

Before merging to `main`:

- [ ] All TypeScript files pass strict mode (`npm run build`)
- [ ] No console.log or debug code left behind
- [ ] Secrets are NOT in any committed files
- [ ] `workers/.dev.vars` is in `.gitignore`
- [ ] `.env.local` is in `.gitignore`
- [ ] `workers/.wrangler/` is in `.gitignore`
- [ ] Documentation is updated (CONFIG.md, etc.)
- [ ] Test with `?nocache=1` to verify fresh translation
- [ ] Admin invalidate endpoint tested with correct secret

## Deployment Checklist

Before pushing to `main`:

- [ ] GitHub secrets are set (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DEEPL_API_KEY, ADMIN_SECRET)
- [ ] All changes in `workers/` folder are tested locally
- [ ] Workflow will trigger automatically on push to `main`
- [ ] Monitor GitHub Actions logs for successful deployment
- [ ] Test production worker endpoint after deployment

## File Size Limits

- Worker script: ≤ 1 MB (Cloudflare free tier)
- KV value: ≤ 25 MB per item
- KV namespace: ≤ 100,000 items (reasonable limit)

## Performance Optimization

- Translation cache is 7 days TTL
- Multiple languages use same KV namespace (no conflicts)
- Admin invalidate allows selective cache clearing
- `?nocache=1` parameter forces fresh translation

## Common Issues

### Issue: `.dev.vars` showing as modified in git
**Solution:** Already added to `.gitignore`. Run `git rm --cached workers/.dev.vars` then `git commit -m "remove .dev.vars from tracking"`

### Issue: Worker URL not found in development
**Solution:** Set `VITE_TRANSLATOR_WORKER_URL=http://localhost:8787` in `.env.local`

### Issue: DeepL translation not working
**Solution:** Verify `DEEPL_API_KEY` is set in `.dev.vars` and wrangler dev is restarted

### Issue: Cache not clearing after update
**Solution:** Use `?nocache=1` parameter or call `/api/admin/invalidate` endpoint

## Reference Commands

```bash
# Local development
npm run dev                    # Start Vite dev server
cd workers && npx wrangler dev --local  # Start worker

# Build for production
npm run build                  # TypeScript check + Vite build

# Deploy worker
cd workers && npx wrangler deploy

# Manual deployment with language
cd workers
TARGET_LANGUAGE=id npx wrangler deploy

# Check git status
git status

# Verify .dev.vars not tracked
git ls-files | grep dev.vars  # Should return nothing

# View recent commits
git log --oneline -10
```
