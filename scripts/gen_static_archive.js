// WORKS配列を編集した後、archiveセクションの静的HTMLとJSON-LDを再生成するスクリプト。
// Usage: node scripts/gen_static_archive.js <works/index.html> <archive.html出力先> <正規URL> <ldjson.json出力先>
// 出力後、生成された<archive.html>の中身を<section id="archive">...</section>に貼り直し、
// <ldjson.json>の中身を<head>内の<script type="application/ld+json">に貼り直す。
const fs = require('fs');

const file = process.argv[2]; // works/index.html or en/works/index.html
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/var WORKS = (\[[\s\S]*?\n  \]);/);
if (!m) { console.error('WORKS array not found in', file); process.exit(1); }
const WORKS = new Function('return ' + m[1])();

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 写真が未設定の作品用に、SEOに沿ったファイル名の提案を作る(英題があればそれを使う)
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
function suggestNewPath(w) {
  var base = slugify(w.title) || slugify(w.en) || w.id;
  return '../img/' + base + '-kaito-kawasaki.jpg';
}

function tileVisualHTML(w) {
  if (w.img) {
    var style = "";
    if (w.pos || w.zoom) style = ' style="' + (w.pos ? "object-position:" + w.pos + ";" : "") + (w.zoom ? "--zoom:" + w.zoom + ";" : "") + '"';
    return '<img src="' + w.img + '" alt="' + esc(w.alt || w.title) + '" loading="lazy"' + style + '>';
  }
  return '<span class="kanji">' + esc(w.kanji) + '</span>';
}

var byYear = {};
var years = [];
WORKS.forEach(function (w) {
  if (!byYear[w.year]) { byYear[w.year] = []; years.push(w.year); }
  byYear[w.year].push(w);
});
years.sort(function (a, b) { return b - a; });

var htmlOut = "";
years.forEach(function (y) {
  htmlOut += '<div class="archive-year"><div class="year-head"><span class="year-num">' + y + '</span><span class="year-line"></span></div><div class="archive-grid">';
  byYear[y].forEach(function (w) {
    var newPathAttr = w.img ? "" : (' data-edit-new-path="' + suggestNewPath(w) + '"');
    htmlOut += '<button class="archive-tile" type="button" data-id="' + w.id + '">' +
      '<span class="tile-visual" data-edit-slot="' + w.id + '" data-edit-kind="archive" data-edit-ratio="1" data-edit-path="' + (w.img || "") + '"' + newPathAttr + ' data-edit-label="' + esc(w.title) + '" data-edit-where="works/index.html の WORKS配列 id:&quot;' + w.id + '&quot;">' + tileVisualHTML(w) + '</span>' +
      '<span class="tile-meta"><span class="tile-title">' + esc(w.title) + '</span>' +
      (w.yearLabel ? '<span class="tile-note">' + esc(w.yearLabel) + '</span>' : '') +
      '</span></button>';
  });
  htmlOut += "</div></div>";
});

fs.writeFileSync(process.argv[3], htmlOut, 'utf8');

// Also build JSON-LD ItemList of VisualArtwork for full crawlable metadata
var base = process.argv[4]; // e.g. https://kaitokawasaki.com/works/  or en/works/
var itemListElement = WORKS.map(function (w, i) {
  var materialSpec = (w.specs || []).find(function (s) { return s[0] === '素材' || s[0] === 'Material'; });
  var techSpec = (w.specs || []).find(function (s) { return s[0] === '技法' || s[0] === 'Technique'; });
  var obj = {
    "@type": "VisualArtwork",
    "name": w.title,
    "dateCreated": String(w.year),
    "creator": {
      "@type": "Person",
      "name": base.includes('/en/') ? "Kaito Kawasaki" : "河﨑海斗",
      "url": "https://kaitokawasaki.com/"
    }
  };
  if (w.img) obj.image = "https://kaitokawasaki.com/" + w.img.replace(/^(\.\.\/)+/, '');
  if (w.desc) obj.description = w.desc;
  if (materialSpec) obj.artMedium = materialSpec[1].replace(/<br>/g, ' ');
  if (techSpec) obj.artform = techSpec[1].replace(/<br>/g, ' ');
  if (w.award) obj.award = w.award;
  return { "@type": "ListItem", "position": i + 1, "item": obj };
});
var jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": base.includes('/en/') ? "All Works by Kaito Kawasaki" : "河﨑海斗 作品一覧",
  "url": base,
  "numberOfItems": WORKS.length,
  "itemListElement": itemListElement
};
fs.writeFileSync(process.argv[5], JSON.stringify(jsonLd, null, 2), 'utf8');

console.log('years:', years.length, 'works:', WORKS.length);
