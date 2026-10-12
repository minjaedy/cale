export const STICKERS={good:'좋아요',best:'최고',cheer:'응원',seen:'확인',miss:'아쉬워요',retry:'다시 도전',rest:'쉬어가요',steady:'꾸준히'};
const art={
 good:'<path d="M29 51q11 13 22 0"/><path d="m55 24 4 4 8-10" stroke="#ff875f"/>',
 best:'<path d="m26 34 5 3-1 6 5-4 5 4-1-6 5-3-6-1-3-6-3 6Z" fill="#ff875f" stroke="none"/><path d="m49 34 5 3-1 6 5-4 5 4-1-6 5-3-6-1-3-6-3 6Z" fill="#ff875f" stroke="none"/><path d="M32 53q9 8 18 0"/>',
 cheer:'<path d="M27 37l5-4 5 4m7 0 5-4 5 4M33 53q8 10 16 0"/><path d="m13 29-5-4m58 4 5-4m-57 28-6 4m59-4 6 4" stroke="#ff875f"/>',
 seen:'<path d="m29 47 8 8 18-22" stroke="#ff875f" stroke-width="5"/>',
 miss:'<path d="m26 34 8 4m12 0 8-4M32 54q9-8 18 0"/><path d="M60 42q-7 9-1 10 7-1 1-10" fill="#aab5c8" stroke="none"/>',
 retry:'<path d="M30 53q10 9 20-1M24 35l10 3m12 0 10-3"/><path d="M13 19a31 31 0 0 1 50-2m-1-7 2 10-11-1" stroke="#ff875f"/>',
 rest:'<path d="M25 40q5 5 10 0m9 0q5 5 10 0M36 53h9"/><path d="m55 12 9-1-7 9 9-1" stroke="#ff875f"/>',
 steady:'<path d="M30 52q10 9 20 0"/><path d="m9 65 8-8 5 4 8-8m28 1 7-7 5 4" stroke="#ff875f"/>'
};
export function stickerSvg(key){
 if(!STICKERS[key])return '';
 const eyes=['good','steady'].includes(key)?'<path d="M30 38v4m20-4v4"/>':'';
 return `<svg class="tempo-sticker" viewBox="0 0 80 88" role="img" aria-label="${STICKERS[key]}"><path d="M22 14h37l9 18-10 35H20L12 49Z" fill="#272e39" stroke="#485362" stroke-width="1.5"/><path d="m19 23 4-9h30l-4 9Z" fill="#ff875f"/><g fill="none" stroke="#f3f5f9" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${eyes}${art[key]}</g><text x="40" y="81" fill="#aeb9c9" font-family="Arial,sans-serif" font-style="italic" font-weight="900" font-size="9" text-anchor="middle" letter-spacing="1">TEMPO.</text></svg>`;
}
