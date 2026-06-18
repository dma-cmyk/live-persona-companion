# Live Persona Companion 🎙️✨

Gemini Multimodal Live API と VOICEVOX を組み合わせた、個性豊か（で少し刺激的）なペルソナたちとリアルタイム音声対話ができるWebアプリケーションです。

🌐 **Live Demo:** [https://live-persona-companion.vercel.app/](https://live-persona-companion.vercel.app/)

## 🌟 特徴

- **ブラウザ完結型・サーバーレス**: サーバーサイドのコードを必要とせず、ブラウザだけでGemini Live APIと直接通信します。Vercel等の静的ホスティングで簡単に動かせます。
- **リアルタイム音声対話**: Geminiの高速な推論とVOICEVOXの自然な音声を組み合わせ、ラグの少ないスムーズな会話を実現。
- **多彩なペルソナ**: ヤンデレお姉さん、メスガキ、おんj民、JKハッカーから、ドSな女王様や大魔王まで、様々な性格のキャラクターを標準搭載。
- **カスタマイズ可能**: 自分で好きなペルソナ（プロンプトや声）を作成し、自由に設定・追加が可能。

## 🚀 使い方 (オンライン版)

1. [https://live-persona-companion.vercel.app/](https://live-persona-companion.vercel.app/) にアクセスします。
2. 画面左下（またはヘッダー）の **「Settings (歯車アイコン)」** から、ご自身の **Gemini API Key** を入力して保存します。（キーはブラウザのローカルストレージにのみ保存されます）
3. 画面左側のサイドバーから、会話したい「ペルソナ」を選択します。
4. 画面下部のマイクボタンをクリックし、マイクのアクセスを許可して音声入力を開始します。
5. キャラクターに話しかけると、その性格や設定に沿った返答が音声と共に返ってきます。

*※音声合成には非公式の [VOICEVOX Web API](https://tts.quest/) を利用しているため、ローカルへのVOICEVOXインストールは不要です。*

## 💻 ローカルでの開発・起動方法

### 1. パッケージのインストール
```bash
npm install
```

### 2. アプリの起動
```bash
npm run dev
```
起動後、ブラウザで表示されるローカルサーバーのURLにアクセスしてください。

## 🛠 技術スタック

- **Frontend**: React, Vite, Tailwind CSS, Motion
- **API (Direct from Browser)**: Gemini Multimodal Live API (`@google/genai`)
- **TTS**: VOICEVOX (via [tts.quest API](https://tts.quest/))

---
*Created with ❤️ by Venus Link for Mio.*
