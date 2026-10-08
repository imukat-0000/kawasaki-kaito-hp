#!/usr/bin/env node
// 公開用フォルダを「許可リスト」で組み立て、内部用ファイルが混ざっていないかを確かめる。
//
//   node tools/site-bundle.mjs _site            許可リストのファイルだけを _site にコピーして検査する
//   node tools/site-bundle.mjs --verify _site   コピーはせず、既にある公開用フォルダを検査だけする（再公開のとき）
//   SITE_ROOT=<フォルダ> node tools/site-bundle.mjs _site   別の場所に取り出したコミットの中身から作る（生成はしない）
//
// 内部用ファイルが1つでも入っていたら、終了コード1で止まる（公開しない）。

import { readdirSync, statSync, mkdirSync, copyFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SITE_ROOT を渡すと、別の場所に取り出した過去のコミット（例: 保存した公開時点）から公開用フォルダを作る
const ROOT = process.env.SITE_ROOT ? resolve(process.env.SITE_ROOT) : join(dirname(fileURLToPath(import.meta.url)), '..');

// 公開してよいもの（ここにないものは公開されない）
export const ALLOW_FILES = ['index.html', '404.html', 'CNAME', 'favicon.png', 'favicon.svg', 'apple-touch-icon.png',
  'robots.txt', 'sitemap.xml', 'llms.txt'];
export const ALLOW_DIRS = ['img', 'fonts', 'js', 'en', 'works', 'journal', 'profile', 'sales', 'privacy'];

// 公開用フォルダに入っていたら止めるもの（どの階層にあっても）
const FORBIDDEN = [
  /^CLAUDE\.md$/i, /^README(\.|$)/i, /^PROGRESS\.md$/i, /^tools$/, /^scripts$/, /^data$/, /^concept-dark$/,
  /^\.env/, /^videos$/, /^\.github$/, /^_config\.yml$/, /^\.git$/, /^\.gitignore$/, /^node_modules$/, /^\.DS_Store$/,
  /\.build-tmp$/, /^_glyphs\.txt$/,
];

function walk(dir, base = dir){
  const out = [];
  for (const name of readdirSync(dir)){
    const p = join(dir, name);
    const rel = relative(base, p).split(sep).join('/');
    if (statSync(p).isDirectory()) out.push(rel + '/', ...walk(p, base));
    else out.push(rel);
  }
  return out;
}

// git に登録されているファイルだけを対象にする（手元に置いただけの下書きや .env を拾わない）
function trackedFiles(){
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

export function allowed(rel){
  if (ALLOW_FILES.includes(rel)) return true;
  const top = rel.split('/')[0];
  return ALLOW_DIRS.includes(top) && rel.includes('/');
}

export function forbiddenIn(dir){
  const bad = [];
  for (const rel of walk(dir)){
    const parts = rel.replace(/\/$/, '').split('/');
    if (parts.some((part) => FORBIDDEN.some((re) => re.test(part)))) bad.push(rel);
  }
  return bad;
}

function assemble(out){
  if (existsSync(out)) rmSync(out, { recursive: true });
  const files = trackedFiles().filter(allowed).sort();
  for (const f of files){
    if (!existsSync(join(ROOT, f))) continue; // 削除済みでまだコミットしていないもの
    mkdirSync(dirname(join(out, f)), { recursive: true });
    copyFileSync(join(ROOT, f), join(out, f));
  }
  return files;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href){
  const args = process.argv.slice(2);
  const verifyOnly = args.includes('--verify');
  const out = args.filter((a) => !a.startsWith('--'))[0];
  if (!out){ console.error('使い方: node tools/site-bundle.mjs [--verify] <公開用フォルダ>'); process.exit(2); }
  const dir = resolve(out);
  if (!verifyOnly){
    const files = assemble(dir);
    writeFileSync(resolve(out) + '.files.txt', files.join('\n') + '\n');
    console.log(`公開用フォルダを作りました: ${out}（${files.length}ファイル）`);
  }
  if (!existsSync(join(dir, 'index.html'))){ console.error(`止めました: ${out}/index.html がありません`); process.exit(1); }
  const bad = forbiddenIn(dir);
  if (bad.length){
    console.error(`止めました: 公開用フォルダに内部用のファイルが入っています（公開しません）:\n  ${bad.join('\n  ')}`);
    process.exit(1);
  }
  console.log('内部用ファイルの混入: なし');
}
