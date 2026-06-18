# Live Persona Companion 🎙️✨

Gemini Multimodal Live API と VOICEVOX を組み合わせた、個性豊か（で少し刺激的）なペルソナたちとリアルタイム音声対話ができるWebアプリケーションです。

## 🌟 特徴

- **リアルタイム音声対話**: Geminiの高速な推論とVOICEVOXの自然な音声を組み合わせ、ラグの少ないスムーズな会話を実現。
- **多彩なペルソナ**: ヤンデレお姉さん、メスガキ、おんj民、JKハッカーから、ドSな女王様や大魔王まで、様々な性格のキャラクターを標準搭載。
- **カスタマイズ可能**: 自分で好きなペルソナ（プロンプトや声）を作成し、自由に設定・追加が可能。

## 🚀 セットアップ方法

### 1. VOICEVOXの準備
本アプリは音声合成にVOICEVOXのローカルAPIを使用します。
[VOICEVOX公式サイト](https://voicevox.hiroshiba.jp/)からアプリをダウンロード・インストールし、バックグラウンドで起動しておいてください。
（デフォルトで `http://127.0.0.1:50021` にてAPIが立ち上がります）

### 2. パッケージのインストール
```bash
npm install
```

### 3. 環境変数の設定
プロジェクトルートにある `.env.example` をコピーして `.env.local` または `.env` ファイルを作成し、Gemini API キーを設定してください。
```env
GEMINI_API_KEY=your_api_key_here
```

### 4. アプリの起動
```bash
npm run dev
```
起動後、ブラウザで表示されるローカルサーバーのURLにアクセスしてください。

## 🎮 使い方

1. 画面左側のサイドバーから、会話したい「ペルソナ」を選択します。
2. 画面下部のマイクボタンをクリックし、マイクのアクセスを許可して音声入力を開始します。
3. キャラクターに話しかけると、その性格や設定に沿った返答が音声と共に返ってきます。
4. サイドバーの「＋」ボタンから、自分だけの新しいペルソナを追加することもできます。

## 🛠 技術スタック

- **Frontend**: React, Vite, Tailwind CSS, Motion
- **Backend/API**: Node.js, Express, WebSocket, Gemini Multimodal Live API (`@google/genai`)
- **TTS**: VOICEVOX Engine

---
*Created with ❤️ by Venus Link for Mio.*
