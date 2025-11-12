import Utils from "./utils";
import Loader from "./loader";
import Unity from "./unity";
import type { Article } from "./types";
import DOMPurify from "dompurify";
import Translator from './translator';

const contentsInner = document.getElementById("contentsInner")!;
const label = document.getElementById("label")!;
const postTime = document.getElementById("postTime")!;
const title = document.getElementById("title")!;
const message = document.getElementById("message")!;

async function getArticle(): Promise<Article> {
    const idParam = new URLSearchParams(location.search).get("id");
    if (!idParam) throw new Error("No id specified");
    const id = Number(idParam);
    if (isNaN(id)) throw new Error("Invalid id");

    const storedArticleItem = sessionStorage.getItem("article");
    if (storedArticleItem) {
        let article: Article = JSON.parse(storedArticleItem);
        if (article.announce_id == id) return article;
    }

    const res = await fetch("https://umapyoi.net/api/v1/news/" + id);
    return await res.json();
}

async function init() {
    Unity.call("showBackButton");

    // Clean up mock translations if worker is unreachable (dev convenience)
    try { await Translator.cleanupMockEntries().catch(()=>{}); } catch(e) {}

    const article = await getArticle();

    label.style.backgroundColor = article.label_color;
    label.innerText = article.label_name_en;

    postTime.innerText = Utils.formatTimestamp(article.post_at);
    // Prefer translated content when available, otherwise fall back to English.
    const targetLang = 'id';
    let titleText = article.title_english;
    let messageHTML = article.message_english;

    try {
        const key = `translation_${article.announce_id}_${targetLang}`;
        const stored = ((): string | null => { try { return localStorage.getItem(key); } catch(e) { return null; } })();
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed.title) titleText = parsed.title;
                if (parsed.message) messageHTML = parsed.message;
            } catch (e) {
                // malformed stored value — fall through to attempt on-demand translation
            }
        }

        if (!stored) {
            // attempt on-demand translation via Cloudflare Worker endpoint.
            try {
                const payload = await Translator.fetchById(article.announce_id, targetLang).catch(()=>null);
                if (payload && (payload.title || payload.message)) {
                    titleText = payload.title || titleText;
                    messageHTML = payload.message || messageHTML;
                    try { localStorage.setItem(key, JSON.stringify(payload)); } catch (e) { /* ignore */ }
                }
            } catch (e) {
                // ignore and use English
            }
        }
    } catch (e) {
        // ignore any storage/translation errors
    }

    title.innerText = titleText;
    if (article.image && !messageHTML.startsWith("<figure><img")) {
        messageHTML = `<figure><img src="${article.image}"></figure>${messageHTML}`;
    }
    message.innerHTML = DOMPurify.sanitize(messageHTML);

    for (const node of message.children) {
        if (node.tagName == "A") {
            const anchor = node as HTMLAnchorElement;
            const href = anchor.href;
            if (navigator.userAgent.includes("; wv)") || navigator.userAgent.includes("WebView")) {
                anchor.href = "javascript:void(0)";
                anchor.addEventListener("click", () => {
                    Unity.call("externalbrowser_" + href)
                });
            }
            else {
                anchor.target = "_blank";
            }
        }
    }
}

Loader.show();
init()
.catch(e => {
    console.error(e);
    message.innerText = "Failed to load article: " + e;
})
.finally(() => {
    contentsInner.classList.add("show");
    Loader.hide();
});