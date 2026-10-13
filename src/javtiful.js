
'use strict';
const axios = require('axios');
const NodeCache = require('node-cache');

const MAIN_URL = 'https://javtiful.com';
const listCache = new NodeCache({ stdTTL: 600 });
const detailCache = new NodeCache({ stdTTL: 300 });

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
    return typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  } catch(e) {
    console.error('[Javtiful] getPage error:', url, e.message);
    return '';
  }
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

    let poster = '';
    const imgM = body.match(/<img[^>]+>/i);
    if (imgM) {
      const imgTag = imgM[0];
      for (const attr of ['data-front-lazy-src', 'data-front-lazy-current-src', 'src']) {
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
      if (titleM2) title = unescape(titleM2[1].replace(/<[^>]+>/g, '')).trim();
    }
    if (!title) {
      const altM = body.match(/\balt="([^"]+)"/i);
      if (altM) title = unescape(altM[1].replace(/^Thumbnail\s+for\s+/i, '')).trim();
    }
    if (!title) title = href.replace(/\/$/, '').split('/').pop().replace(/-/g, ' ');

    results.push({ title, href, poster });
  }
  return results;
}

function extractSources(html) {
  // Method 1: fast-stream.jav.si <source> tags
  const fastRe = /<source\s+src="(https:\/\/fast-stream\.jav\.si\/[^"]+)"(?:\s+type="([^"]*)")?(?:\s+size="(\d+)")?/gi;
  const fastSources = [];
  let fm;
  while ((fm = fastRe.exec(html)) !== null) {
    fastSources.push({ src: fm[1], type: fm[2] || 'video/mp4', size: fm[3] ? parseInt(fm[3]) : 720 });
  }
  if (fastSources.length) {
    console.log('[Javtiful] fast-stream sources:', fastSources.length);
    return fastSources;
  }

  // Method 2: frontWatchConfig JSON
  if (html.includes('frontWatchConfig')) {
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

  // Method 3: m3u8 fallback
  const m3u8s = html.match(/https?:\/\/[^"' >]+\.m3u8[^"' >]*/g) || [];
  if (m3u8s.length) {
    console.log('[Javtiful] m3u8 fallback');
    return [{ src: m3u8s[0], size: 0, type: 'application/x-mpegURL' }];
  }

  console.error('[Javtiful] no sources found');
  return [];
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
  listCache.set(key, items);
  return items;
}

async function getVideoStreams(href) {
  const key = 'stream_' + href;
  const cached = detailCache.get(key);
  if (cached) return cached;
  console.log('[Javtiful] fetching:', href);
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

function toMeta(item) {
  const slug = item.href.replace(/\/$/, '').split('/').pop();
  return {
    id: 'javtiful:' + slug,
    type: 'movie',
    name: item.title,
    poster: item.poster || '',
    background: item.poster || '',
    description: item.title,
  };
}

module.exports = { getList, getVideoStreams, toMeta, CATALOG_URLS, MAIN_URL };
