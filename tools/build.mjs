#!/usr/bin/env node
// data/exhibitions.json（展示情報の正本）から、HTMLの目印の内側と sitemap.xml の更新日を書き換える。
// 追加パッケージなし（Node.jsだけで動く）。生成結果はそのままコミットし、公開の仕組みは変えない。
//
//   node tools/build.mjs                     今日（日本時間）の日付で生成して書き込む
//   node tools/build.mjs --check             書き込まずに、HTMLが最新か確かめる（古ければ終了コード1）
//   node tools/build.mjs --today 2026-10-21  基準日を変えて生成する（動作確認用）
//   node tools/build.mjs --check --since main  比較の基準にするコミットを変える（更新日の付け忘れ警告用）
//
// 書き込みの前に、台帳の誤り・目印の欠落や重複を調べ、1つでもあれば何も書かずに止まる。
// 書き込みは全ファイル分を作ってからまとめて行い、途中で失敗したら書いた分を元に戻す。

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kaitokawasaki.com/';

// ---------- 引数 ----------
const args = process.argv.slice(2);
function argValue(name){
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  if (!v || v.startsWith('--')) fail([`${name} の後に値を書いてください`]);
  return v;
}
const CHECK = args.includes('--check');
const SINCE = argValue('--since') || 'HEAD';
const todayArg = argValue('--today');
if (todayArg && !isValidDate(todayArg)) fail([`--today の日付が正しくありません: ${todayArg}`]);
const TODAY = todayArg || jstDate(new Date());

function jstDate(d){
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function isValidDate(s){
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function addDays(s, n){
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fail(errors){
  console.error('止めました（ファイルは何も書き換えていません）:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// ---------- 文字の扱い ----------
// 普通の文字の項目：記号を変換してからHTMLに入れる
const text = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => text(s).replace(/"/g, '&quot;');
// 「HTML可」の項目（listTitle・venue）：文字参照だけを許し、タグは許さない（検査済みの値をそのまま入れる）
const ALLOWED_ENTITY = /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);/g;
// 構造化データ：JSONの文字列にし、</ などでscriptが途中で閉じないよう < > & を変換する
const json = (s) => JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// ---------- 台帳の読み込みと検査 ----------
const KEYS = {
  top: ['_readme', 'exhibitions'],
  exhibition: ['id', 'permanent', 'start', 'end', 'featured', 'planned', 'url', 'image', 'showOnSales',
    'salesImage', 'salesKanji', 'ja', 'en', 'place'],
  lang: ['title', 'listTitle', 'venue', 'text', 'imageAlt', 'imageLabel', 'salesImageAlt'],
  place: ['name', 'streetAddress', 'locality', 'region'],
};
const HTML_FIELDS = ['listTitle', 'venue'];

function validate(data){
  const errors = [];
  const unknown = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${where}: 知らない項目「${k}」があります（綴りを確かめてください）`);
  };
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  if (!data || typeof data !== 'object' || !Array.isArray(data.exhibitions)){
    return ['data/exhibitions.json に exhibitions の一覧がありません'];
  }
  unknown(data, KEYS.top, 'data/exhibitions.json');
  const ids = new Set();
  data.exhibitions.forEach((e, i) => {
    const w = `展示${i + 1}件目（${e && e.id ? e.id : 'idなし'}）`;
    if (!e || typeof e !== 'object'){ errors.push(`${w}: 形式が正しくありません`); return; }
    unknown(e, KEYS.exhibition, w);
    if (!str(e.id) || !/^[a-z0-9-]+$/.test(e.id)) errors.push(`${w}: id は半角英小文字・数字・ハイフンで書いてください`);
    else if (ids.has(e.id)) errors.push(`${w}: id「${e.id}」が重複しています`);
    else ids.add(e.id);
    for (const k of ['permanent', 'featured', 'planned', 'showOnSales']){
      if (k in e && typeof e[k] !== 'boolean') errors.push(`${w}: ${k} は true か false で書いてください`);
    }
    if (e.permanent){
      if ('start' in e || 'end' in e) errors.push(`${w}: 常設展示には start・end を書かないでください`);
      if (e.featured) errors.push(`${w}: 常設展示は注目展示（featured）にできません`);
      if (e.showOnSales) errors.push(`${w}: 常設展示は販売情報ページには出せません（showOnSales を外してください）`);
    } else {
      if (!isValidDate(e.start)) errors.push(`${w}: 開始日 start が YYYY-MM-DD の正しい日付ではありません（${e.start}）`);
      if (!isValidDate(e.end)) errors.push(`${w}: 終了日 end が YYYY-MM-DD の正しい日付ではありません（${e.end}）`);
      if (isValidDate(e.start) && isValidDate(e.end) && e.start > e.end) errors.push(`${w}: 開始日 ${e.start} が終了日 ${e.end} より後になっています`);
    }
    if ('url' in e && !(str(e.url) && /^https:\/\/[^\s"<>]+$/.test(e.url))) errors.push(`${w}: url は https:// で始まるURLにしてください`);
    for (const k of ['image', 'salesImage']){
      if (!(k in e)) continue;
      if (!str(e[k]) || !/^img\/[\w.\-]+$/.test(e[k])) errors.push(`${w}: ${k} は img/ フォルダのファイル名で書いてください`);
      else if (!existsSync(join(ROOT, e[k]))) errors.push(`${w}: 画像 ${e[k]} が見つかりません`);
    }
    if ('salesKanji' in e && !(typeof e.salesKanji === 'string' && [...e.salesKanji].length === 1)) errors.push(`${w}: salesKanji は1文字にしてください`);
    const ended = !e.permanent && isValidDate(e.end) && e.end < TODAY;
    for (const lang of ['ja', 'en']){
      const t = e[lang];
      const lw = `${w} の ${lang}`;
      if (!t || typeof t !== 'object'){ errors.push(`${lw}: 日本語・英語の両方が必要です`); continue; }
      unknown(t, KEYS.lang, lw);
      for (const [k, v] of Object.entries(t)){
        if (typeof v !== 'string'){ errors.push(`${lw}.${k}: 文字で書いてください`); continue; }
        if (HTML_FIELDS.includes(k)){
          if (/[<>]/.test(v)) errors.push(`${lw}.${k}: タグ（< >）は使えません`);
          if (/&/.test(v.replace(ALLOWED_ENTITY, ''))) errors.push(`${lw}.${k}: & は &amp; と書くか、&nbsp; などの文字参照にしてください`);
        } else if (/&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/.test(v)){
          errors.push(`${lw}.${k}: この項目では &nbsp; などの文字参照は使えません（普通の文字で書いてください）`);
        }
      }
      const need = ['listTitle', 'venue'];
      if (!e.permanent) need.push('title');
      if (e.featured) need.push('text', 'imageAlt', 'imageLabel');
      if (e.salesImage) need.push('salesImageAlt');
      for (const k of need) if (!str(t[k])) errors.push(`${lw}: ${k} がありません`);
    }
    if (e.featured && !e.image) errors.push(`${w}: 注目展示（featured）には告知画像 image が必要です`);
    if (e.showOnSales && !e.salesImage && !e.salesKanji) errors.push(`${w}: 販売情報ページに出すには salesImage か salesKanji が必要です`);
    if (!e.permanent && !ended){
      // 構造化データに載る展示（終わっていないもの）は会場情報が必要
      if (!e.place || typeof e.place !== 'object') errors.push(`${w}: 会場情報 place（ja・en）がありません`);
      else for (const lang of ['ja', 'en']){
        const p = e.place[lang];
        if (!p || typeof p !== 'object'){ errors.push(`${w}: place.${lang} がありません`); continue; }
        unknown(p, KEYS.place, `${w} の place.${lang}`);
        for (const k of ['name', 'locality', 'region']) if (!str(p[k])) errors.push(`${w}: place.${lang}.${k} がありません`);
        if ('streetAddress' in p && !str(p.streetAddress)) errors.push(`${w}: place.${lang}.streetAddress が空です`);
      }
    }
  });
  return errors;
}

// ---------- 分類（基準日で判定。日本時間、最終日はその日いっぱい開催中） ----------
function classify(all, today){
  const ended = (e) => !e.permanent && e.end < today;
  const ongoing = (e) => !e.permanent && e.start <= today && today <= e.end;
  const upcoming = (e) => !e.permanent && today < e.start;
  const by = (k, dir = 1) => (a, b) => (a[k] < b[k] ? -dir : a[k] > b[k] ? dir : 0); // 同じなら台帳の順（安定ソート）
  const featured =
    all.filter((e) => e.featured && ongoing(e)).sort(by('end'))[0] ||
    all.filter((e) => e.featured && upcoming(e)).sort(by('start'))[0] ||
    null;
  const current = all.filter((e) => !e.permanent && !ended(e)).sort(by('start'));
  return {
    featured,
    others: [...all.filter((e) => e.permanent), ...current.filter((e) => e !== featured)],
    past: all.filter(ended).sort(by('start', -1)),
    events: current,
    sales: current.filter((e) => e.showOnSales),
  };
}

// ---------- 表記 ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function ymd(s){ const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
function period(e, lang){
  if (e.permanent) return lang === 'ja' ? '常設展示' : 'Ongoing';
  const a = ymd(e.start), b = ymd(e.end);
  if (lang === 'ja'){
    if (e.start === e.end) return `${a.y}.${a.m}.${a.d}`;
    return a.y === b.y ? `${a.y}.${a.m}.${a.d} — ${b.m}.${b.d}` : `${a.y}.${a.m}.${a.d} — ${b.y}.${b.m}.${b.d}`;
  }
  if (e.start === e.end) return `${MON[a.m - 1]} ${a.d}, ${a.y}`;
  if (a.y !== b.y) return `${MON[a.m - 1]} ${a.d}, ${a.y} — ${MON[b.m - 1]} ${b.d}, ${b.y}`;
  const right = a.m === b.m ? `${b.d}` : `${MON[b.m - 1]} ${b.d}`;
  return `${MON[a.m - 1]} ${a.d} — ${right}, ${b.y}`;
}
const T = {
  ja: { planned: '（予定）', plannedSales: '（予定）', ended: '（終了）', more: 'その他の展示', past: '過去の展示',
        site: 'サイトを見る →', salesHead: '展示中・開催予定', performer: '河﨑海斗' },
  en: { planned: '(Planned)', plannedSales: ' (Planned)', ended: '(Ended)', more: 'Other Exhibitions', past: 'Past Exhibitions',
        site: 'Visit site →', salesHead: 'Current &amp; Upcoming Exhibitions', performer: 'Kaito Kawasaki' },
};

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

function topExhibitions(c, lang, img){
  const L = T[lang];
  const out = [];
  const f = c.featured;
  if (f){
    const t = f[lang];
    const src = attr(img + f.image);
    out.push(
      '    <div class="exhi-feature">',
      `      <div class="exhi-feature-dm" data-edit-slot="dm" data-edit-ratio="0.75" data-edit-path="${src}" data-edit-label="${attr(t.imageLabel)}" data-edit-where="index.html の .exhi-feature-dm img"><img src="${src}" alt="${attr(t.imageAlt)}" loading="lazy"></div>`,
      '      <div class="exhi-feature-body">',
      // 状態はHTMLに書かない（公開日によって誤表示になるため）。ページ内のスクリプトが日本時間で判定して表示する
      '        <span class="exhi-feature-status" id="exhiStatus" hidden></span>',
      `        <h3>${text(t.title)}</h3>`,
      `        <time>${period(f, lang)}</time>`,
      `        <p class="venue">${t.venue}</p>`,
      `        <p>${text(t.text)}</p>`,
      '      </div>',
      '    </div>',
    );
  }
  const block = (cls, ulCls, head, items) => {
    if (!items.length) return;
    if (out.length) out.push('');
    out.push(
      `    <div class="${cls}">`,
      `      <h3>${head}</h3>`,
      `      <ul class="${ulCls}">`,
      ...items,
      '      </ul>',
      '    </div>',
    );
  };
  block('exhi-more', 'exhi-list', L.more, c.others.map((e) => listItem(e, lang, e.planned ? L.planned : '')));
  block('exhi-past', 'exhi-list exhi-list-past', L.past, c.past.map((e) => listItem(e, lang, L.ended)));
  return out.join('\n');
}

function eventsJsonld(c, lang){
  const items = c.events.map((e) => {
    const p = e.place[lang];
    const addr = [
      '"@type": "PostalAddress"',
      ...(p.streetAddress ? [`"streetAddress": ${json(p.streetAddress)}`] : []),
      `"addressLocality": ${json(p.locality)}`,
      `"addressRegion": ${json(p.region)}`,
      '"addressCountry": "JP"',
    ].join(', ');
    return [
      '    {',
      '      "@type": "Event",',
      `      "name": ${json(e[lang].title)},`,
      `      "startDate": "${e.start}",`,
      `      "endDate": "${e.end}",`,
      '      "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",',
      '      "eventStatus": "https://schema.org/EventScheduled",',
      '      "location": {',
      '        "@type": "Place",',
      `        "name": ${json(p.name)},`,
      `        "address": { ${addr} }`,
      '      },',
      `      "performer": { "@type": "Person", "name": ${json(T[lang].performer)} }${e.url ? ',' : ''}`,
      ...(e.url ? [`      "url": ${json(e.url)}`] : []),
      '    }',
    ].join('\n');
  });
  if (!items.length) return '';
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

function statusDates(c){
  if (!c.featured) return '    var exhiStart = null;\n    var exhiEnd = null;';
  return [
    `    var exhiStart = new Date('${c.featured.start}T00:00:00+09:00');`,
    `    var exhiEnd = new Date('${c.featured.end}T23:59:59+09:00');`,
  ].join('\n');
}

function salesGroup(c, lang, img){
  const L = T[lang];
  if (!c.sales.length) return '';
  const items = c.sales.map((e) => {
    const t = e[lang];
    const thumb = e.salesImage
      ? `<img src="${attr(img + e.salesImage)}" alt="${attr(t.salesImageAlt)}" loading="lazy">`
      : `<span class="sales-thumb-kanji">${text(e.salesKanji)}</span>`;
    return [
      '        <li>',
      `          <div class="sales-thumb">${thumb}</div>`,
      '          <div class="sales-name">',
      `            <time>${period(e, lang)}</time>`,
      `            <strong>${t.listTitle}${e.planned ? L.plannedSales : ''}</strong>`,
      `            <span class="sales-venue">${t.venue}</span>`,
      '          </div>',
      ...(e.url ? [`          <a class="sales-link" href="${attr(e.url)}" target="_blank" rel="noopener">${L.site}</a>`] : []),
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

// どのページのどの目印に何を入れるか。kind: top=トップ / sales=販売情報（sitemap の更新日の判定に使う）
const PAGES = [
  { file: 'index.html', kind: 'top', regions: {
    'exhibitions-jsonld': (c) => eventsJsonld(c, 'ja'), exhibitions: (c) => topExhibitions(c, 'ja', ''), 'exhibition-dates': statusDates } },
  { file: 'en/index.html', kind: 'top', regions: {
    'exhibitions-jsonld': (c) => eventsJsonld(c, 'en'), exhibitions: (c) => topExhibitions(c, 'en', '../'), 'exhibition-dates': statusDates } },
  { file: 'sales/index.html', kind: 'sales', regions: { exhibitions: (c) => salesGroup(c, 'ja', '../') } },
  { file: 'en/sales/index.html', kind: 'sales', regions: { exhibitions: (c) => salesGroup(c, 'en', '../../') } },
];

// ---------- 目印 ----------
// HTML: <!-- build:名前 --> 〜 <!-- /build:名前 -->、スクリプト内: /* build:名前 */ 〜 /* /build:名前 */
// 開始と終了はそれぞれ単独の行に置き、ちょうど1組ずつ・開始→終了の順にあること
const MARKER = /<!-- (\/?)build:([\w-]+) -->|\/\* (\/?)build:([\w-]+) \*\//g;

function findRegions(html, file, names){
  const errors = [];
  const found = {};
  for (const m of html.matchAll(MARKER)){
    const close = (m[1] ?? m[3]) === '/';
    const name = m[2] ?? m[4];
    const lineStart = html.lastIndexOf('\n', m.index) + 1;
    const lineEnd = html.indexOf('\n', m.index);
    const line = html.slice(lineStart, lineEnd < 0 ? html.length : lineEnd);
    const lineNo = html.slice(0, m.index).split('\n').length;
    if (line.trim() !== m[0]){ errors.push(`${file} ${lineNo}行目: 目印 ${m[0]} は単独の行に置いてください`); continue; }
    if (!names.includes(name)){ errors.push(`${file} ${lineNo}行目: 知らない目印 build:${name} があります`); continue; }
    (found[name] ||= { open: [], close: [] })[close ? 'close' : 'open'].push({ lineStart, lineEnd, lineNo });
  }
  const regions = [];
  for (const name of names){
    const f = found[name] || { open: [], close: [] };
    if (f.open.length !== 1 || f.close.length !== 1){
      errors.push(`${file}: 目印 build:${name} の開始が${f.open.length}個、終了が${f.close.length}個あります（それぞれちょうど1個必要）`);
      continue;
    }
    const [o] = f.open, [c] = f.close;
    if (o.lineStart > c.lineStart){ errors.push(`${file}: 目印 build:${name} の終了（${c.lineNo}行目）が開始（${o.lineNo}行目）より前にあります`); continue; }
    regions.push({ name, innerStart: o.lineEnd + 1, innerEnd: c.lineStart });
  }
  regions.sort((a, b) => a.innerStart - b.innerStart);
  for (let i = 1; i < regions.length; i++){
    if (regions[i].innerStart < regions[i - 1].innerEnd) errors.push(`${file}: 目印 build:${regions[i - 1].name} と build:${regions[i].name} の範囲が重なっています`);
  }
  return { regions, errors };
}

function outside(html, regions){
  let s = '', pos = 0;
  for (const r of regions){ s += html.slice(pos, r.innerStart) + '\u0000'; pos = r.innerEnd; }
  return s + html.slice(pos);
}

function render(html, file, gens, c){
  const { regions, errors } = findRegions(html, file, Object.keys(gens));
  if (errors.length) return { errors };
  let out = '', pos = 0;
  for (const r of regions){
    const body = gens[r.name](c);
    out += html.slice(pos, r.innerStart) + (body ? body + '\n' : '');
    pos = r.innerEnd;
  }
  out += html.slice(pos);
  // 目印の外側が1バイトも変わっていないことを、書き換え後のHTMLを読み直して確かめる
  const again = findRegions(out, file, Object.keys(gens));
  if (again.errors.length || outside(out, again.regions) !== outside(html, regions)){
    return { errors: [`${file}: 目印の外側が変わってしまうため止めました（目印の中に目印の文字列が入っていないか確かめてください）`] };
  }
  return { out, errors: [] };
}

// ---------- sitemap の更新日 ----------
// 4ページ（日英トップ・日英販売情報）の更新日は、次のうち最も新しい日にする。
//   ・今回のビルドでページの中身が変わったら、その日（基準日）
//   ・展示の切り替わり日のうち基準日までに来たもの（展示が終わった翌日、注目展示の開始日）
//   ・今 sitemap に書いてある日
// それ以外のページの更新日は、内容を変えたときに手で書き換える（--check で付け忘れを警告する）。
function boundaries(all, kind){
  const days = [];
  for (const e of all){
    if (e.permanent) continue;
    if (kind === 'sales' && !e.showOnSales) continue;
    days.push(addDays(e.end, 1));
    if (kind === 'top' && e.featured) days.push(e.start);
  }
  return days.filter((d) => d <= TODAY);
}
function pageOfLoc(loc){
  return loc.startsWith(SITE) ? loc.slice(SITE.length) + 'index.html' : null;
}
function updateSitemap(src, changed, all){
  const kinds = Object.fromEntries(PAGES.map((p) => [p.file, p.kind]));
  return src.replace(/<url>[\s\S]*?<\/url>/g, (block) => {
    const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    const file = loc && pageOfLoc(loc);
    if (!file || !kinds[file]) return block;
    const cur = (block.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    const cands = [...boundaries(all, kinds[file]), ...(changed.has(file) ? [TODAY] : []), ...(isValidDate(cur) ? [cur] : [])];
    if (!cands.length) return block;
    const next = cands.sort().at(-1);
    if (cur) return block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${next}</lastmod>`);
    return block.replace(/(\n([ \t]*)<loc>[^<]*<\/loc>)/, `$1\n$2<lastmod>${next}</lastmod>`);
  });
}

// ページを変えたのに sitemap の更新日が変わっていなければ警告する（公開は止めない）
function lastmodWarnings(sitemapNow){
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let before;
  try { before = git('show', `${SINCE}:sitemap.xml`); } catch { return [`更新日の付け忘れ確認は省きました（git の ${SINCE} と比べられません）`]; }
  const lastmods = (xml) => Object.fromEntries([...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map(([b]) => [
    (b.match(/<loc>([^<]*)<\/loc>/) || [])[1], (b.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1] || null]));
  const a = lastmods(before), b = lastmods(sitemapNow);
  const warns = [];
  for (const loc of Object.keys(b)){
    const file = pageOfLoc(loc);
    if (!file) continue;
    let changed;
    try { git('diff', '--quiet', SINCE, '--', file); changed = false; } catch { changed = true; }
    if (changed && a[loc] === b[loc]) warns.push(`${file} が ${SINCE} から変わっていますが、sitemap.xml の更新日（${b[loc] || 'なし'}）がそのままです。読む人に見える内容を変えたなら、更新日を今日にしてください`);
  }
  return warns;
}

// ---------- 書き込み（全部作ってから。途中で失敗したら元に戻す） ----------
function writeAll(changes){
  const done = [];
  const temps = [];
  try {
    for (const ch of changes){
      const tmp = join(ROOT, ch.file + '.build-tmp');
      writeFileSync(tmp, ch.out);
      temps.push(tmp);
    }
    changes.forEach((ch, i) => {
      if (process.env.BUILD_TEST_FAIL_AT === String(i)) throw new Error('テスト用の意図的な失敗');
      renameSync(temps[i], join(ROOT, ch.file));
      done.push(ch);
    });
  } catch (err){
    for (const ch of done){ try { writeFileSync(join(ROOT, ch.file), ch.src); } catch {} }
    for (const t of temps){ try { unlinkSync(t); } catch {} }
    console.error(`書き込みの途中で失敗したため、書き込んだ ${done.length} 件を元に戻しました: ${err.message}`);
    process.exit(1);
  }
}

// ---------- 本体 ----------
function build(data){
  const c = classify(data.exhibitions, TODAY);
  const errors = [];
  const results = [];
  for (const p of PAGES){
    const src = readFileSync(join(ROOT, p.file), 'utf8');
    const r = render(src, p.file, p.regions, c);
    errors.push(...r.errors);
    if (!r.errors.length) results.push({ file: p.file, src, out: r.out });
  }
  if (errors.length) return { errors };
  const changed = new Set(results.filter((r) => r.src !== r.out).map((r) => r.file));
  const smSrc = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  results.push({ file: 'sitemap.xml', src: smSrc, out: updateSitemap(smSrc, changed, data.exhibitions) });
  return { c, results, errors: [] };
}

let data;
try { data = JSON.parse(readFileSync(join(ROOT, 'data/exhibitions.json'), 'utf8')); }
catch (err){ fail([`data/exhibitions.json を読めません: ${err.message}`]); }
const dataErrors = validate(data);
if (dataErrors.length) fail(dataErrors);

const first = build(data);
if (first.errors.length) fail(first.errors);
// 同じ台帳・同じ日付で2回目を作っても結果が変わらないこと（繰り返し実行しても安全なこと）を確かめる
for (const r of first.results){
  if (r.file === 'sitemap.xml') continue;
  const p = PAGES.find((x) => x.file === r.file);
  const again = render(r.out, r.file, p.regions, first.c);
  if (again.errors.length || again.out !== r.out) fail([`${r.file}: 2回目の生成で結果が変わりました（生成処理の不具合です）`]);
}
const sm = first.results.find((r) => r.file === 'sitemap.xml');
if (updateSitemap(sm.out, new Set(), data.exhibitions) !== sm.out) fail(['sitemap.xml: 2回目の生成で更新日が変わりました（生成処理の不具合です）']);

const changes = first.results.filter((r) => r.src !== r.out);

// ---------- 知らせ ----------
const warns = [];
const { featured } = first.c;
for (const e of data.exhibitions.filter((e) => e.featured && !e.permanent && e.end < TODAY)){
  warns.push(`${e.id} は会期が終わっています（${e.end}）。過去の展示に入れました。featured は外して構いません`);
}
if (!featured) warns.push('注目展示がありません（featured: true で、開催中か開催予定の展示がない）。トップは一覧だけになります');
else {
  const daysLeft = (Date.parse(featured.end) - Date.parse(TODAY)) / 86400000;
  const next = classify(data.exhibitions, addDays(featured.end, 1)).featured;
  if (daysLeft <= 14 && !next) warns.push(`注目展示 ${featured.id} は ${featured.end} に終わりますが、次の注目展示がありません。終了後は注目展示の枠が消え、一覧だけになります`);
}
warns.push(...lastmodWarnings(sm.out));
for (const w of warns) console.warn('注意: ' + w);

if (CHECK){
  if (changes.length){
    console.error(`HTMLが台帳（基準日 ${TODAY}）と食い違っています: ${changes.map((r) => r.file).join(', ')}\n→ node tools/build.mjs を実行してください。`);
    process.exit(1);
  }
  console.log(`展示情報: HTMLは台帳と一致しています（基準日 ${TODAY}）。`);
} else {
  if (changes.length) writeAll(changes);
  console.log(changes.length ? `更新しました（基準日 ${TODAY}）: ${changes.map((r) => r.file).join(', ')}` : `変更なし（基準日 ${TODAY}）`);
}
