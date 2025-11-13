import Utils from "./utils";
import Loader from "./loader";
import Unity from "./unity";
import type { Article } from "./types";
import DOMPurify from "dompurify";
import Translator from './translator';

// Helper to safely get required DOM elements
function getRequiredElement(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Required DOM element #${id} not found. Check HTML structure.`);
    return el;
}

const contentsInner = getRequiredElement("contentsInner");
const label = getRequiredElement("label");
const postTime = getRequiredElement("postTime");
const title = getRequiredElement("title");
const message = getRequiredElement("message");

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

    // Prefer worker proxy for article retrieval; fall back to official API.
    return await Translator.fetchArticle(id);
}

async function init() {
    Unity.call("showBackButton");

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
                const payload = await Translator.fetchById(article.announce_id).catch(()=>null);
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
    console.error('Failed to load article:', e);
    message.innerHTML = DOMPurify.sanitize(`
        <div style="color: #d9534f; padding: 10px; background: #f2dede; border: 1px solid #ebcccc; border-radius: 4px;">
            <strong>⚠️ Failed to load article</strong><br>
            Unable to fetch article details. Please try again or check the console for more information.
        </div>
    `);
})
.finally(() => {
    contentsInner.classList.add("show");
    Loader.hide();
});