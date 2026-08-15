'use strict';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const javtiful = require('./javtiful');

const EXTRA_BASE = [{ name: 'skip' }, { name: 'search' }];

// Map catalog id → URL
const CATALOG_URL = {};
javtiful.CATALOGS.forEach(c => { CATALOG_URL[c.id] = c.url; });

const manifest = {
  id: 'community.javtiful.com',
  version: '1.0.0',
  name: 'Javtiful',
  description: 'Xem JAV từ Javtiful — Uncensored, MILF, Amateur và nhiều thể loại',
  logo: 'https://javtiful.com/favicon.ico',
  catalogs: javtiful.CATALOGS.map(c => ({
    id: c.id,
    type: 'movie',
    name: c.name,
    extra: EXTRA_BASE,
  })),
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  idPrefixes: ['javtiful:'],
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const page = Math.floor((parseInt(extra.skip) || 0) / 24) + 1;
  let items = [];
  try {
    if (extra.search) {
      items = await javtiful.search(extra.search, page);
    } else {
      const url = CATALOG_URL[id];
      if (!url) return { metas: [] };
      items = await javtiful.getList(url, page);
    }
    return { metas: items.map(javtiful.toMeta) };
  } catch(e) {
    console.error('[catalog] error:', e.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (!id.startsWith('javtiful:')) return { meta: null };
  try {
    const slug = id.replace('javtiful:', '');
    const data = await javtiful.getStream(slug);
    if (!data) return { meta: null };
    return { meta: {
      id,
      type: 'movie',
      name: data.title || slug,
      poster: data.poster || '',
      background: data.poster || '',
    }};
  } catch(e) { return { meta: null }; }
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (!id.startsWith('javtiful:')) return { streams: [] };
  try {
    const slug = id.replace('javtiful:', '');
    const data = await javtiful.getStream(slug);
    if (!data || !data.sources.length) {
      const path = slug.replace(/__/g, '/');
      return { streams: [{
        externalUrl: `https://javtiful.com/${path}`,
        title: '🔗 Mở Javtiful',
      }]};
    }

    const streams = data.sources.map(s => {
      const isM3u8 = s.src.includes('.m3u8') || s.type.includes('mpegURL');
      const qualityLabel = s.size ? `${s.size}p` : (isM3u8 ? 'HLS' : 'MP4');
      return {
        url: s.src,
        title: `▶ ${qualityLabel}`,
        behaviorHints: {
          notWebReady: false,
          headers: {
            'Referer': 'https://javtiful.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
      };
    });

    return { streams };
  } catch(e) {
    console.error('[stream] error:', e.message);
    return { streams: [] };
  }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Javtiful Addon: http://localhost:${PORT}/manifest.json`);