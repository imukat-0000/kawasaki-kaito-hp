# 河﨑海斗 公式サイト

公開URL: https://imukat-0000.github.io/kawasaki-kaito-hp/

このリポジトリは1ファイル完結の静的サイトです（`index.html` だけで動きます）。
`main` ブランチにプッシュすると、1〜2分後に自動で公開サイトに反映されます。

---

## 河﨑さんへ：Claude Codeで編集する手順

はじめての場合は、まず①〜③を1回だけ行ってください。2回目以降は④からで大丈夫です。

### ① このリポジトリを自分のパソコンに持ってくる（最初の1回だけ）

ターミナル（Macなら「ターミナル」アプリ）を開いて、次を1行ずつ実行します。
（`Documents` フォルダに置く例です。好きな場所で構いません）

```bash
cd ~/Documents
git clone https://github.com/imukat-0000/kawasaki-kaito-hp.git
cd kawasaki-kaito-hp
```

### ② Claude Codeを開く

同じターミナルで、そのまま次を実行します。

```bash
claude
```

Claude Codeが起動したら、日本語で普通に話しかけて大丈夫です。
例：「トップページの一文を〇〇に変えて」「作品セクションに新しい作品を追加して」

### ③ 編集内容を公開する

Claude Codeに編集してもらったあと、そのまま続けて日本語で

> 「変更をコミットしてpushして」

と伝えれば大丈夫です。Claude Codeがgitの操作を代わりにやってくれます。
1〜2分待つと、公開サイトに反映されます。

### ④ 2回目以降

作業を始める前に、まず最新の状態を取り込んでください（タクミが先に更新している場合があるため）。

```bash
cd ~/Documents/kawasaki-kaito-hp
git pull
claude
```

あとは②③と同じです。

---

## 困ったとき

- `git pull` で "conflict"（競合）と出た場合は、無理に自分で解決せず、Claude Codeに
  「pullしたらconflictが出た、直して」と伝えれば大抵は対応してくれます
- それでも分からない場合はタクミに連絡してください
- 画像を追加したいときは `img/` フォルダにファイルを置いてから、Claude Codeに
  「〇〇の画像を追加して」と伝えてください

## ファイル構成（参考）

| ファイル・フォルダ | 内容 |
|---|---|
| `index.html` | サイト本体（HTML・CSS・JS全部入り） |
| `img/` | 作品写真・プロフィール写真 |
| `fonts/` | 和文Webフォント |
| `favicon.svg` / `favicon.png` / `apple-touch-icon.png` | サイトアイコン |
