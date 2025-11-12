import Unity from "./unity";
import Utils from "./utils";
import Loader from "./loader";
import type { Article } from "./types";
import Translator from "./translator";

const allTabBtn = document.getElementById("allTabBtn")!;
const gameTabBtn = document.getElementById("gameTabBtn")!;
const newsEntries = document.getElementById("newsEntries")!;

enum Tab {
    All,
    Game
}

var currentTab = Tab.All;
function onTabClick(tab: Tab) {
    if (loading) return;

    Unity.call("snd_sfx_UI_tab_01");
    if (currentTab == tab) return;
    
    currentTab = tab;
    loadNews();
    updateTabBtns();
}

function updateTabBtns() {
    switch (currentTab) {
        case Tab.All:
            allTabBtn.classList.add("selected");
            gameTabBtn.classList.remove("selected");
            break;

        case Tab.Game:
            gameTabBtn.classList.add("selected");
            allTabBtn.classList.remove("selected");
            break;
    }
}

allTabBtn.addEventListener("click", () => onTabClick(Tab.All));
gameTabBtn.addEventListener("click", () => onTabClick(Tab.Game));

function appendNewsEntry(article: Article) {
    const entry = document.createElement("a");
    entry.role = "button";
    entry.href = import.meta.env.BASE_URL + "details/?id=" + article.announce_id;
    entry.className = "news-entry";
    // mark element with announce id so preloader can update it when translation arrives
    entry.dataset.announceId = String(article.announce_id);
    entry.addEventListener("click", () => {
        Unity.call("snd_sfx_UI_Tap_01");
        // Store in session storage so the details page won't have to load it
        sessionStorage.setItem("article", JSON.stringify(article));
    });

    const labelBox = document.createElement("div");
    labelBox.className = "news-label-box";
    entry.appendChild(labelBox);

    const label = document.createElement("div");
    label.className = "label";
    label.style.backgroundColor = article.label_color;
    label.innerText = article.label_name_en;
    labelBox.appendChild(label);

    if (article.update_at) {
        const updatedTime = document.createElement("div");
        updatedTime.className = "updated-time";
        updatedTime.innerText = "【Updated】" + Utils.formatTimestamp(article.update_at);
        labelBox.appendChild(updatedTime);
    }

    const title = document.createElement("h1");
    title.className = "news-title";
    // Use Indonesian ('id') translation if available in localStorage
    try {
        const targetLang = 'id';
        const key = `translation_${article.announce_id}_${targetLang}`;
        const stored = ((): string | null => {
            try { return localStorage.getItem(key); } catch(e) { return null; }
        })();
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                title.innerText = parsed.title || article.title_english;
            } catch (e) {
                title.innerText = article.title_english;
            }
        } else {
            title.innerText = article.title_english;
        }
    } catch (e) {
        title.innerText = article.title_english;
    }
    entry.appendChild(title)

    if (article.image) {
        const img = document.createElement("img");
        img.src = article.image;
        entry.appendChild(img);
    }

    const postTime = document.createElement("div");
    postTime.className = "news-post-time";
    postTime.innerText = Utils.formatTimestamp(article.post_at);
    entry.appendChild(postTime);

    newsEntries.appendChild(entry);
}

function appendMoreBtn() {
    const moreBtn = document.createElement("div");
    moreBtn.className = "news-entry more-btn";
    moreBtn.innerText = "▼ Load more";
    moreBtn.addEventListener("click", () => {
        if (loading) return;
        Unity.call("snd_sfx_UI_Tap_01");
        loadNews(true).then(() => newsEntries.removeChild(moreBtn));
    });
    newsEntries.appendChild(moreBtn);
}

/** Preload translations for a list of articles (non-blocking). */
function preloadTranslations(articles: Article[], targetLang = 'id') {
    try {
        const toPreload = articles.slice(0, POST_COUNT);
        for (const article of toPreload) {
            const key = `translation_${article.announce_id}_${targetLang}`;
            const has = ((): boolean => { try { return !!localStorage.getItem(key); } catch(e) { return false; } })();
            if (!has) {
                Translator.fetchById(article.announce_id, targetLang)
                .then((payload: any) => {
                    if (payload && (payload.title || payload.message)) {
                        try { localStorage.setItem(key, JSON.stringify(payload)); } catch(e) { /* quota or disabled */ }
                        // update rendered title if the entry is already in the DOM
                        try {
                            const selector = `a.news-entry[data-announce-id="${article.announce_id}"] .news-title`;
                            const titleEl = document.querySelector(selector) as HTMLElement | null;
                            if (titleEl && payload.title) titleEl.innerText = payload.title;
                        } catch (e) { /* ignore DOM update errors */ }
                    }
                })
                .catch(() => {
                    // worker endpoint unavailable or failed - skip preloading
                });
            }
        }
    } catch (e) {
        // ignore translation preloading errors
    }
}

const POST_COUNT = 20;
let offset = 0;
let loading = false;
async function loadNews(loadMore = false) {
    if (loading) return;
    loading = true;

    if (!loadMore) {
        offset = 0;
        newsEntries.classList.remove("show");
    }

    Loader.show();
    try {
        // Prefer worker endpoint for list retrieval; fall back to official API if not configured.
        const data: Article[] = await Translator.fetchList(POST_COUNT, offset, currentTab);

        if (!loadMore) {
            newsEntries.innerHTML = "";
            newsEntries.scrollTo(0, 0);
        };
        for (const article of data) {
            appendNewsEntry(article);
        }
        appendMoreBtn();

        // Preload translations (non-blocking) if user language isn't English.
        preloadTranslations(data, 'id');

        let state: State | null = history.state;
        updateState({
            scrollTop: newsEntries.scrollTop,
            tab: currentTab,
            offset,
            data: [...(state && loadMore ? state.data : []), ...data]
        });

        newsEntries.classList.add("show");

        // Only advance offset after a successful load
        offset += POST_COUNT;
    }
    finally {
        Loader.hide();
        loading = false;
    }
}

interface State {
    scrollTop: number,
    tab: Tab,
    offset: number,
    data: Article[]
}

function updateState(state: State) {
    history.replaceState(state, "", location.href);
}

function restoreState() {
    let state: State | null = history.state;
    if (!state) return false;

    for (const article of state.data) {
        appendNewsEntry(article);
    }
    appendMoreBtn();
    // Preload translations for restored entries (dev & normal flow)
    preloadTranslations(state.data, 'id');
    newsEntries.scrollTo(0, state.scrollTop);
    newsEntries.classList.add("show");

    offset = state.offset;

    currentTab = state.tab;
    updateTabBtns();

    return true;
}

async function init() {
    // Clean up any dev/mock translations if the worker is not reachable.
    try { await Translator.cleanupMockEntries().catch(()=>{}); } catch(e) {}

    if (!restoreState()) {
        await loadNews();
        updateTabBtns();
    }

    window.addEventListener("beforeunload", () => {
        let state: State | null = history.state;
        updateState({
            scrollTop: newsEntries.scrollTop,
            tab: currentTab,
            offset,
            data: state?.data ?? []
        });
    });
}
init();