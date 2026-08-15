'use strict';
const axios = require('axios');
const NodeCache = require('node-cache');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const listCache = new NodeCache({ stdTTL: 600 });
const detailCache = new NodeCache({ stdTTL: 300 });

const BASE = 'https://javtiful.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  timeout: 20000,
  headers: {
    'User-Agent': UA,
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE + '/',
  },
}));

async function fetchHtml(url) {
  try {
    const res = await client.get(url, {
      headers: { 'Referer': BASE + '/' }
    });
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  } catch(e) {
    console.error('[Javtiful] fetch error:', url, e.message);
    return null;
  }
}

// ── Parse danh sách video ─────────────────────────────────────────────────────
function parseCards(html) {
  if (!html) return [];
  const items = [];
  const seen = new Set();

  // article.front-video-card
  const articleRe = /<article[^>]*class="[^"]*front-video-card[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const body = m[1];

    // Skip partner cards
    if (html.substring(m.index, m.index + 200).includes('front-partner-card')) continue;

    // href
    const hrefM = body.match(/<a[^>]+href="([^"]+)"/i);
    if (!hrefM) continue;
    const href = hrefM[1].startsWith('http') ? hrefM[1] : BASE + hrefM[1];

    // slug từ URL
    const slug = href.replace(/^.*javtiful\.com\//, '').replace(/\/$/, '').replace(/\//g, '__');
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    // poster
    let poster = '';
    const imgM = body.match(/<img[^>]+>/i);
    if (imgM) {
      const imgTag = imgM[0];
      const lazyM = imgTag.match(/data-front-lazy-src="([^"]+)"/i);
      const srcM  = imgTag.match(/\bsrc="([^"]+)"/i);
      const raw = lazyM || srcM;
      if (raw) {
        poster = raw[1].startsWith('/') ? BASE + raw[1] : raw[1];
        if (poster.endsWith('.svg')) poster = '';
      }
    }

    // title
    let title = '';
    const titleA = body.match(/<a[^>]+class="[^"]*front-video-title[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (titleA) title = titleA[1].replace(/<[^>]+>/g, '').trim();
    if (!title) {
      const altM = body.match(/\balt="([^"]+)"/i);
      if (altM) title = altM[1].replace(/^Thumbnail\s+for\s+/i, '').trim();
    }
    if (!title) title = href.split('/').pop().replace(/-/g, ' ');

    items.push({ slug, title, poster, href });
  }

  console.log(`[Javtiful] parseCards → ${items.length} items`);
  return items;
}

// ── Danh sách theo URL ────────────────────────────────────────────────────────
async function getList(url, page = 1) {
  const sep = url.includes('?') ? '&' : '?';
  const fullUrl = page > 1 ? `${url}${sep}page=${page}` : url;
  const key = `list_${fullUrl}`;
  const c = listCache.get(key); if (c) return c;
  console.log('[Javtiful] getList:', fullUrl);
  const html = await fetchHtml(fullUrl);
  const r = parseCards(html);
  listCache.set(key, r); return r;
}

// ── Tìm kiếm ─────────────────────────────────────────────────────────────────
async function search(keyword, page = 1) {
  const key = `search_${keyword}_${page}`;
  const c = listCache.get(key); if (c) return c;
  const url = `${BASE}/vn/search?q=${encodeURIComponent(keyword)}${page > 1 ? '&page=' + page : ''}`;
  console.log('[Javtiful] search:', url);
  const html = await fetchHtml(url);
  const r = parseCards(html);
  listCache.set(key, r); return r;
}

// ── Lấy stream từ frontWatchConfig ───────────────────────────────────────────
async function getStream(slug) {
  const key = `stream_${slug}`;
  const c = detailCache.get(key); if (c) return c;

  const path = slug.replace(/__/g, '/');
  const url = `${BASE}/${path}`;
  console.log('[Javtiful] getStream:', url);

  const html = await fetchHtml(url);
  if (!html) return null;

  let sources = [];

  // Path A: frontWatchConfig JSON
  if (html.includes('frontWatchConfig')) {
    try {
      const raw = html.split('id="frontWatchConfig" type="application/json">')[1].split('</script>')[0];
      const config = JSON.parse(raw);
      const srcs = config.playerSources || [];
      sources = srcs.map(s => ({
        src: s.src.startsWith('/') ? BASE + s.src : s.src,
        size: s.size || 0,
        type: s.type || '',
      })).filter(s => s.src);
      console.log('[Javtiful] frontWatchConfig sources:', sources.length);
    } catch(e) {
      console.error('[Javtiful] frontWatchConfig parse error:', e.message);
    }
  }

  // Path B: tìm m3u8 trực tiếp trong HTML
  if (!sources.length) {
    const m3u8s = [...html.matchAll(/https?:\/\/[^"' >]+\.m3u8[^"' >]*/g)];
    if (m3u8s.length) {
      sources = m3u8s.map(m => ({ src: m[0], size: 0, type: 'application/x-mpegURL' }));
      console.log('[Javtiful] m3u8 fallback:', sources.length);
    }
  }

  if (!sources.length) {
    console.error('[Javtiful] no sources for:', url);
    return null;
  }

  // Sort theo size giảm dần (chất lượng cao nhất trước)
  sources.sort((a, b) => (b.size || 0) - (a.size || 0));

  // Parse title + poster
  const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : slug.split('__').pop();
  const posterM = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  const poster = posterM ? posterM[1] : '';

  const result = { sources, title, poster, url };
  detailCache.set(key, result);
  return result;
}

// ── Meta ─────────────────────────────────────────────────────────────────────
function toMeta(item) {
  return {
    id: `javtiful:${item.slug}`,
    type: 'movie',
    name: item.title || item.slug,
    poster: item.poster || '',
    background: item.poster || '',
    description: '',
    language: 'ja',
  };
}

const CATALOGS = [
  { id: 'newest',      url: `${BASE}/vn/videos`,                          name: '🆕 Mới Nhất' },
  { id: 'mostviewed',  url: `${BASE}/vn/videos?sort=most_viewed`,         name: '🔥 Xem Nhiều Nhất' },
  { id: 'toprated',    url: `${BASE}/vn/videos?sort=top_rated`,           name: '⭐ Đánh Giá Cao' },
  { id: 'uncensored',  url: `${BASE}/vn/uncensored`,                      name: '🔞 Không Kiểm Duyệt' },
  { id: 'mosaic',      url: `${BASE}/vn/reducing-mosaic`,                 name: '🎭 Giảm Kiểm Duyệt' },
  { id: 'milf',        url: `${BASE}/vn/category/milf`,                   name: '👩 MILF' },
  { id: 'bigtits',     url: `${BASE}/vn/category/big-tits`,               name: '💫 Ngực Lớn' },
  { id: 'amateur',     url: `${BASE}/vn/category/amateur`,                name: '🎬 Nghiệp Dư' },
  { id: 'nurse',       url: `${BASE}/vn/category/nurse`,                  name: '💉 Y Tá' },
  { id: 'student',     url: `${BASE}/vn/category/female-student`,         name: '📚 Nữ Sinh' },
  { id: 'office',      url: `${BASE}/vn/category/office-lady`,            name: '💼 Nhân Viên VP' },
  { id: 'mature',      url: `${BASE}/vn/category/mature-woman`,           name: '🌸 Phụ Nữ Trưởng Thành' },
  { id: 'cosplay',     url: `${BASE}/vn/category/cosplay`,                name: '🎀 Cosplay' },
  { id: 'married',     url: `${BASE}/vn/category/married-woman`,          name: '💍 Phụ Nữ Có Chồng' },
  { id: 'teacher',     url: `${BASE}/vn/category/female-teacher`,         name: '👩‍🏫 Nữ Giáo Viên' },
  { id: 'chinese',     url: `${BASE}/vn/category/chinese-av`,             name: '🇨🇳 AV Trung Quốc' },
];

module.exports = { getList, search, getStream, toMeta, CATALOGS };