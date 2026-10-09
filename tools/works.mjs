// data/works.json（作品情報の正本）の検査と、作品一覧ページ（日・英）の生成。tools/build.mjs から使う。
//
// 台帳から作るもの（作品一覧ページの目印の内側）
//   works-jsonld  … 作品の構造化データ（ItemList / VisualArtwork）
//   works-archive … 制作年・分類ごとの静的な一覧（サムネイル・題名・注記）
//   works-data    … 小窓（モーダル）が使う WORKS 配列
// トップの代表作品と作品の個別ページは生成せず、共通であるべき項目だけ台帳と照合する（checkWorksPages）。

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://kaitokawasaki.com/';

// ---------- 文字の扱い ----------
// 属性・本文に入れる文字：& < > " ' を文字参照にする（今の一覧と同じ書き方）
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
// 構造化データ用：タグを外し、文字参照を文字に戻す
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITY[e] ?? m));
const plain = (html) => decode(html.replace(/<[^>]*>/g, ''));
const lines = (v) => (Array.isArray(v) ? v : [v]);

// ---------- 台帳の検査 ----------
const KEYS = {
  top: ['_readme', 'groups', 'specLabels', 'works'],
  work: ['id', 'year', 'group', 'img', 'pos', 'zoom', 'kanji', 'title', 'yearLabel', 'jaShowsEnTitle', 'motif', 'award', 'desc', 'alt', 'specs', 'keep'],
  keep: ['enListNoZoom', 'jaSubtitleText', 'topTitle'],
};
const PAIRED = ['title', 'yearLabel', 'motif', 'award', 'desc', 'alt'];
const REQUIRED = ['title', 'motif', 'desc'];
// 普通の文字の項目に入れてはいけないもの（小窓の作りが壊れる・文字参照がそのまま見えてしまう）
const BAD_PLAIN = /[<>]|&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/;
// 素材などの欄（小窓では HTML として表示される）：<i>…</i> と文字参照だけを許す
const ALLOWED_ENTITY = /&(?:nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);/g;

export function validateWorks(data, root){
  const errors = [];
  const str = (v) => typeof v === 'string' && v.trim() !== '';
  const unknown = (obj, allowed, where) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${where}: 知らない項目「${k}」があります（綴りを確かめてください）`);
  };
  if (!data || typeof data !== 'object' || !Array.isArray(data.works)) return ['data/works.json に works の一覧がありません'];
  unknown(data, KEYS.top, 'data/works.json');
  const groups = new Set();
  for (const g of Array.isArray(data.groups) ? data.groups : []){
    if (!g || !str(g.key) || !str(g.ja) || !str(g.en)) errors.push('data/works.json の groups: key・ja・en がそろっていない分類があります');
    else if (groups.has(g.key)) errors.push(`data/works.json の groups: 分類「${g.key}」が重複しています`);
    else groups.add(g.key);
  }
  if (!groups.size) errors.push('data/works.json に分類（groups）がありません');
  const labels = data.specLabels && typeof data.specLabels === 'object' ? data.specLabels : {};
  for (const [k, v] of Object.entries(labels)) if (!v || !str(v.ja) || !str(v.en)) errors.push(`data/works.json の specLabels.${k}: ja・en の見出しがそろっていません`);

  const ids = new Set();
  data.works.forEach((w, i) => {
    const at = `作品${i + 1}件目（${w && w.id ? w.id : 'idなし'}）`;
    if (!w || typeof w !== 'object'){ errors.push(`${at}: 形式が正しくありません`); return; }
    unknown(w, KEYS.work, at);
    if (!str(w.id) || !/^[a-z0-9-]+$/.test(w.id)) errors.push(`${at}: id は半角英小文字・数字・ハイフンで書いてください`);
    else if (ids.has(w.id)) errors.push(`${at}: id「${w.id}」が重複しています`);
    else ids.add(w.id);
    if (!Number.isInteger(w.year) || w.year < 1900 || w.year > 2100) errors.push(`${at}: year は西暦の数字で書いてください（${w.year}）`);
    if (!groups.has(w.group)) errors.push(`${at}: 分類 group「${w.group}」が groups にありません`);
    if ('img' in w){
      if (!str(w.img) || !/^img\/[\w.\-]+$/.test(w.img)) errors.push(`${at}: img は img/ フォルダのファイル名で書いてください`);
      else if (!existsSync(join(root, w.img))) errors.push(`${at}: 画像 ${w.img} が見つかりません`);
    } else if (!str(w.kanji)) errors.push(`${at}: 写真（img）がない作品には、代わりに表示する文字 kanji が必要です`);
    if ('kanji' in w && !str(w.kanji)) errors.push(`${at}: kanji が空です`);
    if ('pos' in w && !(typeof w.pos === 'string' && /^\d{1,3}% \d{1,3}%$/.test(w.pos))) errors.push(`${at}: pos は「50% 50%」の形で書いてください`);
    if ('zoom' in w && !(typeof w.zoom === 'string' && /^\d(\.\d{1,2})?$/.test(w.zoom))) errors.push(`${at}: zoom は「1.05」のような文字で書いてください`);
    if (('pos' in w || 'zoom' in w) && !('img' in w)) errors.push(`${at}: 写真がないのに pos・zoom があります`);
    if ('jaShowsEnTitle' in w && w.jaShowsEnTitle !== true) errors.push(`${at}: jaShowsEnTitle は true だけ書けます（出さないときは項目ごと消してください）`);

    for (const k of PAIRED){
      if (!(k in w)){
        if (REQUIRED.includes(k) || (k === 'alt' && 'img' in w)) errors.push(`${at}: ${k} がありません（日本語・英語の両方が必要です）`);
        continue;
      }
      const v = w[k];
      if (!v || typeof v !== 'object'){ errors.push(`${at}: ${k} は {"ja": …, "en": …} の形で書いてください`); continue; }
      unknown(v, ['ja', 'en'], `${at} の ${k}`);
      for (const lang of ['ja', 'en']){
        if (!str(v[lang])) errors.push(`${at}: ${k}.${lang} がありません（日本語・英語の両方が必要です）`);
        else if (BAD_PLAIN.test(v[lang])) errors.push(`${at}: ${k}.${lang} に < > や &amp; などの文字参照は使えません（普通の文字で書いてください）`);
      }
    }

    if (!Array.isArray(w.specs) || !w.specs.length) errors.push(`${at}: specs（素材・技法など）がありません`);
    else w.specs.forEach((s, j) => {
      const sw = `${at} の specs ${j + 1}行目`;
      if (!s || typeof s !== 'object'){ errors.push(`${sw}: 形式が正しくありません`); return; }
      unknown(s, ['key', 'ja', 'en'], sw);
      if (!labels[s.key]) errors.push(`${sw}: 見出し key「${s.key}」が specLabels にありません`);
      const n = {};
      for (const lang of ['ja', 'en']){
        const ls = s[lang];
        if (!(str(ls) || (Array.isArray(ls) && ls.length && ls.every(str)))){ errors.push(`${sw}: ${lang} がありません（日本語・英語の両方が必要です。複数行は ["1行目", "2行目"]）`); continue; }
        n[lang] = lines(ls).length;
        for (const l of lines(ls)){
          const rest = l.replace(/<\/?i>/g, '');
          if (/[<>]/.test(rest)) errors.push(`${sw}.${lang}: 使えるタグは <i>…</i> だけです（改行は ["1行目", "2行目"] と分けて書きます）`);
          if (/&/.test(rest.replace(ALLOWED_ENTITY, ''))) errors.push(`${sw}.${lang}: & は &amp; と書いてください`);
          if ((l.match(/<i>/g) || []).length !== (l.match(/<\/i>/g) || []).length) errors.push(`${sw}.${lang}: <i> と </i> の数が合いません`);
        }
      }
      if (n.ja && n.en && n.ja !== n.en) errors.push(`${sw}: 日本語（${n.ja}行）と英語（${n.en}行）の行数が違います`);
    });

    if ('keep' in w){
      const k = w.keep;
      if (!k || typeof k !== 'object'){ errors.push(`${at}: keep の形式が正しくありません`); return; }
      unknown(k, KEYS.keep, `${at} の keep`);
      if ('enListNoZoom' in k && !(k.enListNoZoom === true && 'zoom' in w)) errors.push(`${at}: keep.enListNoZoom は zoom がある作品にだけ true で書けます`);
      if ('jaSubtitleText' in k && !(str(k.jaSubtitleText) && w.jaShowsEnTitle === true && !BAD_PLAIN.test(k.jaSubtitleText))) errors.push(`${at}: keep.jaSubtitleText は jaShowsEnTitle が true の作品にだけ、普通の文字で書けます`);
      if ('topTitle' in k){
        const t = k.topTitle;
        if (!t || typeof t !== 'object' || !Object.keys(t).length || Object.entries(t).some(([l, v]) => !['ja', 'en'].includes(l) || !str(v))) errors.push(`${at}: keep.topTitle は {"en": "…"} の形で書いてください`);
      }
    }
  });
  return errors;
}

// ---------- 生成 ----------
const PAGE = {
  ja: { file: 'works/index.html', img: '../img/', url: SITE + 'works/', listName: '河﨑海斗 作品一覧', creator: '河﨑海斗' },
  en: { file: 'en/works/index.html', img: '../../img/', url: SITE + 'en/works/', listName: 'All Works by Kaito Kawasaki', creator: 'Kaito Kawasaki' },
};
export const WORKS_FILES = [PAGE.ja.file, PAGE.en.file];

// 小窓が使う形（今の WORKS 配列の1件）に直す
function toWork(w, lang, labels){
  const o = { id: w.id, title: w.title[lang], year: w.year };
  if (w.yearLabel) o.yearLabel = w.yearLabel[lang];
  if (lang === 'ja' && w.jaShowsEnTitle) o.en = w.keep?.jaSubtitleText ?? w.title.en;
  if (lang === 'en') o.en = w.title.ja;
  o.motif = w.motif[lang];
  if (w.award) o.award = w.award[lang];
  o.desc = w.desc[lang];
  o.specs = w.specs.map((s) => [labels[s.key][lang], lines(s[lang]).join('<br>')]);
  if (w.kanji) o.kanji = w.kanji;
  if (w.img){ o.img = PAGE[lang].img + w.img.slice(4); o.alt = w.alt[lang]; }
  if (w.pos) o.pos = w.pos;
  if (w.zoom) o.zoom = w.zoom;
  return o;
}

function worksData(data, lang){
  const q = (s) => JSON.stringify(s);
  return data.works.map((w) => {
    const o = toWork(w, lang, data.specLabels);
    const parts = Object.entries(o).map(([k, v]) => {
      if (k === 'year') return `${k}:${v}`;
      if (k === 'specs') return `${k}:[${v.map((s) => `[${q(s[0])},${q(s[1])}]`).join(',')}]`;
      return `${k}:${q(v)}`;
    });
    return `    { ${parts.join(', ')} }`;
  }).join(',\n').replace(/<\/(script)/gi, '<\\/$1');
}

function tile(w, lang){
  const P = PAGE[lang];
  const title = w.title[lang];
  let visual, path, newPath = '';
  if (w.img){
    path = P.img + w.img.slice(4);
    const zoom = w.zoom && !(lang === 'en' && w.keep?.enListNoZoom) ? w.zoom : null;
    const style = w.pos || zoom ? ` style="${w.pos ? `object-position:${w.pos};` : ''}${zoom ? `--zoom:${zoom};` : ''}"` : '';
    visual = `<img src="${esc(path)}" alt="${esc(w.alt[lang])}" loading="lazy"${style}>`;
  } else {
    path = '';
    newPath = ` data-edit-new-path="${esc(P.img + w.id + '-kaito-kawasaki.jpg')}"`;
    visual = `<span class="kanji">${esc(w.kanji)}</span>`;
  }
  return `<button class="archive-tile" type="button" data-id="${w.id}">` +
    `<span class="tile-visual" data-edit-slot="${w.id}" data-edit-kind="archive" data-edit-ratio="1" data-edit-path="${esc(path)}"${newPath} data-edit-label="${esc(title)}" data-edit-where="${esc(`data/works.json の id:"${w.id}"`)}">${visual}</span>` +
    `<span class="tile-meta"><span class="tile-title">${esc(title)}</span>` +
    (w.yearLabel ? `<span class="tile-note">${esc(w.yearLabel[lang])}</span>` : '') +
    '</span></button>';
}

// 制作年の新しい順 → 分類（groups の順）→ 台帳の順
function worksArchive(data, lang){
  const years = [...new Set(data.works.map((w) => w.year))].sort((a, b) => b - a);
  return years.map((y) => {
    const inYear = data.works.filter((w) => w.year === y);
    const groups = data.groups.filter((g) => inYear.some((w) => w.group === g.key)).map((g) =>
      `<div class="motif-group"><h4 class="motif-head">${esc(g[lang])}</h4><div class="archive-grid">` +
      inYear.filter((w) => w.group === g.key).map((w) => tile(w, lang)).join('') + '</div></div>');
    return `<div class="archive-year"><div class="year-head"><span class="year-num">${y}</span><span class="year-line"></span></div>${groups.join('')}</div>`;
  }).join('');
}

function worksJsonld(data, lang){
  const P = PAGE[lang];
  const spec = (w, key) => { const s = w.specs.find((x) => x.key === key); return s ? plain(lines(s[lang]).join(' ')) : null; };
  const items = data.works.map((w, i) => {
    const o = {
      '@type': 'VisualArtwork',
      name: w.title[lang],
      dateCreated: String(w.year),
      creator: { '@type': 'Person', name: P.creator, url: SITE },
    };
    if (w.img) o.image = SITE + w.img;
    o.description = w.desc[lang];
    const medium = spec(w, 'material'), form = spec(w, 'technique');
    if (medium) o.artMedium = medium;
    if (form) o.artform = form;
    if (w.award) o.award = w.award[lang];
    return { '@type': 'ListItem', position: i + 1, item: o };
  });
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: P.listName, url: P.url, numberOfItems: items.length, itemListElement: items };
  // </script> などで途中で閉じないよう < を変換する（今のデータには < はない）
  return ['<script type="application/ld+json">', JSON.stringify(list, null, 2).replace(/</g, '\\u003c'), '</script>'].join('\n');
}

export function worksRegions(data, lang){
  return {
    'works-jsonld': () => worksJsonld(data, lang),
    'works-archive': () => worksArchive(data, lang),
    'works-data': () => worksData(data, lang),
  };
}

// ---------- トップの代表作品・個別ページとの照合（共通であるべき項目だけ） ----------
// 照合する項目
//   トップの代表作品：リンク先の作品IDが台帳にあること、題名、年（制作年か年の注記のどちらか）
//   個別ページ（works/<id>/index.html）：題名・年の注記・英題・受賞・写真・素材などの欄（同じ見出しの行）、
//     構造化データの name・alternateName・dateCreated・image・artMedium・artform・award
//   説明文・ページ固有の解説や要約・写真の代替テキスト（ページごとに書き分けている）・写真の位置や拡大率・トップの写真は照合しない
export function checkWorksPages(data, read, exists){
  const errors = [];
  const byId = new Map(data.works.map((w) => [w.id, w]));
  const text = (html) => plain(html).trim();

  for (const [file, lang] of [['index.html', 'ja'], ['en/index.html', 'en']]){
    const src = read(file);
    const cards = [...src.matchAll(/<a class="zukan-card" href="works\/#([^"]+)">([\s\S]*?)<\/a>/g)];
    if (!cards.length) errors.push(`${file}: 代表作品（zukan-card）が見つかりません`);
    for (const [, id, body] of cards){
      const w = byId.get(id);
      if (!w){ errors.push(`${file}: 代表作品のリンク先 works/#${id} が台帳にありません`); continue; }
      const m = body.match(/<span class="zukan-title">([\s\S]*?)<small>([\s\S]*?)<\/small><\/span>/);
      if (!m){ errors.push(`${file}: 代表作品 ${id} の題名・年が読めません`); continue; }
      const title = text(m[1]), year = text(m[2]);
      const want = w.keep?.topTitle?.[lang] ?? w.title[lang];
      if (title !== want) errors.push(`${file}: 代表作品 ${id} の題名「${title}」が台帳（${want}）と違います`);
      const years = [String(w.year), ...(w.yearLabel ? [w.yearLabel[lang]] : [])];
      if (!years.includes(year)) errors.push(`${file}: 代表作品 ${id} の年「${year}」が台帳（${years.join(' または ')}）と違います`);
    }
  }

  for (const w of data.works){
    const file = `works/${w.id}/index.html`;
    if (!exists(file)) continue;
    const src = read(file);
    const diff = (what, got, want) => { if (got !== want) errors.push(`${file}: ${what}「${got ?? 'なし'}」が台帳（${want ?? 'なし'}）と違います`); };
    const h1 = src.match(/<h1>([\s\S]*?)<small>([\s\S]*?)<\/small><\/h1>/);
    diff('題名', h1 && text(h1[1]), w.title.ja);
    diff('年の注記', h1 && text(h1[2]), w.yearLabel ? w.yearLabel.ja : String(w.year));
    const sub = src.match(/<p class="work-detail-sub">([\s\S]*?)<\/p>/);
    if (sub || w.jaShowsEnTitle) diff('英題', sub && text(sub[1]), w.jaShowsEnTitle ? (w.keep?.jaSubtitleText ?? w.title.en) : null);
    const award = src.match(/<span class="work-award">([\s\S]*?)<\/span>/);
    diff('受賞', award && text(award[1]), w.award ? w.award.ja : null);
    const img = src.match(/<div class="work-detail-visual"><img src="([^"]*)"/);
    if (w.img || img) diff('写真', img && img[1], w.img ? '../../' + w.img : null);
    const rows = new Map([...src.matchAll(/<div><dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd><\/div>/g)].map((m) => [text(m[1]), m[2]]));
    for (const s of w.specs){
      const label = data.specLabels[s.key].ja;
      diff(`「${label}」の欄`, rows.get(label), lines(s.ja).join('<br>'));
    }
    const ld = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => { try { return JSON.parse(m[1]); } catch { return null; } })
      .find((j) => j && j['@type'] === 'VisualArtwork');
    if (!ld){ errors.push(`${file}: 作品の構造化データ（VisualArtwork）が見つかりません`); continue; }
    const spec = (key) => { const s = w.specs.find((x) => x.key === key); return s ? plain(lines(s.ja).join(' ')) : undefined; };
    const want = {
      name: w.title.ja, alternateName: w.jaShowsEnTitle ? (w.keep?.jaSubtitleText ?? w.title.en) : undefined, dateCreated: String(w.year),
      image: w.img ? SITE + w.img : undefined, artMedium: spec('material'), artform: spec('technique'), award: w.award?.ja,
    };
    for (const [k, v] of Object.entries(want)) if (k in ld || v !== undefined) diff(`構造化データの ${k}`, ld[k], v);
  }
  return errors;
}
