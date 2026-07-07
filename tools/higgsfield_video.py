#!/usr/bin/env python3
"""河﨑海斗HP: 作品写真 → Higgsfield で動画生成する自動化スクリプト

使い方:
  1. https://cloud.higgsfield.ai/ でAPIキーを発行し、リポジトリ直下の .env に書く:
       HF_KEY=キー:シークレット
     (または環境変数 HF_KEY / HF_API_KEY+HF_API_SECRET を設定)
  2. 実行例:
       python3 tools/higgsfield_video.py --image img/work_nishikigoi.jpg \
           --prompt "slow cinematic dolly-in, soft gallery light, subtle reflections" \
           --model <モデルID> --out videos
     モデルIDは cloud.higgsfield.ai のカタログで確認(例: DoP系のimage-to-video)。
     --dry-run でAPIを呼ばずに送信内容だけ確認できる。

備考:
  - 画像はSDK経由でHiggsfieldにアップロードされる(公開サイトのURLを使う場合は --image-url)
  - 生成結果のJSONから .mp4 URLを探してダウンロードし、--out に保存する
"""
import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def load_env():
    """リポジトリ直下の .env から HF_KEY 等を読み込む(既存の環境変数を優先)。"""
    envfile = REPO / ".env"
    if envfile.exists():
        for line in envfile.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def find_urls(obj, out=None):
    """結果JSONを再帰的に走査してURLらしき文字列を集める。"""
    if out is None:
        out = []
    if isinstance(obj, dict):
        for v in obj.values():
            find_urls(v, out)
    elif isinstance(obj, list):
        for v in obj:
            find_urls(v, out)
    elif isinstance(obj, str) and re.match(r"https?://", obj):
        out.append(obj)
    return out


def main():
    ap = argparse.ArgumentParser(description="Higgsfieldで作品写真から動画を生成")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--image", help="ローカル画像パス(img/xxx.jpg など)")
    src.add_argument("--image-url", help="公開画像URL(GitHub Pagesの画像など)")
    ap.add_argument("--prompt", required=True, help="カメラワーク等の英語プロンプト")
    ap.add_argument("--model", default=os.environ.get("HF_MODEL", ""),
                    help="HiggsfieldのアプリケーションID(cloud.higgsfield.aiのカタログ参照)")
    ap.add_argument("--aspect", default="16:9", help="アスペクト比 (16:9 / 9:16 / 1:1)")
    ap.add_argument("--out", default="videos", help="保存先ディレクトリ")
    ap.add_argument("--dry-run", action="store_true", help="APIを呼ばず送信内容のみ表示")
    args = ap.parse_args()

    load_env()

    if not args.model:
        sys.exit("モデルIDが未指定です。--model か .env の HF_MODEL に、"
                 "cloud.higgsfield.ai のカタログにある image-to-video のIDを設定してください。")

    arguments = {"prompt": args.prompt, "aspect_ratio": args.aspect}

    if args.dry_run:
        print("[dry-run] model:", args.model)
        print("[dry-run] image:", args.image or args.image_url)
        print("[dry-run] arguments:", json.dumps(arguments, ensure_ascii=False, indent=2))
        print("[dry-run] APIキー設定:", "あり" if (os.environ.get("HF_KEY") or os.environ.get("HF_API_KEY")) else "なし(.envにHF_KEYを設定してください)")
        return

    if not (os.environ.get("HF_KEY") or os.environ.get("HF_API_KEY")):
        sys.exit("APIキーがありません。cloud.higgsfield.ai でキーを発行し、"
                 ".env に HF_KEY=キー:シークレット を書いてください。")

    import higgsfield_client as hf  # 認証はここで環境変数から行われる

    if args.image:
        from PIL import Image
        path = Path(args.image) if Path(args.image).is_absolute() else REPO / args.image
        print("画像をアップロード中:", path)
        image_url = hf.upload_image(Image.open(path))
    else:
        image_url = args.image_url
    print("入力画像URL:", image_url)
    arguments["input_images"] = [image_url]
    arguments["image_url"] = image_url  # モデルによりキー名が異なるため両方渡す

    print(f"生成リクエスト送信: {args.model}")
    t0 = time.time()
    result = hf.subscribe(
        args.model, arguments,
        on_queue_update=lambda s: print("  status:", type(s).__name__, flush=True),
    )
    print(f"完了({time.time()-t0:.0f}秒)")

    urls = find_urls(result)
    videos = [u for u in urls if ".mp4" in u.lower() or "video" in u.lower()]
    if not videos:
        print("結果JSONに動画URLが見つかりません。JSON全体:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return

    outdir = Path(args.out) if Path(args.out).is_absolute() else REPO / args.out
    outdir.mkdir(parents=True, exist_ok=True)
    import urllib.request
    for i, u in enumerate(videos):
        name = Path(args.image or args.image_url).stem
        dest = outdir / f"{name}_{int(time.time())}_{i}.mp4"
        print("ダウンロード:", u, "->", dest)
        urllib.request.urlretrieve(u, dest)
    print("完了。保存先:", outdir)


if __name__ == "__main__":
    main()
