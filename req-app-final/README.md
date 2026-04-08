# 🎙 音声録音・要件整理Webアプリ

ブラウザで録音した音声をAIが自動で文字起こし・要約・要件整理し、Notionへ自動保存するWebアプリです。
就活の会社説明会・面接・座談会のメモとして活用しています。

---

## 🚀 主な機能

- **ブラウザ録音**：マイクで最大60分の音声を録音
- **自動文字起こし**：Groq（Whisper）で高精度に日本語テキスト化
- **AI要件整理**：Gemini 2.5 Flashが機能要件・非機能要件・TODOを自動分類
- **Notion自動保存**：録音日時付きで指定ページに自動追記
- **長時間対応**：10分ごとに自動分割・並行処理で60分以上に対応

---

## 🛠 使用技術

| カテゴリ | 技術 |
|---|---|
| フレームワーク | Next.js 14 / React 18 |
| 録音 | MediaRecorder API |
| 音声可視化 | Web Audio API |
| 文字起こし | Groq API（Whisper large-v3-turbo）|
| AI要約・整理 | Google Gemini 2.5 Flash API |
| 外部連携 | Notion API |
| インフラ | Docker / Docker Compose |
| 言語 | JavaScript |

---

## 💡 工夫した点

### 10分チャンク分割による長時間録音対応
Groq APIの25MB制限を回避するため、10分ごとに音声を自動分割して送信。
録音しながらバックグラウンドで文字起こしを並行処理することで、
70分録音しても停止後すぐに結果が得られる設計にしました。

### 完全無料構成
Groq・Gemini・Notionすべて無料枠を活用し、ランニングコスト0円を実現。

### リアルタイム波形表示
Web Audio APIのAnalyserNodeで録音中の音声をリアルタイムに可視化。

---

## ⚙️ セットアップ方法

### 必要なもの
- Docker Desktop
- Groq APIキー（https://console.groq.com）
- Gemini APIキー（https://aistudio.google.com）
- Notion APIキー＋ページID（https://www.notion.so/my-integrations）

### 手順

**① リポジトリをクローン**
```bash
git clone https://github.com/あなたのユーザー名/req-app.git
cd req-app
```

**② 環境変数を設定**
```bash
cp .env.local.example .env.local
```
`.env.local` を開いて各APIキーを入力してください。

```
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
NOTION_API_KEY=your_notion_api_key
NOTION_PAGE_ID=your_notion_page_id
```

**③ 起動**
```bash
docker-compose up --build
```

**④ ブラウザで開く**
```
http://localhost:3000
```

---

## 📱 使い方

1. 録音ボタン（●）を押して録音開始
2. 会議・面接・説明会の音声を録音
3. 停止ボタン（■）を押す
4. 自動で文字起こし→AI要件整理が完了
5. 「Notionに保存」ボタンでNotionに自動保存

---

## 📁 ファイル構成

```
req-app/
├── pages/
│   ├── index.js          # メインUI・録音ロジック
│   └── api/
│       ├── transcribe.js  # Groq文字起こしAPI
│       ├── analyze.js     # Gemini要件整理API
│       └── save-notion.js # Notion保存API
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.local.example
```

---

## 👨‍💻 開発期間

2026年3月（約4日間）で個人開発
