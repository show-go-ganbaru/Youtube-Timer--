# YouTube-Timer

ユーザーが指定した時間に近い動画を提案するアプリケーションです。バックエンドはNode.js、フロントエンドはHTML/JavaScript/CSSで実装されています。

---
## 機能

- 秒数を指定すると、その長さに近いYouTube動画をランキング形式で返す
- JSON　APIとして利用可能
- HTMLフロントエンドから検索・結果表示

---
## 使用技術

- Node.js
- HTML/CSS/JavaScript
- VS Code
- YouTube API


## セットアップ手順

### 1. リポジトリをクローン
```
bash
git clone https://github.com/show-go-ganbaru/Youtube-Timer--.git
cd Youtube-Timer--.git
```

### 2. 依存関係をインストール
```
bash
npm install
```

### 3. 環境変数ファイルを作成

ルートにenvファイルを作り、YoutubeAPIキーを作成します
```
YOUTUBE_API_KEY=あなたのAPIキー
```

### 4. サーバーを起動

```
bash
node index.js
```

サーバーが起動すると以下にアクセス可能になります
```
http://localhost:5000/?seconds=300
```

### 5. フロントエンドを開く

index.htmlをブラウザで開けば時間を指定し動画を検索できます

## ディレクトリ構成
.  
├── index.js        # Node.js バックエンド (API)  
├── index.html      # フロントエンド (ブラウザで開く)  
├── style.css       # スタイルシート  
├── package.json    # プロジェクト設定  
├── .env            # APIキー (非公開)  
└── .gitignore      # 除外設定  


## 修正していきたい課題
- 50本の動画を人気順で取得しているため顔ぶれが似たり寄ったり  
  →動画をランダムに取得する。もしくは「もっと見る」ボタンで新たに50本取得

- ユーザーが指定できる要素が時間のみ  
  →ジャンルなどの指定もできるようにする
  
