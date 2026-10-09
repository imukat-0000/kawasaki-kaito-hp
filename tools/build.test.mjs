// tools/build.mjs のテスト。実行: node --test tools/build.test.mjs
// 本物のファイルは触らず、一時フォルダにコピーした上で、わざと壊した台帳や目印で止まることなどを確かめる。
// 展示の台帳と sitemap.xml は本物ではなくテスト用の固定の写し（tools/test-fixtures/、2026-10-09時点）を使い、
// 基準日 2026-10-09 で一度生成した状態から始める。本物の台帳や日付が進んでも、テストの結果は変わらない。
// 作品の台帳（data/works.json）は本物を使う（トップの代表作品・個別ページとの照合も本物どうしで行うため）。
// 作品のテストは、代表作品にも個別ページにもない作品を台帳から選んで使う。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'en/index.html', 'sales/index.html', 'en/sales/index.html', 'works/index.html', 'en/works/index.html',
  'works/shuiro-wakin/index.html', 'sitemap.xml', 'data/exhibitions.json', 'data/works.json', 'tools/build.mjs', 'tools/works.mjs'];

function sandbox(){
  const dir = mkdtempSync(join(tmpdir(), 'build-test-'));
  for (const f of FILES){
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(ROOT, f), join(dir, f));
  }
  symlinkSync(join(ROOT, 'img'), join(dir, 'img'));
  cpSync(join(ROOT, 'tools/test-fixtures/exhibitions.json'), join(dir, 'data/exhibitions.json'));
  cpSync(join(ROOT, 'tools/test-fixtures/sitemap.xml'), join(dir, 'sitemap.xml'));
  const r = spawnSync(process.execPath, [join(dir, 'tools/build.mjs'), '--today', '2026-10-09'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('テスト用の台帳で生成できません: ' + r.stdout + r.stderr);
  return dir;
}
function run(dir, args = [], env = {}){
  const r = spawnSync(process.execPath, [join(dir, 'tools/build.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');
const snapshot = (dir) => Object.fromEntries(FILES.map((f) => [f, read(dir, f)]));
function editData(dir, fn){
  const p = join(dir, 'data/exhibitions.json');
  const d = JSON.parse(readFileSync(p, 'utf8'));
  fn(d.exhibitions, d);
  writeFileSync(p, JSON.stringify(d, null, 2));
}
const byId = (list, id) => list.find((e) => e.id === id);
function expectStop(t, setup, message){
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  setup(dir);
  const before = snapshot(dir);
  const r = run(dir, ['--today', '2026-10-09']);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, message);
  assert.deepEqual(snapshot(dir), before, '止まったときはファイルを1つも書き換えないこと');
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.build-tmp')), []);
}

test('同じ台帳・同じ日付で何度生成しても結果が変わらない', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = snapshot(dir);
  assert.equal(run(dir, ['--today', '2026-10-09']).code, 0);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(run(dir, ['--check', '--today', '2026-10-09']).code, 0);
});

test('会期の切り替わり：最終日（10/20）までは注目展示、翌日（10/21）に過去の展示へ移る', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.equal(run(dir, ['--today', '2026-10-20']).code, 0);
  assert.match(read(dir, 'index.html'), /<div class="exhi-feature">[\s\S]*個展「うつろい、留める」/);
  assert.match(read(dir, 'sales/index.html'), /個展「うつろい、留める」/);

  const r = run(dir, ['--today', '2026-10-21']);
  assert.equal(r.code, 0, r.out);
  for (const [f, lang] of [['index.html', 'ja'], ['en/index.html', 'en']]){
    const html = read(dir, f);
    assert.doesNotMatch(html, /class="exhi-feature"/, '後継がなければ注目展示の枠は出さない');
    const past = html.slice(html.indexOf('exhi-past'));
    assert.match(past, lang === 'ja' ? /個展「うつろい、留める」<span class="ended-tag">（終了）/ : /Utsuroi, Tomeru"<span class="ended-tag">\(Ended\)/);
    assert.doesNotMatch(html, /"startDate": "2026-09-05"/, '構造化データから外れる');
    assert.match(html, /var exhiStart = null;/);
  }
  assert.doesNotMatch(read(dir, 'sales/index.html'), /うつろい、留める/);
  assert.doesNotMatch(read(dir, 'en/sales/index.html'), /Utsuroi, Tomeru/);
  const sm = read(dir, 'sitemap.xml');
  for (const p of ['', 'en/', 'sales/', 'en/sales/']){
    assert.match(sm, new RegExp(`<loc>https://kaitokawasaki.com/${p}</loc>\\s*<lastmod>2026-10-21</lastmod>`));
  }
  assert.match(sm, /<loc>https:\/\/kaitokawasaki.com\/works\/<\/loc>\s*<lastmod>2026-10-09<\/lastmod>/, '他のページの更新日は変えない');
  // 同じ日にもう一度実行しても何も変わらない
  const once = snapshot(dir);
  assert.match(run(dir, ['--today', '2026-10-21']).out, /変更なし/);
  assert.deepEqual(snapshot(dir), once);
});

test('注目展示の選び方：開催中（終了が早い順）→ 開催予定（開始が早い順）→ 台帳の順', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const feature = () => read(dir, 'index.html').match(/<div class="exhi-feature">[\s\S]*?<h3>(.*?)<\/h3>/)?.[1];
  const prep = (e) => Object.assign(e, { featured: true, image: 'img/exhibition_dm_garari_showcase.jpg' }) &&
    ['ja', 'en'].forEach((l) => Object.assign(e[l], { text: '説明', imageAlt: 'alt', imageLabel: 'label' }));
  editData(dir, (list) => { prep(byId(list, 'kogei-art-fair-2026')); prep(byId(list, 'medel-2026')); });
  run(dir, ['--today', '2026-10-09']);
  assert.equal(feature(), '個展「うつろい、留める」', '開催中のものを優先');
  run(dir, ['--today', '2026-10-21']);
  assert.equal(feature(), 'KOGEI Art Fair Kanazawa 2026', '開催予定のうち開始が早いもの');
  run(dir, ['--today', '2026-11-30']);
  assert.equal(feature(), '河﨑海斗 個展');
  editData(dir, (list) => { byId(list, 'medel-2026').start = '2026-11-27'; byId(list, 'medel-2026').end = '2026-11-29'; });
  run(dir, ['--today', '2026-10-21']);
  assert.equal(feature(), 'KOGEI Art Fair Kanazawa 2026', '開始日も同じなら台帳で上にあるもの');
  editData(dir, (list) => { byId(list, 'medel-2026').start = '2026-10-01'; byId(list, 'medel-2026').end = '2026-10-19'; });
  run(dir, ['--today', '2026-10-09']);
  assert.equal(feature(), '河﨑海斗 個展', '開催中が2つなら終了が早いもの');
});

test('記号は変換され、構造化データの中でも </script> にならない', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  editData(dir, (list) => {
    const e = byId(list, 'kogei-art-fair-2026');
    e.ja.title = 'A & B </script><b>"x"</b>';
    e.place.ja.name = '</script><script>alert(1)</script>';
  });
  const r = run(dir, ['--today', '2026-10-09']);
  assert.equal(r.code, 0, r.out);
  const html = read(dir, 'index.html');
  assert.match(html, /"name": "A \\u0026 B \\u003c\/script\\u003e\\u003cb\\u003e\\"x\\"\\u003c\/b\\u003e"/);
  assert.match(html, /"name": "\\u003c\/script\\u003e\\u003cscript\\u003ealert\(1\)\\u003c\/script\\u003e"/);
  assert.equal(html.split('alert(1)</script>').length, 1);
});

test('台帳の誤りでは何も書かずに止まる：日付の書式', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'medel-2026').end = '2026-02-30'; }), /終了日 end が YYYY-MM-DD の正しい日付ではありません/));
test('台帳の誤りでは何も書かずに止まる：開始日が終了日より後', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'medel-2026').start = '2026-12-23'; }), /開始日 2026-12-23 が終了日 2026-12-22 より後/));
test('台帳の誤りでは何も書かずに止まる：idの重複', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'medel-2026').id = 'garari-2026'; }), /id「garari-2026」が重複/));
test('台帳の誤りでは何も書かずに止まる：英語の必須項目の欠け', (t) => expectStop(t,
  (d) => editData(d, (l) => { delete byId(l, 'medel-2026').en.venue; }), /medel-2026.*の en: venue がありません/));
test('台帳の誤りでは何も書かずに止まる：項目名の綴り違い', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'medel-2026').fetured = true; }), /知らない項目「fetured」/));
test('台帳の誤りでは何も書かずに止まる：HTML可の項目にタグ', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'medel-2026').ja.venue = '<b>会場</b>'; }), /タグ（< >）は使えません/));
test('台帳の誤りでは何も書かずに止まる：普通の文字の項目に &nbsp;', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'medel-2026').ja.title = 'A&nbsp;B'; }), /文字参照は使えません/));
test('台帳の誤りでは何も書かずに止まる：画像ファイルがない', (t) => expectStop(t,
  (d) => editData(d, (l) => { byId(l, 'garari-2026').image = 'img/nai.jpg'; }), /画像 img\/nai.jpg が見つかりません/));

const markerCase = (name, edit, message) => test(`目印の異常では何も書かずに止まる：${name}`, (t) => expectStop(t, (d) => {
  const [file, fn] = edit;
  writeFileSync(join(d, file), fn(read(d, file)));
}, message));
markerCase('欠落', ['sales/index.html', (s) => s.replace('    <!-- /build:exhibitions -->\n', '')], /sales\/index.html: 目印 build:exhibitions の開始が1個、終了が0個/);
markerCase('重複', ['en/index.html', (s) => s.replace('<!-- build:exhibitions-jsonld -->', '<!-- build:exhibitions-jsonld -->\n<!-- build:exhibitions-jsonld -->')], /en\/index.html: 目印 build:exhibitions-jsonld の開始が2個/);
markerCase('順番違い', ['en/sales/index.html', (s) => s.replace('<!-- build:exhibitions -->', '<!-- TMP -->').replace('<!-- /build:exhibitions -->', '<!-- build:exhibitions -->').replace('<!-- TMP -->', '<!-- /build:exhibitions -->')], /終了（\d+行目）が開始（\d+行目）より前/);
markerCase('知らない名前', ['index.html', (s) => s.replace('<!-- build:exhibitions -->', '<!-- build:exhibitons -->')], /知らない目印 build:exhibitons/);
markerCase('行の途中にある', ['index.html', (s) => s.replace('    <!-- /build:exhibitions -->\n', '    </div><!-- /build:exhibitions -->\n')], /単独の行に置いてください/);

test('書き込みの途中で失敗したら、書いた分を元に戻す', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = snapshot(dir);
  const r = run(dir, ['--today', '2026-10-21'], { BUILD_TEST_FAIL_AT: '2' });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /書き込んだ 2 件を元に戻しました/);
  assert.deepEqual(snapshot(dir), before);
  assert.deepEqual(readdirSync(join(dir, 'sales')).filter((f) => f.endsWith('.build-tmp')), []);
});

test('--check は、台帳とHTMLが食い違うと終了コード1で止まり、何も書かない', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const before = snapshot(dir);
  const r = run(dir, ['--check', '--today', '2026-10-21']);
  assert.equal(r.code, 1);
  assert.match(r.out, /食い違っています: index.html, en\/index.html, sales\/index.html, en\/sales\/index.html, sitemap.xml/);
  assert.deepEqual(snapshot(dir), before);
});

test('終了日を変えると、日英トップ・日英販売情報・構造化データ・開催状況の判定日付のすべてに反映され、古い日付が残らない', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // 注目展示（ガラリ展）と一覧の展示（MEDEL展）の終了日を5日延ばす
  editData(dir, (list) => { byId(list, 'garari-2026').end = '2026-10-25'; byId(list, 'medel-2026').end = '2026-12-27'; });
  const r = run(dir, ['--today', '2026-10-09']);
  assert.equal(r.code, 0, r.out);
  const expect = {
    'index.html': ['"endDate": "2026-10-25"', '"endDate": "2026-12-27"', '<time>2026.9.5 — 10.25</time>', '<time>2026.12.11 — 12.27</time>',
      "var exhiEnd = new Date('2026-10-25T23:59:59+09:00');"],
    'en/index.html': ['"endDate": "2026-10-25"', '"endDate": "2026-12-27"', '<time>Sep 5 — Oct 25, 2026</time>', '<time>Dec 11 — 27, 2026</time>',
      "var exhiEnd = new Date('2026-10-25T23:59:59+09:00');"],
    'sales/index.html': ['<time>2026.9.5 — 10.25</time>', '<time>2026.12.11 — 12.27</time>'],
    'en/sales/index.html': ['<time>Sep 5 — Oct 25, 2026</time>', '<time>Dec 11 — 27, 2026</time>'],
  };
  const old = ['2026-10-20', '2026-12-22', '— 10.20', '— 12.22', 'Oct 20, 2026', 'Dec 11 — 22'];
  for (const [f, needles] of Object.entries(expect)){
    const html = read(dir, f);
    for (const n of needles) assert.ok(html.includes(n), `${f} に「${n}」がない`);
    for (const o of old) assert.ok(!html.includes(o), `${f} に古い日付「${o}」が残っている`);
  }
});

// ---------- 作品（data/works.json） ----------
const WORKS_PAGES = { ja: 'works/index.html', en: 'en/works/index.html' };
function editWorks(dir, fn){
  const p = join(dir, 'data/works.json');
  const d = JSON.parse(readFileSync(p, 'utf8'));
  fn(d.works, d);
  writeFileSync(p, JSON.stringify(d, null, 2));
}
// 生成されたページから、小窓用データ・構造化データ・一覧のボタンを取り出す
function worksOf(html){
  const W = new Function('return ' + html.match(/var WORKS = (\[[\s\S]*?\n  \]);/)[1])();
  const ld = JSON.parse(html.match(/<!-- build:works-jsonld -->\n<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const archive = html.match(/<!-- build:works-archive -->\n([\s\S]*?)\n<!-- \/build:works-archive -->/)[1];
  return { W, ld, archive };
}
const tileOf = (archive, id) => archive.match(new RegExp(`<button class="archive-tile" type="button" data-id="${id}">[\\s\\S]*?</button>`))[0];
// 年の見出しごとに、その中のボタンの id を並べる
const yearsOf = (archive) => Object.fromEntries(archive.split('<div class="archive-year">').slice(1).map((b) =>
  [b.match(/<span class="year-num">(\d+)<\/span>/)[1], [...b.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1])]));
// 代表作品にも個別ページにもなく、写真と素材・技法の欄がある作品
function plainWork(dir){
  const top = read(dir, 'index.html') + read(dir, 'en/index.html');
  const d = JSON.parse(read(dir, 'data/works.json'));
  return d.works.find((w) => w.img && !w.keep && !top.includes(`works/#${w.id}"`) &&
    w.specs.some((s) => s.key === 'material') && w.specs.some((s) => s.key === 'technique'));
}

test('作品：台帳の1件を変えると、日英の小窓用データ・一覧・構造化データ・sitemap の更新日のすべてに反映され、ほかの作品は変わらない', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const w0 = plainWork(dir);
  const before = { ja: worksOf(read(dir, WORKS_PAGES.ja)), en: worksOf(read(dir, WORKS_PAGES.en)) };
  const other = JSON.parse(read(dir, 'data/works.json')).works.find((w) => w.img && w.img !== w0.img).img;
  editWorks(dir, (list) => {
    const w = list.find((x) => x.id === w0.id);
    w.title = { ja: '仮の題名', en: 'Test Title' };
    w.desc = { ja: '仮の説明。', en: 'Test description.' };
    w.alt = { ja: '仮の代替テキスト', en: 'Test alt' };
    w.yearLabel = { ja: '仮の注記', en: 'Test note' };
    w.award = { ja: '仮の受賞', en: 'Test Award' };
    w.img = other;
    w.pos = '10% 90%';
    w.zoom = '1.23';
    w.specs.find((s) => s.key === 'material').ja = ['仮の素材1', '仮の素材2'];
    w.specs.find((s) => s.key === 'material').en = ['Test material 1', 'Test material 2'];
    w.specs.find((s) => s.key === 'technique').ja = '仮の技法';
    w.specs.find((s) => s.key === 'technique').en = 'Test technique';
  });
  const r = run(dir, ['--today', '2026-10-12']);
  assert.equal(r.code, 0, r.out);
  for (const lang of ['ja', 'en']){
    const page = WORKS_PAGES[lang];
    const after = worksOf(read(dir, page));
    const ja = lang === 'ja';
    const img = (ja ? '../img/' : '../../img/') + other.slice(4);
    const i = after.W.findIndex((w) => w.id === w0.id);
    // 小窓用データ
    const w = after.W[i];
    assert.equal(w.title, ja ? '仮の題名' : 'Test Title');
    assert.equal(w.desc, ja ? '仮の説明。' : 'Test description.');
    assert.equal(w.yearLabel, ja ? '仮の注記' : 'Test note');
    assert.equal(w.award, ja ? '仮の受賞' : 'Test Award');
    assert.equal(w.img, img);
    assert.equal(w.alt, ja ? '仮の代替テキスト' : 'Test alt');
    assert.equal(w.pos, '10% 90%');
    assert.equal(w.zoom, '1.23');
    assert.deepEqual(w.specs.find((s) => s[0] === (ja ? '素材' : 'Material')), ja ? ['素材', '仮の素材1<br>仮の素材2'] : ['Material', 'Test material 1<br>Test material 2']);
    if (!ja) assert.equal(w.en, '仮の題名', '英語の小窓の副題は日本語の題名');
    // 一覧
    const tile = tileOf(after.archive, w0.id);
    for (const n of [`src="${img}"`, ja ? 'alt="仮の代替テキスト"' : 'alt="Test alt"', 'style="object-position:10% 90%;--zoom:1.23;"',
      `data-edit-path="${img}"`, ja ? '<span class="tile-title">仮の題名</span>' : '<span class="tile-title">Test Title</span>',
      ja ? 'data-edit-label="仮の題名"' : 'data-edit-label="Test Title"', ja ? '<span class="tile-note">仮の注記</span>' : '<span class="tile-note">Test note</span>']){
      assert.ok(tile.includes(n), `${page} の一覧に「${n}」がない`);
    }
    // 構造化データ
    const item = after.ld.itemListElement[i].item;
    assert.equal(item.name, ja ? '仮の題名' : 'Test Title');
    assert.equal(item.description, ja ? '仮の説明。' : 'Test description.');
    assert.equal(item.image, 'https://kaitokawasaki.com/' + other);
    assert.equal(item.artMedium, ja ? '仮の素材1 仮の素材2' : 'Test material 1 Test material 2');
    assert.equal(item.artform, ja ? '仮の技法' : 'Test technique');
    assert.equal(item.award, ja ? '仮の受賞' : 'Test Award');
    // 古い値が残らない・ほかの作品は変わらない
    const old = before[lang].W[i];
    assert.ok(!read(dir, page).includes(`"${old.title}"`), `${page} に古い題名が残っている`);
    after.W.forEach((x, j) => { if (j !== i) assert.deepEqual(x, before[lang].W[j]); });
    after.ld.itemListElement.forEach((x, j) => { if (j !== i) assert.deepEqual(x, before[lang].ld.itemListElement[j]); });
    assert.equal(after.archive.replace(tile, ''), before[lang].archive.replace(tileOf(before[lang].archive, w0.id), ''));
  }
  const sm = read(dir, 'sitemap.xml');
  for (const loc of ['works/', 'en/works/']) assert.match(sm, new RegExp(`<loc>https://kaitokawasaki.com/${loc}</loc>\\s*<lastmod>2026-10-12</lastmod>`));
  assert.match(sm, /<loc>https:\/\/kaitokawasaki.com\/works\/shuiro-wakin\/<\/loc>\s*<lastmod>2026-10-07<\/lastmod>/, '個別ページの更新日は変えない');
});

test('作品：制作年と分類を変えると、一覧の年・分類の位置が移る（構造化データの順は台帳の順のまま）', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const w0 = plainWork(dir);
  const order = JSON.parse(read(dir, 'data/works.json')).works.map((w) => w.id);
  editWorks(dir, (list) => { const w = list.find((x) => x.id === w0.id); w.year = 2019; w.group = 'object'; });
  assert.equal(run(dir, ['--today', '2026-10-09']).code, 0);
  for (const lang of ['ja', 'en']){
    const { W, ld, archive } = worksOf(read(dir, WORKS_PAGES[lang]));
    const years = yearsOf(archive);
    assert.deepEqual(years['2019'], [w0.id], '2019年の見出しができ、その作品だけが入る');
    assert.ok(!(years[String(w0.year)] || []).includes(w0.id));
    assert.ok(archive.lastIndexOf('<div class="archive-year">') < archive.indexOf(`data-id="${w0.id}"`), '一番古い年として最後に並ぶ');
    assert.ok(archive.slice(archive.lastIndexOf('<div class="archive-year">')).includes(lang === 'ja' ? '<h4 class="motif-head">オブジェ・静物</h4>' : '<h4 class="motif-head">Objects &amp; Still Life</h4>'));
    assert.deepEqual(W.map((w) => w.id), order);
    assert.equal(ld.itemListElement.find((x) => x.item.name === W.find((w) => w.id === w0.id).title).item.dateCreated, '2019');
  }
});

test('作品：記号（" \' & < >）を含む題名でも、HTML・小窓用データ・構造化データが壊れない', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const w0 = plainWork(dir);
  const title = `"引用" & 'Quote' </script>`;
  editWorks(dir, (list) => {
    const w = list.find((x) => x.id === w0.id);
    w.title = { ja: title.replace(/[<>]/g, ''), en: `It's "Quoted" & more` };
    w.alt = { ja: '"代替"', en: `"Alt" & 'alt'` };
  });
  // < > は普通の文字の項目では使えない（小窓の作りが壊れるため）。それ以外の記号は通る
  const r = run(dir, ['--today', '2026-10-09']);
  assert.equal(r.code, 0, r.out);
  const html = read(dir, WORKS_PAGES.en);
  const { W, ld, archive } = worksOf(html);
  assert.equal(W.find((w) => w.id === w0.id).title, `It's "Quoted" & more`);
  assert.equal(ld.itemListElement.find((x) => x.item.name === `It's "Quoted" & more`).position, W.findIndex((w) => w.id === w0.id) + 1);
  const tile = tileOf(archive, w0.id);
  assert.ok(tile.includes('data-edit-label="It&#x27;s &quot;Quoted&quot; &amp; more"'));
  assert.ok(tile.includes('alt="&quot;Alt&quot; &amp; &#x27;alt&#x27;"'));
  assert.ok(tile.includes('<span class="tile-title">It&#x27;s &quot;Quoted&quot; &amp; more</span>'));
  assert.equal(worksOf(read(dir, WORKS_PAGES.ja)).W.find((w) => w.id === w0.id).title, '"引用" & \'Quote\' /script');
});

const worksStop = (t, fn, message) => expectStop(t, (dir) => editWorks(dir, fn), message);
const pick = (list) => list.find((w) => w.img && !w.keep && w.id !== 'shuiro-wakin');
test('作品の台帳の誤りでは何も書かずに止まる：idの重複', (t) => worksStop(t,
  (list) => { list[1].id = list[0].id; }, /id「[^」]+」が重複しています/));
test('作品の台帳の誤りでは何も書かずに止まる：画像ファイルがない', (t) => worksStop(t,
  (list) => { pick(list).img = 'img/no-such-photo.jpg'; }, /画像 img\/no-such-photo.jpg が見つかりません/));
test('作品の台帳の誤りでは何も書かずに止まる：英語の題名の欠け', (t) => worksStop(t,
  (list) => { delete pick(list).title.en; }, /title.en がありません（日本語・英語の両方が必要です）/));
test('作品の台帳の誤りでは何も書かずに止まる：片方の言語だけの受賞', (t) => worksStop(t,
  (list) => { pick(list).award = { ja: '賞' }; }, /award.en がありません/));
test('作品の台帳の誤りでは何も書かずに止まる：普通の文字の項目にタグ', (t) => worksStop(t,
  (list) => { pick(list).desc.en = 'a <b>bold</b> text'; }, /desc.en に < > や &amp; などの文字参照は使えません/));
test('作品の台帳の誤りでは何も書かずに止まる：素材の欄の & の書き忘れ', (t) => worksStop(t,
  (list) => { pick(list).specs[0].en = 'Copper & brass'; }, /& は &amp; と書いてください/));
test('作品の台帳の誤りでは何も書かずに止まる：素材の欄の日英の行数違い', (t) => worksStop(t,
  (list) => { const w = pick(list); w.specs[0].ja = ['1行目', '2行目']; }, /日本語（2行）と英語（1行）の行数が違います/));
test('作品の台帳の誤りでは何も書かずに止まる：知らない分類', (t) => worksStop(t,
  (list) => { pick(list).group = 'fish'; }, /分類 group「fish」が groups にありません/));
test('作品の台帳の誤りでは何も書かずに止まる：項目名の綴り違い', (t) => worksStop(t,
  (list) => { pick(list).tilte = pick(list).title; }, /知らない項目「tilte」があります/));
test('作品：トップの代表作品の題名が台帳と食い違うと止まる', (t) => worksStop(t,
  (list) => { list.find((w) => w.id === 'kouyou').title.en += ' (changed)'; }, /en\/index.html: 代表作品 kouyou の題名「[^」]+」が台帳（[^）]+ \(changed\)）と違います/));
test('作品：トップの代表作品のリンク先が台帳にないと止まる', (t) => worksStop(t,
  (list) => { list.find((w) => w.id === 'kouyou').id = 'kouyou-2'; }, /代表作品のリンク先 works\/#kouyou が台帳にありません/));
test('作品：個別ページの共通項目（受賞・素材の欄）が台帳と食い違うと止まる', (t) => worksStop(t,
  (list) => { const w = list.find((x) => x.id === 'shuiro-wakin'); w.award.ja += '（変更）'; w.specs[0].ja = '変更した素材'; },
  /works\/shuiro-wakin\/index.html: 受賞「[^」]+」が台帳（[^）]+（変更））と違います[\s\S]*「素材」の欄/));

test('作品：台帳を直して生成し忘れると --check が止める（作品一覧ページを名指しする）', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const w0 = plainWork(dir);
  editWorks(dir, (list) => { const w = list.find((x) => x.id === w0.id); w.desc.ja = '変更。'; w.desc.en = 'Changed.'; });
  const before = snapshot(dir);
  const r = run(dir, ['--check', '--today', '2026-10-12']);
  assert.equal(r.code, 1);
  assert.match(r.out, /食い違っています: works\/index.html, en\/works\/index.html, sitemap.xml/);
  assert.deepEqual(snapshot(dir), before);
});

test('作品：生成した範囲をHTMLで直接直しても、--check が止め、生成で台帳の内容に戻る', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const page = WORKS_PAGES.ja;
  const orig = read(dir, page);
  const id = plainWork(dir).id;
  writeFileSync(join(dir, page), orig.replace(new RegExp(`(\\{ id:"${id}", title:")`), '$1手で直した'));
  assert.equal(run(dir, ['--check', '--today', '2026-10-09']).code, 1);
  assert.equal(run(dir, ['--today', '2026-10-09']).code, 0);
  assert.equal(read(dir, page), orig);
});

test('作品：今の表示のまま残す例外（英語一覧の拡大率なし・「狐の嫁入り」の英題の記号）が生成後も保たれる', (t) => {
  const dir = sandbox();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const d = JSON.parse(read(dir, 'data/works.json'));
  const ja = worksOf(read(dir, WORKS_PAGES.ja)), en = worksOf(read(dir, WORKS_PAGES.en));
  for (const w of d.works.filter((x) => x.keep?.enListNoZoom)){
    assert.ok(tileOf(ja.archive, w.id).includes(`--zoom:${w.zoom};`), `日本語の一覧の ${w.id} には拡大率がある`);
    assert.ok(!tileOf(en.archive, w.id).includes('--zoom'), `英語の一覧の ${w.id} には拡大率がない`);
    assert.equal(en.W.find((x) => x.id === w.id).zoom, w.zoom, '英語の小窓には拡大率がある');
  }
  assert.equal(ja.W.find((x) => x.id === 'ame-kaeru').en, "Rain Frog: The Fox's Wedding", '日本語の小窓の副題は U+0027');
  assert.equal(en.W.find((x) => x.id === 'ame-kaeru').title, 'Rain Frog: The Fox’s Wedding', '英語の小窓の題名は U+2019');
});
