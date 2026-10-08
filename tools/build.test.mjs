// tools/build.mjs のテスト。実行: node --test tools/
// 本物のファイルは触らず、一時フォルダにコピーした上で、わざと壊した台帳や目印で止まることなどを確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'en/index.html', 'sales/index.html', 'en/sales/index.html', 'sitemap.xml', 'data/exhibitions.json', 'tools/build.mjs'];

function sandbox(){
  const dir = mkdtempSync(join(tmpdir(), 'build-test-'));
  for (const f of FILES){
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    cpSync(join(ROOT, f), join(dir, f));
  }
  symlinkSync(join(ROOT, 'img'), join(dir, 'img'));
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

test('今の台帳で生成すると、今のHTMLと完全に一致する（2回実行しても同じ）', (t) => {
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
