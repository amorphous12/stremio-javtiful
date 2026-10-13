'use strict';
const axios = require('axios');
const NodeCache = require('node-cache');

const MAIN_URL = 'https://javtiful.com';
const listCache = new NodeCache({ stdTTL: 600 });
const detailCache = new NodeCache({ stdTTL: 300 });
const metaCache = new NodeCache({ stdTTL: 900 });

const SESSION = axios.create({
  timeout: 20000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': MAIN_URL + '/',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
  },
});

function unescape(s) {
  return (s || '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");
}

async function getPage(url) {
  try {
    const r = await SESSION.get(url);
    const html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    console.log('[Javtiful] getPage OK:', url, 'len:', html.length);
    return html;
  } catch(e) {
    console.error('[Javtiful] getPage ERROR:', url, e.message);
    return '';
  }
}

// Parse /vn/video/106190/jur-687-... → id="106190", slug="jur-687-..."
function parseVideoId(href) {
  const m = href.match(/\/video\/(\d+)\/([^/?#]+)/);
  if (m) return { numId: m[1], slug: m[2] };
  const m2 = href.match(/\/video\/([^/?#]+)/);
  if (m2) return { numId: m2[1], slug: m2[1] };
  return null;
}

function parseCards(html) {
  const results = [];
  const articleRe = /<article[^>]*class="[^"]*(?:video-card|front-video-card)[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    const snippet = html.substring(m.index, m.index + 200);
    if (/video-card--partner|front-partner-card/.test(snippet)) continue;
    const body = m[1];

    let href = '';
    const hrefM = body.match(/<a[^>]+href="((?:https?:\/\/javtiful\.com)?\/(?:[a-z]{2}\/)?video\/[^"]+)"/i);
    if (hrefM) { href = hrefM[1].trim(); }
    else {
      const hrefM2 = body.match(/<a[^>]+href="([^"]+)"/i);
      if (hrefM2) href = hrefM2[1].trim();
    }
    if (!href) continue;
    if (href.startsWith('http') && !href.includes('javtiful.com')) continue;
    if (!href.startsWith('http')) href = MAIN_URL + href;

    const parsed = parseVideoId(href);
    if (!parsed) continue;

    let poster = '';
    const imgM = body.match(/<img[^>]+>/i);
    if (imgM) {
      const imgTag = imgM[0];
      for (const attr of ['data-front-lazy-src','data-front-lazy-current-src','src']) {
        const rawM = imgTag.match(new RegExp(attr + '="([^"]+)"', 'i'));
        if (rawM) {
          poster = rawM[1];
          if (poster.startsWith('/')) poster = MAIN_URL + poster;
          if (!poster.endsWith('.svg')) break;
          poster = '';
        }
      }
    }

    let title = '';
    const titleM1 = body.match(/class="[^"]*video-card__title[^"]*"[^>]*title="([^"]+)"/i);
    if (titleM1) title = unescape(titleM1[1]).trim();
    if (!title) {
      const titleM2 = body.match(/class="[^"]*(?:video-card__title|front-video-title)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      if (titleM2) title = unescape(titleM2[1].replace(/<[^>]+>/g,'')).trim();
    }
    if (!title) {
      const altM = body.match(/\balt="([^"]+)"/i);
      if (altM) title = unescape(altM[1].replace(/^Thumbnail\s+for\s+/i,'')).trim();
    }
    if (!title) title = parsed.slug.replace(/-/g,' ');

    results.push({ title, href, poster, numId: parsed.numId, slug: parsed.slug });
  }
  return results;
}

function extractSources(html) {
  const hasFastStream = html.includes('fast-stream.jav.si');
  const hasFrontWatch = html.includes('frontWatchConfig');
  const hasM3u8 = html.includes('.m3u8');
  console.log('[Javtiful] extractSources: fast-stream=' + hasFastStream +
    ' frontWatchConfig=' + hasFrontWatch + ' m3u8=' + hasM3u8 +
    ' htmlLen=' + html.length);

  const fastRe = /<source\s+src="(https:\/\/fast-stream\.jav\.si\/[^"]+)"(?:\s+type="([^"]*)")?(?:\s+size="(\d+)")?/gi;
  const fastSources = [];
  let fm;
  while ((fm = fastRe.exec(html)) !== null) {
    fastSources.push({ src: fm[1], type: fm[2] || 'video/mp4', size: fm[3] ? parseInt(fm[3]) : 720 });
  }
  if (fastSources.length) {
    console.log('[Javtiful] fast-stream found:', fastSources.length);
    return fastSources;
  }

  if (hasFrontWatch) {
    try {
      const part = html.split('id="frontWatchConfig" type="application/json">')[1];
      const raw = part.split('</script>')[0];
      const config = JSON.parse(raw);
      const sources = (config.playerSources || []).map(s => {
        let src = s.src || '';
        if (src.startsWith('/')) src = MAIN_URL + src;
        return { src, size: s.size || 0, type: s.type || '' };
      }).filter(s => s.src);
      if (sources.length) {
        console.log('[Javtiful] frontWatchConfig sources:', sources.length);
        return sources;
      }
    } catch(e) { console.error('[Javtiful] frontWatchConfig error:', e.message); }
  }

  const m3u8s = html.match(/https?:\/\/[^"' >]+\.m3u8[^"' >]*/g) || [];
  if (m3u8s.length) {
    console.log('[Javtiful] m3u8:', m3u8s[0]);
    return [{ src: m3u8s[0], size: 0, type: 'application/x-mpegURL' }];
  }

  console.log('[Javtiful] no source found. HTML[2000:3000]:', html.substring(2000,3000).replace(/\n/g,' '));
  return [];
}

// ========== META EXTRACTION TỪ DETAIL PAGE ==========
async function fetchMetaFromDetail(numId, slug) {
  const key = 'meta_' + numId;
  const cached = metaCache.get(key);
  if (cached) return cached;

  let url = null;
  if (slug && slug !== numId) {
    url = MAIN_URL + '/vn/video/' + numId + '/' + slug;
  }

  let html = '';
  if (url) html = await getPage(url);

  // Fallback: search theo numId để tìm slug thật
  if (!html || html.length < 500) {
    console.log('[Javtiful] detail fallback, search numId:', numId);
    const searchUrl = MAIN_URL + '/vn/search?q=' + encodeURIComponent(numId);
    const searchHtml = await getPage(searchUrl);
    if (searchHtml) {
      const items = parseCards(searchHtml);
      const match = items.find(i => i.numId === numId) || items[0];
      if (match) {
        html = await getPage(match.href);
        if (!slug || slug === numId) slug = match.slug;
      }
    }
  }

  if (!html) {
    console.log('[Javtiful] fetchMetaFromDetail: no HTML for', numId);
    return null;
  }

  // --- Title ---
  let title = '';
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (ogTitle) title = unescape(ogTitle[1]).trim();
  if (!title) {
    const t = html.match(/<title>([^<]+)<\/title>/i);
    if (t) title = unescape(t[1]).replace(/\s*[-|]\s*Javtiful.*$/i,'').trim();
  }
  if (!title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = unescape(h1[1].replace(/<[^>]+>/g,'')).trim();
  }

  // --- Poster ---
  let poster = '';
  const ogImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (ogImg) poster = ogImg[1];
  if (!poster) {
    const twImg = html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i);
    if (twImg) poster = twImg[1];
  }
  if (!poster) {
    const vp = html.match(/poster="([^"]+)"/i);
    if (vp) poster = vp[1];
  }
  if (poster && poster.startsWith('/')) poster = MAIN_URL + poster;
  if (poster.endsWith('.svg')) poster = '';

  // --- Description ---
  let description = '';
  const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  if (ogDesc) description = unescape(ogDesc[1]).trim();
  if (!description) {
    const d = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
    if (d) description = unescape(d[1]).trim();
  }
  if (!description) description = title;

  const background = poster;

  const meta = { title, poster, background, description, slug, numId };
  console.log('[Javtiful] meta fetched:', numId, '| title:', title, '| poster:', !!poster);
  if (title) metaCache.set(key, meta);
  return meta;
}

const CATALOG_URLS = {
  'newest':           MAIN_URL + '/vn/videos',
  'most_viewed':      MAIN_URL + '/vn/videos?sort=most_viewed',
  'top_rated':        MAIN_URL + '/vn/videos?sort=top_rated',
  'uncensored':       MAIN_URL + '/vn/uncensored',
  'reducing_mosaic':  MAIN_URL + '/vn/reducing-mosaic',
  'cat_nurse':        MAIN_URL + '/vn/category/nurse',
  'cat_office':       MAIN_URL + '/vn/category/office-lady',
  'cat_milf':         MAIN_URL + '/vn/category/milf',
  'cat_student':      MAIN_URL + '/vn/category/female-student',
  'cat_mature':       MAIN_URL + '/vn/category/mature-woman',
  'cat_married':      MAIN_URL + '/vn/category/married-woman',
  'cat_bigtits':      MAIN_URL + '/vn/category/big-tits',
  'cat_amateur':      MAIN_URL + '/vn/category/amateur',
  'cat_cosplay':      MAIN_URL + '/vn/category/cosplay',
  'cat_chinese':      MAIN_URL + '/vn/category/chinese-av',
};

async function getList(catalogId, page = 1, search = '') {
  let url;
  if (search) {
    url = MAIN_URL + '/vn/search?q=' + encodeURIComponent(search);
  } else {
    url = CATALOG_URLS[catalogId] || CATALOG_URLS['newest'];
    if (page > 1) url += (url.includes('?') ? '&' : '?') + 'page=' + page;
  }
  const key = 'list_' + url;
  const cached = listCache.get(key);
  if (cached) return cached;
  const html = await getPage(url);
  if (!html) return [];
  const items = parseCards(html);
  console.log('[Javtiful] catalog', catalogId, 'page', page, 'items:', items.length);
  listCache.set(key, items);
  return items;
}

// ========== INFINITE SCROLL: tự dò page size + fetch song song ==========
let _cachedPageSize = null;

async function detectPageSize(catalogId) {
  if (_cachedPageSize) return _cachedPageSize;
  const items = await getList(catalogId, 1, '');
  _cachedPageSize = items.length || 30;
  console.log('[Javtiful] detected page size:', _cachedPageSize);
  return _cachedPageSize;
}

async function getListFixed(catalogId, skip = 0, limit = 30, search = '') {
  // Search: chỉ có 1 trang kết quả
  if (search) {
    const items = await getList(catalogId, 1, search);
    return items.slice(skip, skip + limit);
  }

  const JAV_PAGE_SIZE = await detectPageSize(catalogId);

  const startPage = Math.floor(skip / JAV_PAGE_SIZE) + 1;
  // Fetch dư 2 trang để chắc chắn đủ limit
  const endPage   = Math.floor((skip + limit - 1) / JAV_PAGE_SIZE) + 2;

  const pageNums = [];
  for (let p = startPage; p <= endPage; p++) pageNums.push(p);

  // Fetch SONG SONG
  const results = await Promise.all(
    pageNums.map(p => getList(catalogId, p, '').catch(() => []))
  );

  const all = [];
  for (const items of results) {
    if (!items || items.length === 0) break; // hết dữ liệu
    all.push(...items);
  }

  const offset = skip - (startPage - 1) * JAV_PAGE_SIZE;
  const sliced = all.slice(offset, offset + limit);
  console.log('[Javtiful] getListFixed', catalogId, 'skip=' + skip, 'limit=' + limit,
    'pages=' + pageNums.join(','), 'returned=' + sliced.length);
  return sliced;
}

// ========== STREAM ==========
async function getVideoStreams(href) {
  const key = 'stream_' + href;
  const cached = detailCache.get(key);
  if (cached) return cached;
  console.log('[Javtiful] getVideoStreams:', href);
  const html = await getPage(href);
  if (!html) return [];
  const sources = extractSources(html);
  sources.sort((a, b) => (b.size || 0) - (a.size || 0));
  const streams = sources.map(s => ({
    url: s.src,
    title: '▶ Javtiful | ' + (s.size ? s.size + 'p' : 'Auto'),
    behaviorHints: {
      notWebReady: false,
      headers: { 'Referer': MAIN_URL + '/', 'Origin': MAIN_URL },
    },
  }));
  if (streams.length) detailCache.set(key, streams);
  return streams;
}

// ========== META / ID ==========
// ID format: javtiful:{numId}:{slug}
function toMeta(item) {
  return {
    id: 'javtiful:' + item.numId + ':' + (item.slug || ''),
    type: 'movie',
    name: item.title,
    poster: item.poster || '',
    background: item.poster || '',
    description: item.title,
  };
}

function parseStremioId(id) {
  const parts = id.split(':');
  if (parts[0] !== 'javtiful') return null;
  const numId = parts[1];
  const slug = parts.slice(2).join(':') || '';
  return { numId, slug };
}

function buildHref(numId, slug) {
  if (slug && slug !== numId) return MAIN_URL + '/vn/video/' + numId + '/' + slug;
  return MAIN_URL + '/vn/video/' + numId;
}

async function getMeta(id) {
  const parsed = parseStremioId(id);
  if (!parsed) return null;
  const meta = await fetchMetaFromDetail(parsed.numId, parsed.slug);
  if (!meta) return null;
  return {
    id,
    type: 'movie',
    name: meta.title || parsed.slug || parsed.numId,
    poster: meta.poster || '',
    background: meta.background || meta.poster || '',
    description: meta.description || meta.title || '',
  };
}

async function getStreamsForId(id) {
  const parsed = parseStremioId(id);
  if (!parsed) return [];
  const href = buildHref(parsed.numId, parsed.slug);
  return getVideoStreams(href);
}

async function getHrefFromId(id) {
  const parsed = parseStremioId(id);
  if (!parsed) return null;
  return buildHref(parsed.numId, parsed.slug);
}

module.exports = {
  getList,
  getListFixed,
  getVideoStreams,
  getStreamsForId,
  getMeta,
  toMeta,
  getHrefFromId,
  parseStremioId,
  CATALOG_URLS,
  MAIN_URL,
};
