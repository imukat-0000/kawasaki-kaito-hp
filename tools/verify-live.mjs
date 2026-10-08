#!/usr/bin/env node
// 公開した直後に、本番（kaitokawasaki.com）を確かめる。
//
//   node tools/verify-live.mjs _site
//
//   - トップ（日本語）の中身が、今回公開した一式と同じになるまで待つ（最大10分）
//   - sitemap.xml に載っている全ページと 404 以外の主要ファイルが 200 で開けること
//   - 内部用ファイルのURLが 404 になること（公開されていないこと）
// 1つでも不合格なら終了コード1。

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SITE = 'https://kaitokawasaki.com';
const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir || !existsSync(dir)){ console.error('使い方: node tools/verify-live.mjs <公開用フォルダ>'); process.exit(2); }

const INTERNAL = ['/CLAUDE.md', '/README.md', '/PROGRESS.md', '/_config.yml', '/data/exhibitions.json', '/tools/build.mjs',
  '/scripts/gen_static_archive.js', '/concept-dark/', '/.github/workflows/publish.yml', '/tools/_glyphs.txt'];

const get = async (path) => {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${SITE}${path}${sep}v=${Date.now()}`, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  return { status: r.status, body: r.status === 200 ? await r.text() : '' };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const expected = readFileSync(join(dir, 'index.html'), 'utf8');
let live = false;
for (let i = 0; i < 40; i++){
  const r = await get('/').catch((e) => ({ status: 0, error: e.message }));
  if (r.status === 200 && r.body === expected){ live = true; break; }
  await sleep(15000);
}
const errors = [];
if (!live) errors.push('10分待っても、本番のトップが今回公開した内容になりませんでした');
else console.log('本番のトップが今回公開した内容と一致しました');

const sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
const pages = [...sitemap.matchAll(/<loc>https:\/\/kaitokawasaki\.com(\/[^<]*)<\/loc>/g)].map((m) => m[1])
  .concat('/sitemap.xml', '/robots.txt', '/fonts/NotoSerifJP-sub.woff2');
for (const p of pages){
  const r = await get(p).catch((e) => ({ status: 0, error: e.message }));
  if (r.status !== 200) errors.push(`${p} が ${r.status || r.error} です（200のはず）`);
}
for (const p of INTERNAL){
  const r = await get(p).catch((e) => ({ status: 0, error: e.message }));
  if (r.status !== 404) errors.push(`内部用の ${p} が ${r.status || r.error} です（404のはず）`);
}
if (errors.length){
  console.error(`本番の確認で不合格（${errors.length}件）:`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`本番の確認: 合格（${pages.length}ページが200、内部用 ${INTERNAL.length}件が404）`);
