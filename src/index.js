'use strict';
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const jav = require('./javtiful');

const manifest = {
  id: 'org.javtiful.addon',
  version: '1.0.3',
  name: 'Javtiful',
  description: 'JAV from javtiful.com',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie'],
  catalogs: [
    { type: 'movie', id: 'newest', name: 'Mới nhất', extra: [{ name: 'search' }, { name: 'skip' }] },
    { type: 'movie', id: 'most_viewed', name: 'Xem nhiều' },
    { type: 'movie', id: 'top_rated', name: 'Đánh giá cao' },
    { type: 'movie', id: 'uncensored', name: 'Không che' },
    { type: 'movie', id: 'reducing_mosaic', name: 'Giảm mosaic' },
    { type: 'movie', id: 'cat_nurse', name: 'Y tá' },
    { type: 'movie', id: 'cat_office', name: 'Văn phòng' },
    { type: 'movie', id: 'cat_milf', name: 'MILF' },
    { type: 'movie', id: 'cat_student', name: 'Nữ sinh' },
    { type: 'movie', id: 'cat_mature', name: 'Trưởng thành' },
    { type: 'movie', id: 'cat_married', name: 'Đã kết hôn' },
    { type: 'movie', id: 'cat_bigtits', name: 'Ngực lớn' },
    { type: 'movie', id: 'cat_amateur', name: 'Amateur' },
    { type: 'movie', id: 'cat_cosplay', name: 'Cosplay' },
    { type: 'movie', id: 'cat_chinese', name: 'Trung Quốc' },
  ],
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const page = Math.floor((extra.skip || 0) / 30) + 1;
  const search = extra.search || '';
  const items = await jav.getList(id, page, search);
  return { metas: items.map(jav.toMeta) };
});

builder.defineMetaHandler(async ({ type, id }) => {
  const meta = await jav.getMeta(id);
  return { meta };
});

builder.defineStreamHandler(async ({ type, id }) => {
  const streams = await jav.getStreamsForId(id);
  return { streams };
});

module.exports = builder.getInterface();
if (require.main === module) {
  serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
}
