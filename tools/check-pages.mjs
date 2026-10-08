#!/usr/bin/env node
// 公開用フォルダの主要ページをブラウザ（Chromium）で開き、JavaScriptのエラーと、
// サイト内のファイルの読み込み失敗が0件かを確かめる。1件でもあれば終了コード1（公開しない）。
//
//   PLAYWRIGHT_MODULE=<playwright のパス> node tools/check-pages.mjs _site
//
// 対象は sitemap.xml に載っている全ページと 404.html。スマホ幅（390px）とパソコン幅（1280px）の両方で開く。

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir || !existsSync(dir)){ console.error('使い方: node tools/check-pages.mjs <公開用フォルダ>'); process.exit(2); }
const mod = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright';
const { chromium } = await import(mod);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(dir, p);
  if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const sitemap = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
const pages = [...sitemap.matchAll(/<loc>https:\/\/kaitokawasaki\.com(\/[^<]*)<\/loc>/g)].map((m) => m[1]).concat('/404.html');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
for (const u of pages){
  for (const width of [390, 1280]){
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Tokyo' });
    await ctx.addInitScript(() => { try { localStorage.setItem('kk_intro_seen', '1'); } catch (e){} });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('JavaScriptエラー: ' + e.message));
    page.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400 && !r.url().endsWith('/404.html')) errs.push(`${r.status()} ${r.url().slice(base.length)}`); });
    page.on('requestfailed', (r) => { if (r.url().startsWith(base)) errs.push('読み込み失敗 ' + r.url().slice(base.length)); });
    await page.goto(base + u, { waitUntil: 'load' });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(800);
    if (errs.length) problems.push(`${u}（${width}px）: ${[...new Set(errs)].join(' / ')}`);
    await ctx.close();
  }
}
await browser.close();
server.close();

if (problems.length){
  console.error(`不合格（${problems.length}件）:`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`合格: ${pages.length}ページ × 2画面幅で、JavaScriptエラーと読み込み失敗は0件`);
