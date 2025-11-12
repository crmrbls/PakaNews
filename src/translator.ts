// Translator client that calls an external translation endpoint (Cloudflare Worker).
// The worker base URL should be provided either via Vite env `VITE_TRANSLATOR_WORKER_URL`
// or stored in localStorage under `TRANSLATE_WORKER_URL`.

class TranslatorClient {
    private getBaseUrl(): string | null {
        const envUrl = (import.meta as any).env?.VITE_TRANSLATOR_WORKER_URL;
        let stored: string | null = null;
        try {
            stored = typeof localStorage !== 'undefined' ? localStorage.getItem('TRANSLATE_WORKER_URL') : null;
        } catch (e) {
            stored = null;
        }

        const base = (envUrl || stored || '') as string;
        if (base) return base.replace(/\/+$/, '');

        // Development convenience: if running on localhost, default to the local mock worker.
        try {
            if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
                return 'http://localhost:8787';
            }
        } catch (e) {
            // ignore
        }

        return null;
    }

    public async fetchById(id: number | string, lang = 'id') {
        const base = this.getBaseUrl();
        if (!base) return Promise.reject('NO_TRANSLATE_WORKER_URL');
        const url = `${base}/api/translate?id=${encodeURIComponent(String(id))}&lang=${encodeURIComponent(lang)}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
            const txt = await res.text().catch(()=>'');
            return Promise.reject(`HTTP ${res.status} ${res.statusText} ${txt}`);
        }
        return res.json();
    }

    /**
     * Dev helper: if the configured worker is unreachable, remove any
     * stored translations that look like mock responses (contain "(mock-" or "(mock)").
     * This prevents mock translations from persisting in localStorage when
     * the local mock worker has been stopped during development.
     */
    public async cleanupMockEntries(timeoutMs = 2000): Promise<boolean> {
        const base = this.getBaseUrl();
        if (!base) return false;

        // Ping worker health endpoint quickly. Use a short timeout and abort
        // if it doesn't respond. If the worker responds, we keep localStorage as-is.
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            // try /health then fallback to root
            let ok = false;
            try {
                const r = await fetch(base + '/health', { method: 'GET', signal: controller.signal });
                ok = r.ok;
            } catch (_) {
                try {
                    const r2 = await fetch(base + '/', { method: 'GET', signal: controller.signal });
                    ok = r2.ok;
                } catch (_) {
                    ok = false;
                }
            }
            clearTimeout(timer);
            if (ok) return true; // worker alive
        } catch (e) {
            // unreachable or timed out — proceed to cleanup
        }

        // Worker appears unreachable. Remove any obviously-mock entries from localStorage.
        try {
            if (typeof localStorage === 'undefined') return false;
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k) keys.push(k);
            }

            const toRemove: string[] = [];
            for (const key of keys) {
                if (!key.startsWith('translation_')) continue;
                const val = localStorage.getItem(key);
                if (!val) continue;
                // conservative detection: mock worker marks payload with (mock- or (mock)
                if (val.includes('(mock-') || val.includes('(mock)')) toRemove.push(key);
            }

            for (const k of toRemove) localStorage.removeItem(k);
            return toRemove.length > 0;
        } catch (e) {
            // ignore storage errors
            return false;
        }
    }

    // Deprecated: in-browser worker removed. Keep API that signals no local worker available.
    public translate(): Promise<string[]> {
        return Promise.reject('NO_IN_BROWSER_TRANSLATOR');
    }
}

const instance = new TranslatorClient();
export default instance;
