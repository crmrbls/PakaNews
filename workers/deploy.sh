#!/bin/bash
# Deploy worker with language-specific configuration
# Usage: ./deploy.sh [language] [deepl-key] [admin-secret]
# Example: ./deploy.sh id "451511cc-...:fx" "my-admin-secret"

set -e

LANGUAGE="${1:-id}"
DEEPL_KEY="${2:?DEEPL_API_KEY is required}"
ADMIN_SECRET="${3:?ADMIN_SECRET is required}"

echo "🚀 Deploying PakaNews worker..."
echo "   Language: $LANGUAGE"
echo "   DeepL Key: ${DEEPL_KEY:0:10}..."
echo "   Admin Secret: ${ADMIN_SECRET:0:5}..."

cd "$(dirname "$0")/workers"

# Export environment variables for wrangler
export TARGET_LANGUAGE="$LANGUAGE"
export DEEPL_API_KEY="$DEEPL_KEY"
export ADMIN_SECRET="$ADMIN_SECRET"

# Deploy worker
npx wrangler deploy

echo "✅ Deployment complete!"
echo "   Cache keys will use format: translation_{id}_${LANGUAGE}"
echo "   To invalidate cache, call: curl -X POST https://your-worker.workers.dev/api/admin/invalidate?ids=2907 -H 'x-admin-secret: $ADMIN_SECRET'"
