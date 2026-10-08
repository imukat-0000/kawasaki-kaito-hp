#!/usr/bin/env python3
"""公開ページで使う文字だけを含む和文明朝のサブセットwoff2を作る。

Android には和文明朝が標準搭載されていないため、Noto Serif JP(可変フォント)を
使用グリフのみに絞って fonts/NotoSerifJP-sub.woff2 として同梱する(P0-02)。

収録する文字（2026-10 から全ページ対象。以前は index.html だけで、他ページの見出しで字が欠けていた）:
  - index.html のスクリプト内の文字列（金魚のゲームなどで後から表示される文言）
  - 公開する全ページの本文に表示される文字（タグ・style・script・コメントを除く）
  - 作品一覧の WORKS 配列の題名（title・en。作品の拡大表示で明朝になる）
  - かな・英数・記号の固定セット

使い方(サイトの文言を変えて新しい漢字が増えたら再実行):
  python3 tools/build_font_subset.py [元フォントのパス]
元フォント: Google Fonts 公式リポジトリの ofl/notoserifjp/NotoSerifJP[wght].ttf
  （https://github.com/google/fonts/tree/main/ofl/notoserifjp 、2026-10時点で Version 2.003）。
  リポジトリには入れていないので、取得してそのパスを引数に渡す
"""
import html as htmllib
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
if len(sys.argv) < 2:
    sys.exit("使い方: python3 tools/build_font_subset.py <NotoSerifJP[wght].ttf のパス>")
SRC = Path(sys.argv[1])

# 公開しないフォルダ（_config.yml の exclude と同じ）
PRIVATE = {"tools", "scripts", "concept-dark", "data", "node_modules"}
pages = sorted(p for p in REPO.rglob("*.html")
               if not (set(p.relative_to(REPO).parts[:-1]) & PRIVATE))


def visible_text(src):
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    src = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", src, flags=re.S)
    return htmllib.unescape(re.sub(r"<[^>]+>", " ", src))


chars = set()
for m in re.finditer(r"<script\b(?![^>]*ld\+json)[^>]*>(.*?)</script>",
                     (REPO / "index.html").read_text(encoding="utf-8"), re.S):
    js = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    js = re.sub(r"(?m)//[^\n'\"]*$", "", js)
    for q in re.findall(r"'((?:[^'\\\n]|\\.)*)'|\"((?:[^\"\\\n]|\\.)*)\"", js):
        chars.update(q[0] + q[1])
for p in pages:
    src = p.read_text(encoding="utf-8")
    chars.update(visible_text(src))
    for m in re.finditer(r'\b(?:title|en):"((?:[^"\\]|\\.)*)"', src):
        chars.update(m.group(1))
# 将来の文言変更に備えて、かな・記号・英数は全部入れておく
for lo, hi in [(0x20, 0x7E),        # ASCII
               (0x3040, 0x309F),    # ひらがな
               (0x30A0, 0x30FF),    # カタカナ
               (0xFF01, 0xFF5E)]:   # 全角英数・記号
    chars.update(chr(c) for c in range(lo, hi + 1))
chars.update("、。・「」『』（）〜―…※℃×〇◯℮年月日時分東京広島河﨑髙")

text = "".join(sorted(c for c in chars if not c.isspace() or c == " "))
glyphs_file = REPO / "tools" / "_glyphs.txt"
glyphs_file.write_text(text, encoding="utf-8")

outdir = REPO / "fonts"
outdir.mkdir(exist_ok=True)
out = outdir / "NotoSerifJP-sub.woff2"
subprocess.run([
    sys.executable, "-m", "fontTools.subset", str(SRC),
    f"--text-file={glyphs_file}",
    "--flavor=woff2",
    f"--output-file={out}",
    "--layout-features=palt,kern,liga",
    "--no-hinting",
], check=True)
print(out, out.stat().st_size // 1024, "KB,", len(text), "glyphs requested")
