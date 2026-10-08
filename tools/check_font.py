#!/usr/bin/env python3
"""同梱の和文明朝サブセット（fonts/NotoSerifJP-sub.woff2）に、公開ページの文字が全部入っているか確かめる。

足りない文字があれば終了コード1で止まる（公開しない）。直し方は、元フォントを取得して
python3 tools/build_font_subset.py <NotoSerifJP[wght].ttf のパス> を実行し、フォントを作り直す。
必要なもの: pip install fonttools brotli
"""
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_font_subset import REPO, collect_chars  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402

# 元フォント（Noto Serif JP 2.003）にそもそも無い文字。サブセットに入れようがないので数えない
# （ブラウザは別の書体で表示する）。未割り当ての符号位置（Cn）も数えない
NOT_IN_SOURCE = set("✕")

font = TTFont(REPO / "fonts" / "NotoSerifJP-sub.woff2")
cmap = font.getBestCmap()
need = sorted(c for c in collect_chars()
              if not c.isspace() and unicodedata.category(c) != "Cn" and c not in NOT_IN_SOURCE)
missing = [c for c in need if ord(c) not in cmap]
if missing:
    print(f"不合格: 同梱フォントに {len(missing)} 字が足りません: {''.join(missing)}", file=sys.stderr)
    print("→ python3 tools/build_font_subset.py <元フォント> でフォントを作り直してください", file=sys.stderr)
    sys.exit(1)
print(f"合格: 公開ページの文字 {len(need)} 字がすべて同梱フォントに入っています")
