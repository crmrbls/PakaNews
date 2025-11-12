import type { Article } from "../types";

function parseDateToEpoch(dateStr: string | null | undefined): number | undefined {
    if (!dateStr) return undefined;
    // Ensure a parsable ISO-like format: replace space with 'T' when appropriate
    const iso = dateStr.replace(' ', 'T');
    const ms = Date.parse(iso);
    if (isNaN(ms)) return undefined;
    return Math.floor(ms / 1000);
}

export function mapIndexItemToArticle(item: any, idx = 0): Article {
    const announce_id = Number(item.announce_id || item.id || 0);
    const post_at = parseDateToEpoch(item.post_at) ?? 0;
    const update_at = parseDateToEpoch(item.update_at ?? null);

    const announce_label = Number(item.announce_label ?? 0);

    const label_name_en = announce_label === 1 ? 'Game' : 'All';
    const label_color = announce_label === 1 ? '#f39c12' : '#666666';

    const article: Article = {
        announce_id,
        announce_label,
        article_image: item.image || item.article_image || '',
        id: announce_id,
        image: item.image || '',
        label_color,
        label_name_en,
        message: item.message || '',
        message_english: '',
        post_at,
        post_platform_flag: Number(item.post_platform_flag ?? 0),
        row_number: idx,
        title: item.title || '',
        title_english: '',
        update_at
    };

    return article;
}

export function mapDetailToArticle(detail: any): Article {
    const announce_id = Number(detail.announce_id || detail.id || 0);
    const post_at = parseDateToEpoch(detail.post_at) ?? 0;
    const update_at = parseDateToEpoch(detail.update_at ?? detail.to_date ?? null);
    const announce_label = Number(detail.announce_label ?? detail.announce_label ?? 0);

    const label_name_en = announce_label === 1 ? 'Game' : 'All';
    const label_color = announce_label === 1 ? '#f39c12' : '#666666';

    const article: Article = {
        announce_id,
        announce_label,
        article_image: detail.image || detail.article_image || '',
        id: announce_id,
        image: detail.image || '',
        label_color,
        label_name_en,
        message: detail.message || '',
        message_english: '',
        post_at,
        post_platform_flag: Number(detail.post_platform_flag ?? 0),
        row_number: 0,
        title: detail.title || '',
        title_english: '',
        update_at
    };

    return article;
}
