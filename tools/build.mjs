#!/usr/bin/env node
// data/exhibitions.json から、HTMLの目印（<!-- build:名前 --> 〜 <!-- /build:名前 -->）の内側を書き換える。
// 追加パッケージなし（Node.jsだけで動く）。生成結果はそのままコミットし、公開の仕組み（GitHub Pages）は変えない。
//
//   node tools/build.mjs                    今日の日付で生成して書き込む
//   node tools/build.mjs --check            書き込まずに、HTMLが最新か確かめる（古ければ終了コード1）
//   node tools/build.mjs --today 2026-09-01 基準日を変えて生成する（動作確認用）

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : null;
const TODAY = todayArg || jstDate(new Date());

function jstDate(d){
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

const data = JSON.parse(readFileSync(join(ROOT, 'data/exhibitions.json'), 'utf8'));
const all = data.exhibitions;

// ---------- 分類（基準日 TODAY で判定） ----------
const ended = (e) => !e.permanent && e.end < TODAY;
const byStartAsc = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
const featured = all.filter((e) => e.featured && !ended(e)).sort(byStartAsc)[0] || null;
const upcoming = [
  ...all.filter((e) => e.permanent),
  ...all.filter((e) => !e.permanent && !ended(e) && e !== featured).sort(byStartAsc),
];
const past = all.filter(ended).sort((a, b) => -byStartAsc(a, b));
const events = all.filter((e) => !e.permanent && !ended(e)).sort(byStartAsc);
const sales = all.filter((e) => e.showOnSales && !e.permanent && !ended(e)).sort(byStartAsc);

// ---------- 表記 ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ymd(s){ const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function period(e, lang){
  if (e.permanent) return lang === 'ja' ? '常設展示' : 'Ongoing';
  const a = ymd(e.start), b = ymd(e.end);
  if (lang === 'ja') return `${a.y}.${a.m}.${a.d} — ${b.m}.${b.d}`;
  const left = `${MON[a.m - 1]} ${a.d}`;
  const right = a.m === b.m ? `${b.d}` : `${MON[b.m - 1]} ${b.d}`;
  return `${left} — ${right}, ${b.y}`;
}
const attr = (s) => s.replace(/&(?!nbsp;|amp;|quot;)/g, '&amp;').replace(/"/g, '&quot;');
const T = {
  ja: { planned: '（予定）', ended: '（終了）', more: 'その他の展示', past: '過去の展示',
        soon: 'まもなく開催', now: '開催中', over: '会期終了', site: 'サイトを見る →',
        salesHead: '展示中・開催予定', performer: '河﨑海斗' },
  en: { planned: '(Planned)', ended: '(Ended)', more: 'Other Exhibitions', past: 'Past Exhibitions',
        soon: 'Opening soon', now: 'On view now', over: 'Exhibition ended', site: 'Visit site →',
        salesHead: 'Current &amp; Upcoming Exhibitions', performer: 'Kaito Kawasaki' },
};
function status(e, lang){
  if (TODAY < e.start) return T[lang].soon;
  if (TODAY <= e.end) return T[lang].now;
  return T[lang].over;
}

// ---------- 生成 ----------
function listItem(e, lang, tag){
  const t = e[lang];
  const tagHtml = tag ? `<span class="ended-tag">${tag}</span>` : '';
  return [
    '        <li>',
    `          <time>${period(e, lang)}</time>`,
    `          <div><strong>${t.listTitle}${tagHtml}</strong><span class="venue">${t.venue}</span></div>`,
    '        </li>',
  ].join('\n');
}

function topExhibitions(lang, img){
  const L = T[lang];
  const out = [];
  if (featured){
    const t = featured[lang];
    out.push(
      '    <div class="exhi-feature">',
      `      <div class="exhi-feature-dm" data-edit-slot="dm" data-edit-ratio="0.75" data-edit-path="${img}${featured.image.replace(/^img\//, '')}" data-edit-label="${t.imageLabel}" data-edit-where="index.html の .exhi-feature-dm img"><img src="${img}${featured.image.replace(/^img\//, '')}" alt="${attr(t.imageAlt)}" loading="lazy"></div>`,
      '      <div class="exhi-feature-body">',
      `        <span class="exhi-feature-status" id="exhiStatus">${status(featured, lang)}</span>`,
      `        <h3>${t.title}</h3>`,
      `        <time>${period(featured, lang)}</time>`,
      `        <p class="venue">${t.venue}</p>`,
      `        <p>${t.text}</p>`,
      '      </div>',
      '    </div>',
      '',
    );
  }
  out.push(
    '    <div class="exhi-more">',
    `      <h3>${L.more}</h3>`,
    '      <ul class="exhi-list">',
    ...upcoming.map((e) => listItem(e, lang, e.planned ? L.planned : '')),
    '      </ul>',
    '    </div>',
  );
  if (past.length){
    out.push(
      '',
      '    <div class="exhi-past">',
      `      <h3>${L.past}</h3>`,
      '      <ul class="exhi-list exhi-list-past">',
      ...past.map((e) => listItem(e, lang, L.ended)),
      '      </ul>',
      '    </div>',
    );
  }
  return out.join('\n');
}

function jsonld(lang){
  const q = JSON.stringify;
  const items = events.map((e) => {
    const p = e.place[lang];
    const addr = [
      '"@type": "PostalAddress"',
      ...(p.streetAddress ? [`"streetAddress": ${q(p.streetAddress)}`] : []),
      `"addressLocality": ${q(p.locality)}`,
      `"addressRegion": ${q(p.region)}`,
      '"addressCountry": "JP"',
    ].join(', ');
    return [
      '    {',
      '      "@type": "Event",',
      `      "name": ${q(e[lang].title)},`,
      `      "startDate": "${e.start}",`,
      `      "endDate": "${e.end}",`,
      '      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",',
      '      "eventStatus": "https://schema.org/EventScheduled",',
      '      "location": {',
      '        "@type": "Place",',
      `        "name": ${q(p.name)},`,
      `        "address": { ${addr} }`,
      '      },',
      `      "performer": { "@type": "Person", "name": ${q(T[lang].performer)} }${e.url ? ',' : ''}`,
      ...(e.url ? [`      "url": ${q(e.url)}`] : []),
      '    }',
    ].join('\n');
  });
  return [
    '<script type="application/ld+json">',
    '{',
    '  "@context": "https://schema.org",',
    '  "@graph": [',
    items.join(',\n'),
    '  ]',
    '}',
    '</script>',
  ].join('\n');
}

function statusDates(){
  if (!featured) return "    var exhiStart = null;\n    var exhiEnd = null;";
  return [
    `    var exhiStart = new Date('${featured.start}T00:00:00+09:00');`,
    `    var exhiEnd = new Date('${featured.end}T23:59:59+09:00');`,
  ].join('\n');
}

function salesGroup(lang, img){
  const L = T[lang];
  const items = sales.map((e) => {
    const t = e[lang];
    const title = (e === featured ? t.title : t.listTitle) + (e.planned ? (lang === 'ja' ? L.planned : ' ' + L.planned) : '');
    const thumb = e.salesImage
      ? `<img src="${img}${e.salesImage.replace(/^img\//, '')}" alt="${attr(t.salesImageAlt)}" loading="lazy">`
      : `<span class="sales-thumb-kanji">${e.salesKanji}</span>`;
    return [
      '        <li>',
      `          <div class="sales-thumb">${thumb}</div>`,
      '          <div class="sales-name">',
      `            <time>${period(e, lang)}</time>`,
      `            <strong>${title}</strong>`,
      `            <span class="sales-venue">${t.venue}</span>`,
      '          </div>',
      ...(e.url ? [`          <a class="sales-link" href="${e.url}" target="_blank" rel="noopener">${L.site}</a>`] : []),
      '        </li>',
    ].join('\n');
  });
  return [
    '    <div class="sales-group">',
    `      <h3>${L.salesHead}</h3>`,
    '      <ul class="sales-list">',
    ...items,
    '      </ul>',
    '    </div>',
  ].join('\n');
}

// ---------- sitemap の lastmod ----------
function lastmodFor(file){
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty) return TODAY;
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    return d || null;
  } catch { return null; }
}
function buildSitemap(src){
  return src.replace(/(<loc>https:\/\/kaitokawasaki\.com\/([^<]*)<\/loc>\s*<lastmod>)([^<]*)(<\/lastmod>)/g,
    (m, a, path, old, b) => a + (lastmodFor(path + 'index.html') || old) + b);
}

// ---------- 目印の範囲を差し替える ----------
function replaceRegion(html, name, body, file){
  const re = new RegExp(`(<!-- build:${name} -->|/\\* build:${name} \\*/)\\n[\\s\\S]*?\\n([ \\t]*)(<!-- /build:${name} -->|/\\* /build:${name} \\*/)`);
  if (!re.test(html)) throw new Error(`${file}: 目印 build:${name} が見つかりません`);
  return html.replace(re, (m, open, indent, close) => `${open}\n${body}\n${indent}${close}`);
}

const pages = [
  { file: 'index.html', regions: { 'exhibitions-jsonld': () => jsonld('ja'), exhibitions: () => topExhibitions('ja', 'img/'), 'exhibition-dates': statusDates } },
  { file: 'en/index.html', regions: { 'exhibitions-jsonld': () => jsonld('en'), exhibitions: () => topExhibitions('en', '../img/'), 'exhibition-dates': statusDates } },
  { file: 'sales/index.html', regions: { exhibitions: () => salesGroup('ja', '../img/') } },
  { file: 'en/sales/index.html', regions: { exhibitions: () => salesGroup('en', '../../img/') } },
];

const results = {};
for (const p of pages){
  const src = readFileSync(join(ROOT, p.file), 'utf8');
  let out = src;
  for (const [name, gen] of Object.entries(p.regions)) out = replaceRegion(out, name, gen(), p.file);
  results[p.file] = { src, out };
}
// sitemap はHTMLを書き込んだ後の状態で判定したいので、HTMLの結果を書いてから作る
let stale = [];
for (const [file, { src, out }] of Object.entries(results)){
  if (src !== out){
    stale.push(file);
    if (!CHECK) writeFileSync(join(ROOT, file), out);
  }
}
if (!CHECK){
  const smSrc = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const smOut = buildSitemap(smSrc);
  if (smSrc !== smOut){ writeFileSync(join(ROOT, 'sitemap.xml'), smOut); stale.push('sitemap.xml'); }
}

// 終わった展示がデータ上「注目展示」のまま残っていたら知らせる
for (const e of all.filter((e) => e.featured && ended(e))){
  console.warn(`注意: ${e.id} は会期が終わっています（${e.end}）。過去の展示に移しました。次の注目展示に featured: true を付けてください。`);
}
if (!featured) console.warn('注意: 注目展示（featured: true で会期中・開催前のもの）がありません。');

if (CHECK){
  if (stale.length){
    console.error(`HTMLがデータと食い違っています: ${stale.join(', ')}\n→ node tools/build.mjs を実行してください。`);
    process.exit(1);
  }
  console.log('展示情報: HTMLはデータと一致しています。');
} else {
  console.log(stale.length ? `更新しました（基準日 ${TODAY}）: ${stale.join(', ')}` : `変更なし（基準日 ${TODAY}）`);
}
