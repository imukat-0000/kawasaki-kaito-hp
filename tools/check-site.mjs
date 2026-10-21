#!/usr/bin/env node
// 公開用フォルダを公開前に検査する。1つでも不合格があれば終了コード1（公開しない）。
//
//   node tools/check-site.mjs _site
//
// 調べること:
//   - 内部リンク・画像・フォント・スクリプトの参照先が公開用フォルダに実在するか
//     （HTMLの属性、style内の url()、スクリプト内の img/ fonts/ js/ へのパス、kaitokawasaki.com 宛ての絶対URL）
//   - 作品一覧（日英）の構造化データの件数が、作品データ・一覧の件数と一致するか
//   - sitemap.xml に載っているページが実在し、更新日の書式が正しいか

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep, posix } from 'node:path';

const SITE_URL = 'https://kaitokawasaki.com/';
const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir || !existsSync(dir)){ console.error('使い方: node tools/check-site.mjs <公開用フォルダ>'); process.exit(2); }

const files = [];
(function walk(d){
  for (const n of readdirSync(d)){
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p); else files.push(relative(dir, p).split(sep).join('/'));
  }
})(dir);
const exists = new Set(files);
const errors = [];

// ---------- 参照先の実在 ----------
function target(page, ref){
  ref = ref.trim();
  if (!ref || /^(#|mailto:|tel:|javascript:|data:|blob:)/i.test(ref)) return null;
  let path;
  if (ref.startsWith(SITE_URL)) path = ref.slice(SITE_URL.length - 1);
  else if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) return null; // 外部サイト
  else if (ref.startsWith('/')) path = ref;
  else path = '/' + posix.join(posix.dirname(page), ref);
  path = decodeURI(path.split(/[?#]/)[0]);
  path = posix.normalize(path);
  if (path.endsWith('/')) path += 'index.html';
  return path.slice(1);
}
function check(page, ref, where){
  const t = target(page, ref);
  if (t === null) return;
  if (!exists.has(t) && !exists.has(t + '/index.html')) errors.push(`${page}: ${where} の参照先 ${ref} がありません`);
}

for (const page of files.filter((f) => f.endsWith('.html'))){
  const src = readFileSync(join(dir, page), 'utf8');
  const html = src.replace(/<!--[\s\S]*?-->/g, '');
  // 属性はスクリプトの外だけを見る（スクリプト内で組み立てるHTMLの断片は下で別に調べる）
  const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/g, '$1$2');
  for (const m of markup.matchAll(/\s(href|src|poster|data-src)\s*=\s*"([^"]*)"/g)){
    if (m[1] === 'href' && /^\s*$/.test(m[2])) continue;
    check(page, m[2].replace(/&amp;/g, '&'), m[1]);
  }
  for (const m of markup.matchAll(/\ssrcset\s*=\s*"([^"]*)"/g)){
    for (const part of m[1].split(',')) check(page, part.trim().split(/\s+/)[0], 'srcset');
  }
  for (const m of markup.matchAll(/<meta\s[^>]*content="(https:\/\/kaitokawasaki\.com\/[^"]*)"/g)) check(page, m[1], 'meta');
  for (const m of markup.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) check(page, m[1], 'url()');
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
    for (const s of m[1].matchAll(/["']((?:\.\.\/)*(?:img|fonts|js)\/[^"'\s]+)["']/g)) check(page, s[1], 'スクリプト内');
    for (const s of m[1].matchAll(/"(https:\/\/kaitokawasaki\.com\/[^"\s]*)"/g)) check(page, s[1], '構造化データ等');
  }
}

// ---------- 作品一覧の構造化データの件数 ----------
for (const page of ['works/index.html', 'en/works/index.html']){
  if (!exists.has(page)){ errors.push(`${page} がありません`); continue; }
  const src = readFileSync(join(dir, page), 'utf8');
  let listed = null;
  for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)){
    let j;
    try { j = JSON.parse(m[1]); } catch (e){ errors.push(`${page}: 構造化データがJSONとして読めません（${e.message}）`); continue; }
    for (const node of [j, ...(j['@graph'] || [])]){
      if (node['@type'] === 'ItemList') listed = (node.itemListElement || []).length;
    }
  }
  const works = (src.match(/\bid:"[^"]+"/g) || []).length;
  const tiles = (src.match(/class="archive-tile[^"]*"[^>]*data-id="/g) || []).length;
  if (listed === null) errors.push(`${page}: 作品の構造化データ（ItemList）がありません`);
  else if (listed !== works || listed !== tiles) errors.push(`${page}: 作品の構造化データが${listed}件ですが、作品データは${works}件、一覧は${tiles}件です（data/works.json を直して node tools/build.mjs を実行してください）`);
  else console.log(`${page}: 作品の構造化データ ${listed}件（作品データ・一覧と一致）`);
}

// ---------- 全ページの構造化データがJSONとして読めるか ----------
for (const page of files.filter((f) => f.endsWith('.html'))){
  const src = readFileSync(join(dir, page), 'utf8');
  for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)){
    try { JSON.parse(m[1]); } catch (e){ errors.push(`${page}: 構造化データがJSONとして読めません（${e.message}）`); }
  }
}

// ---------- sitemap.xml ----------
if (exists.has('sitemap.xml')){
  const sm = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
  for (const b of sm.match(/<url>[\s\S]*?<\/url>/g) || []){
    const loc = (b.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    const lastmod = (b.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    if (!loc || !loc.startsWith(SITE_URL)){ errors.push(`sitemap.xml: loc が正しくありません（${loc}）`); continue; }
    check('sitemap.xml', loc, 'loc');
    if (lastmod !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) errors.push(`sitemap.xml: ${loc} の更新日の書式が正しくありません（${lastmod}）`);
  }
} else errors.push('sitemap.xml がありません');

if (errors.length){
  console.error(`不合格（${errors.length}件）:`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`合格: ${files.length}ファイル、参照先の欠け 0件`);
