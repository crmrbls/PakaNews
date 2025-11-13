// Translator client that calls the Cloudflare Worker translation endpoint.
// The worker base URL should be provided either via Vite env `VITE_TRANSLATOR_WORKER_URL`
// or stored in localStorage under `TRANSLATE_WORKER_URL`.
import type { Article } from "./types";
import { mapIndexItemToArticle, mapDetailToArticle } from './adapters/umamusume';

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
        return base ? base.replace(/\/+$/, '') : null;
    }

    public async fetchById(id: number | string) {
        const base = this.getBaseUrl();
        if (!base) {
            return Promise.reject(new Error('NO_TRANSLATION_WORKER: translator worker URL not configured'));
        }

        const url = `${base}/api/translate?id=${encodeURIComponent(String(id))}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
            const res = await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    /**
     * Fetch list of articles.
     */
    public async fetchList(count: number, offset: number, tab: number): Promise<Article[]> {
        const base = this.getBaseUrl();
        if (!base) {
            return Promise.reject(new Error('NO_TRANSLATION_WORKER: translator worker URL not configured'));
        }

        const page = Math.floor(offset / count) + 1;
        const label = tab === 1 ? 1 : 0;
        const url = `${base}/api/list?per_page=${encodeURIComponent(String(count))}&page=${encodeURIComponent(String(page))}&announce_label=${encodeURIComponent(String(label))}`;
        
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        try {
            const res = await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            
            const json = await res.json();
            if (json && Array.isArray(json.information_list)) {
                return json.information_list.map((it: any, idx: number) => mapIndexItemToArticle(it, idx));
            }
            if (Array.isArray(json)) {
                return json as Article[];
            }
            throw new Error('Invalid list payload from worker');
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    }

    /**
     * Fetch single article detail.
     */
    public async fetchArticle(id: number | string): Promise<Article> {
        const base = this.getBaseUrl();
        if (!base) {
            return Promise.reject(new Error('NO_TRANSLATION_WORKER: translator worker URL not configured'));
        }

        const url = `${base}/api/article?announce_id=${encodeURIComponent(String(id))}`;
        try {
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            const json = await res.json();
            if (json && json.detail) return mapDetailToArticle(json.detail);
            if (json && (json.title || json.message)) return mapDetailToArticle(json as any);
            throw new Error('Invalid article payload from worker');
        } catch (e) {
            throw e;
        }
    }

    // Deprecated: in-browser worker removed. Keep API that signals no local worker available.
    public translate(): Promise<string[]> {
        return Promise.reject('NO_IN_BROWSER_TRANSLATOR');
    }
}

const instance = new TranslatorClient();
export default instance;
