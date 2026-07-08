#!/usr/bin/env python3
"""index.html で使う文字だけを含む和文明朝のサブセットwoff2を作る。

Android には和文明朝が標準搭載されていないため、Noto Serif JP(可変フォント)を
使用グリフのみに絞って fonts/NotoSerifJP-sub.woff2 として同梱する(P0-02)。

使い方(サイトの文言を変えて新しい漢字が増えたら再実行):
  python3 tools/build_font_subset.py [元フォントのパス]
元フォント既定値: scratchpad等に置いた NotoSerifJP[wght].ttf
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    "/private/tmp/claude-501/-Users-kanekotakumi/bd42d84a-7e45-4260-8b99-216b2992dff2/scratchpad/NotoSerifJP.ttf")

html = (REPO / "index.html").read_text(encoding="utf-8")

chars = set(html)
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
