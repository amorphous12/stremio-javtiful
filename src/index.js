
'use strict';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const jav = require('./javtiful');

const manifest = {
  id: 'community.javtiful',
  version: '1.3.0',
  name: 'Javtiful',
  description: 'Xem JAV từ Javtiful.com — Vietsub, Không kiểm duyệt',
  logo: 'https://javtiful.com/favicon.ico',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  idPrefixes: ['javtiful:'],
  catalogs: [
    { id: 'newest',          type: 'movie', name: '🆕 Mới nhất',           extra: [{ name: 'skip' }, { name: 'search' }] },
    { id: 'most_viewed',     type: 'movie', name: '👁️ Xem nhiều nhất',      extra: [{ name: 'skip' }] },
    { id: 'top_rated',       type: 'movie', name: '⭐ Đánh giá cao',        extra: [{ name: 'skip' }] },
    { id: 'uncensored',      type: 'movie', name: '🔓 Không kiểm duyệt',    extra: [{ name: 'skip' }] },
    { id: 'reducing_mosaic', type: 'movie', name: '🔅 Giảm kiểm duyệt',     extra: [{ name: 'skip' }] },
    { id: 'cat_nurse',       type: 'movie', name: '👩‍⚕️ Y tá',              extra: [{ name: 'skip' }] },
    { id: 'cat_office',      type: 'movie', name: '💼 Nhân viên văn phòng', extra: [{ name: 'skip' }] },
    { id: 'cat_milf',        type: 'movie', name: '🌹 MILF',                extra: [{ name: 'skip' }] },
    { id: 'cat_student',     type: 'movie', name: '🎓 Nữ sinh',             extra: [{ name: 'skip' }] },
    { id: 'cat_mature',      type: 'movie', name: '👩 Phụ nữ trưởng thành',extra: [{ name: 'skip' }] },
    { id: 'cat_married',     type: 'movie', name: '💍 Phụ nữ có chồng',     extra: [{ name: 'skip' }] },
    { id: 'cat_bigtits',     type: 'movie', name: '🍑 Ngực lớn',            extra: [{ name: 'skip' }] },
    { id: 'cat_amateur',     type: 'movie', name: '📷 Nghiệp dư',           extra: [{ name: 'skip' }] },
    { id: 'cat_cosplay',     type: 'movie', name: '🎭 Cosplay',             extra: [{ name: 'skip' }] },
    { id: 'cat_chinese',     type: 'movie', name: '🇨🇳 AV Trung Quốc',      extra: [{ name: 'skip' }] },
  ],
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const page = Math.floor((parseInt(extra.skip) || 0) / 32) + 1;
  try {
    const items = await jav.getList(id, page, extra.search || '');
    return { metas: items.map(jav.toMeta) };
  } catch(e) {
    console.error('[catalog] error:', e.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  if (!id.startsWith('javtiful:')) return { meta: null };
  const numId = id.replace('javtiful:', '');
  return { meta: { id, type: 'movie', name: numId, poster: '', description: '' } };
});

builder.defineStreamHandler(async ({ type, id }) => {
  if (!id.startsWith('javtiful:')) return { streams: [] };
  try {
    const numId = id.replace('javtiful:', '');
    const href = await jav.getHrefFromId(numId);
    console.log('[stream] id:', id, '→', href);
    const streams = await jav.getVideoStreams(href);
    console.log('[stream] found:', streams.length);
    return { streams };
  } catch(e) {
    console.error('[stream] error:', e.message);
    return { streams: [] };
  }
});

const PORT = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port: PORT });
console.log('Javtiful Addon v1.3.0: http://localhost:' + PORT + '/manifest.json');
