'use strict';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const jav = require('./javtiful');

const manifest = {
  id: 'org.javtiful.addon',
  version: '1.0.5',
  name: 'Javtiful',
  description: 'JAV from javtiful.com',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  catalogs: [
    { type: 'movie', id: 'newest', name: 'Mới nhất', extra: [{ name: 'search', isRequired: false }, { name: 'skip' }] },
    { type: 'movie', id: 'most_viewed', name: 'Xem nhiều', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'top_rated', name: 'Đánh giá cao', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'uncensored', name: 'Không che', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'reducing_mosaic', name: 'Giảm mosaic', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_nurse', name: 'Y tá', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_office', name: 'Văn phòng', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_milf', name: 'MILF', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_student', name: 'Nữ sinh', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_mature', name: 'Trưởng thành', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_married', name: 'Đã kết hôn', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_bigtits', name: 'Ngực lớn', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_amateur', name: 'Amateur', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_cosplay', name: 'Cosplay', extra: [{ name: 'skip' }] },
    { type: 'movie', id: 'cat_chinese', name: 'Trung Quốc', extra: [{ name: 'skip' }] },
  ],
};

const builder = new addonBuilder(manifest);
const PAGE_SIZE = 30; // Stremio mặc định

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const skip = extra.skip || 0;
  const search = extra.search || '';
  console.log(`[Catalog] id=${id} skip=${skip} search=${search}`);

  try {
    const items = await jav.getListFixed(id, skip, PAGE_SIZE, search);
    console.log(`[Catalog] returning ${items.length} items for skip=${skip}`);
    return { metas: items.map(jav.toMeta) };
  } catch (e) {
    console.error('[Catalog] error:', e.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[Meta] id=${id}`);
  try {
    const meta = await jav.getMeta(id);
    return { meta };
  } catch (e) {
    console.error('[Meta] error:', e.message);
    return { meta: null };
  }
});

builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[Stream] id=${id}`);
  try {
    const streams = await jav.getStreamsForId(id);
    return { streams };
  } catch (e) {
    console.error('[Stream] error:', e.message);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();
if (require.main === module) {
  serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
}
