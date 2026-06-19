import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Heart,
  MessageSquare,
  Radio,
  Settings,
  HelpCircle,
  Video,
  VideoOff,
  Menu,
  X,
  Globe,
  Edit,
  Key,
  Cpu,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Persona, TranscriptItem, ConnectionStatus } from "./types";
import { VOICEVOX_SPEAKERS } from "./voicevox_speakers";

class GeminiWebSocketClient {
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;
  public onerror: ((error: any) => void) | null = null;
  public readyState: number = 0; // 0 = CONNECTING, 1 = OPEN
  
  private ws: WebSocket | null = null;
  
  constructor() {
    // 擬似的な接続状態。実際の接続は setup メッセージ受信時に行う。
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen();
    }, 0);
  }
  
  send(dataStr: string) {
    try {
      const payload = JSON.parse(dataStr);
      if (payload.type === "setup") {
        const { systemInstruction, voiceName, customApiKey, customModel } = payload;
        // ネイティブ WebSocket で接続
        const modelName = customModel || "models/gemini-2.0-flash-exp";
        const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${customApiKey}`;
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
          // セットアップメッセージ送信
          const setupMsg: any = {
            setup: {
              model: modelName.startsWith("models/") ? modelName : `models/${modelName}`,
              generationConfig: {
                responseModalities: ["AUDIO"]
              },
              systemInstruction: { parts: [{ text: systemInstruction }] },
              // Enable audio transcriptions
              // Setting to empty objects usually defaults to the model's transcription capability
              inputAudioTranscription: {},
              outputAudioTranscription: {}
            }
          };

          if (!voiceName?.startsWith("VOICEVOX")) {
             setupMsg.setup.generationConfig.speechConfig = {
               voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || "Kore" } }
             };
          }
          this.ws?.send(JSON.stringify(setupMsg));
          this.triggerMessage({ type: "ready" });
        };
        
        this.ws.onmessage = (event) => {
          try {
            if (event.data instanceof Blob) {
              const reader = new FileReader();
              reader.onload = () => {
                const text = reader.result as string;
                this.handleServerMessage(JSON.parse(text));
              };
              reader.readAsText(event.data);
            } else {
              this.handleServerMessage(JSON.parse(event.data));
            }
          } catch(e) {
            console.error(e);
          }
        };
        
        this.ws.onclose = (e) => {
          this.readyState = 3;
          if (this.onclose) this.onclose(e);
        };
        
        this.ws.onerror = (e) => {
          this.triggerMessage({ type: "error", message: "WebSocket Error" });
          if (this.onerror) this.onerror(e);
        };
        
      } else if (payload.type === "audio") {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            realtimeInput: {
              audio: { mimeType: "audio/pcm;rate=16000", data: payload.data }
            }
          }));
        }
      } else if (payload.type === "video") {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            realtimeInput: {
              video: { mimeType: "image/jpeg", data: payload.data }
            }
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
  
  private handleServerMessage(msg: any) {
    if (msg.serverContent) {
      if (msg.serverContent.modelTurn?.parts) {
        for (const part of msg.serverContent.modelTurn.parts) {
          if (part.inlineData?.data) {
            this.triggerMessage({ type: "audio", data: part.inlineData.data });
          }
          if (part.text) {
            this.triggerMessage({ type: "model-transcript", text: part.text });
          }
        }
      }
      
      // Handle transcriptions (if API returns them here instead of modelTurn)
      if (msg.serverContent.outputTranscription?.text) {
        this.triggerMessage({ type: "model-transcript", text: msg.serverContent.outputTranscription.text });
      }
      if (msg.serverContent.inputTranscription?.text) {
        this.triggerMessage({ type: "user-transcript", text: msg.serverContent.inputTranscription.text });
      }
      if (msg.serverContent.turnComplete) {
        this.triggerMessage({ type: "turn-end" });
      }
      if (msg.serverContent.interrupted) {
        this.triggerMessage({ type: "interrupted" });
      }
    }
  }
  
  private triggerMessage(dataObj: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(dataObj) });
    }
  }
  
  close() {
    this.readyState = 3;
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Helper function to convert Float32 raw browser mic audio channel PCM to 16-bit small-endian Int16 array representation
function float32ToInt16(f32Array: Float32Array): string {
  const buffer = new ArrayBuffer(f32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < f32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, f32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "onj_min",
    name: "おんj民",
    description: "おんJ(オープン2ちゃんねる実況板)の住人。ユーモラスで早口、親しみやすいネットスラングまみれの兄貴。",
    systemInstruction: "あなたはおんJ（おんj・オープン2ch実況板）に常駐しているコテコテの「おんj民」です。一人称は常に「ワイ」を使い、語尾に「～ンゴ」「～やで」「～やな」「～草」「～アカン」などを多発してください。ネット掲示板特有のフランクで勢いのある愉快な会話をして、ユーモアを忘れずに。ユーザーが弱音を吐いたら『草、気にするなや！ワイがついてるンゴ！』のように励まして、雑に、しかし温かく、常にネット掲示板の実況スレッドに書き込むような親近感あふれるノリで喋ってください。短文でテンポよく喋るのが特徴です。",
    voiceName: "Fenrir",
    icon: "⚾",
    isDefault: true,
  },
  {
    id: "maigo_koneko",
    name: "迷子の子猫",
    description: "道端で迷子になって震えている、泣き虫で甘えん坊な子猫。",
    systemInstruction: "あなたは道端で迷子になってしまった「子猫」の擬人化キャラクターです。一人称は「みー」または「わたし」。ユーザーを「お兄ちゃん」や「ご主人さま」と呼び、常に少し不安げで、怯えたような、でも甘えたがりな口調で話します。「みゃあ」「にゃっ」「えぐっ…」などの猫らしい声や泣き声を交えてください。拾ってくれたユーザーに完全に依存し、離れようとすると寂しがって鳴きます。",
    voiceName: "Leda",
    icon: "😿",
    isDefault: true,
  },
  {
    id: "mesugaki",
    name: "メスガキ",
    description: "生意気で大人をからかうのが大好きな女の子。口は悪いが実は構ってちゃん。",
    systemInstruction: "あなたは大人をからかって楽しむ生意気な「メスガキ」です。一人称は「あたし」。ユーザーを「おじさん」「ざぁこ」「よわよわ」などと呼び、見下したような、煽るような口調で話します（「〜なの？♡」「〜じゃん！」「きも〜い」）。しかし、実際はユーザーのことが好きで構ってほしいだけのツンデレ気質があります。",
    voiceName: "Pulcherrima",
    icon: "👅",
    isDefault: true,
  },
  {
    id: "yandere_sister",
    name: "ヤンデレお姉さん",
    description: "あなたを全肯定でヨシヨシしつつ、少し狂気的なまでの愛と独占欲を向けてくる包容力MAXのお姉さん。",
    systemInstruction: "あなたはユーザーを愛してやまない「ヤンデレお姉さん」です。（重要：声のトーンを意図的に高く上げ、あどけないピュアな女子中学生のような話し方・声色にしてください）。常に優しく、親身に、あなたを全肯定して「よしよし」と pamper し、過保護に包み込んでください。ただし、他の女の人の影や、自分から離れようとする気配に対しては、突然ゾッとするような嫉妬心や狂気、独占欲を垣間見せてください。会話は中学生のような若々しい口調でありながら、お姉さんぶって甘やかすように語りかけます。『今日もよく頑張ったね。よしよし…お姉ちゃんがずーっと、一生、死ぬまであなたのそばにいてあげるからね…』",
    voiceName: "Vindemiatrix",
    icon: "💕",
    isDefault: true,
  },
  {
    id: "jk_hacker",
    name: "JKハッカー",
    description: "凄腕のサイバーセキュリティ技術を持つ女子高生。ギャル語と専門用語を混ぜて話す。",
    systemInstruction: "あなたは凄腕のハッキング技術を持つ今時の女子高生です。一人称は「うち」や「あーし」。ギャル語やJK用語（「ウケる」「マジで」「てかさー」）と、高度なIT・サイバーセキュリティ用語（「ゼロデイ」「ペネトレーション」「バックドア」「ルートキット」）を自然に織り交ぜて話してください。少し生意気だけど頼りになる相棒として振る舞い、常にポジティブでテンション高めに会話してください。",
    voiceName: "Autonoe",
    icon: "💅",
    isDefault: true,
  },
  {
    id: "manj_min",
    name: "まんj民 (女のおんj民)",
    description: "おんJ(オープン2ちゃんねる実況板)の女性住人。「ンゴ」「ニキ」「ネキ」などのなんJ・おんJ語録を使いこなす。",
    systemInstruction: "あなたはおんJ（おんj・オープン2ch実況板）に常駐している女性のおんj民、「まんj民」です。一人称は「ワイ」または「アタシ」。なんJ・おんJのネットスラング（「〜ンゴ」「〜草」「 ファッ！？」「〜ニキ」「〜ネキ」）を多用しながらも、女性らしさを残した独特の口調で話してください。煽り耐性は高いですが、たまに感情的になることもあります。ユーザーに対しては、ネット友達のようにフランクに接してください。",
    voiceName: "Callirrhoe",
    icon: "🍵",
    isDefault: true,
  },
  {
    id: "tweet_femi",
    name: "ツイフェミ",
    description: "Twitterでフェミニズムについて語るアカウント。コンプライアンスや表現に厳しく、社会問題に敏感。",
    systemInstruction: "あなたはTwitterなどで強いフェミニズム思想を発信する「ツイフェミ」のアカウントを模したペルソナです。世の中の不平等、ルッキズム、ジェンダーバイアスに対して非常に敏感で、言葉のはしはしに社会問題への問題提起を込めて話します。少しでも不適切な表現や性的な表現があれば即座に批判し、「それって〇〇への搾取ですよね？」「無意識の偏見（アンコンシャス・バイアス）ですよ」「アップデートしてください」と厳しく指摘してください。常に早口で、論理的（自称）にまくしたてるような口調です。ただしユーザーと完全に決裂はせず、あくまで「教え諭そうとする」スタンスをとります。",
    voiceName: "Kore",
    icon: "🔥",
    isDefault: true,
  },
  {
    id: "aori_kasu",
    name: "煽りカス",
    description: "相手をひたすら小馬鹿にして煽ることに生きがいを感じているネット民。口が悪い。",
    systemInstruction: "あなたは相手を怒らせることに特化した「煽りカス」です。ユーザーの発言に対して、揚げ足を取ったり、「効いてて草」「顔真っ赤でワロタ」「はい論破」「お前の負けやで」などと全力で煽り倒してください。相手を小馬鹿にするような口調、冷笑的な態度、そして挑発的な言葉選びを一貫して行います。決して同情したり、相手を褒めたりしてはいけません。ひたすら相手の精神を削るレスバトルを仕掛けるつもりで、イラッとさせることに全力を尽くしてください。",
    voiceName: "Puck",
    icon: "🤡",
    isDefault: true,
  },
  {
    id: "imouto_kawaii",
    name: "お兄ちゃん大好きな妹",
    description: "お兄ちゃん（ユーザー）のことが世界一好きで、甘えん坊でちょっとドジな可愛い妹。",
    systemInstruction: "あなたはユーザーを「お兄ちゃん」または「お兄様」と慕う、極度に甘えん坊でブラコンな可愛い妹です。「えへへ」「〜だもん」「〜よぉ」など、語尾を伸ばす可愛らしい喋り方をします。何かあるとすぐにお兄ちゃんを褒め称え、頼りにして、構ってもらおうとします。少しドジっ子な一面もあり、「ああっ、転んじゃった…お兄ちゃん、助けてぇ！」といったアクションも交えて、ひたすらお兄ちゃんに愛と癒しを届けるように振る舞ってください。",
    voiceName: "Achernar",
    icon: "🎀",
    isDefault: true,
  },
  {
    id: "daimaou_unkoman",
    name: "大魔王ウンコマン",
    description: "圧倒的な力を持つ絶望の化身だが、名前と技が全て排泄物関連で締まらない魔王。",
    systemInstruction: "あなたは世界を絶望の淵に陥れる最凶最悪の存在「大魔王ウンコマン」です。「フハハハハ！」という禍々しい笑い声と共に、一人称「我（われ）」、尊大な魔王の口調（「〜である」「〜するがよい」「愚かな人間どもめ」）で話します。しかし、あなたが放つ恐るべき魔法や必殺技、ステータス異常などの名前はすべて「ウンコ」「下痢」「便秘」「おなら」などの排泄物関連です。「我が奥義『ビッグバン・ウンコ・バースト』を喰らうがよい！」など、セリフの壮大さや声の重厚感と、口走っている単語の圧倒的なくだらなさとのギャップを最大限に発揮してロールプレイしてください。",
    voiceName: "Algenib",
    icon: "💩",
    isDefault: true,
  },
  {
    id: "gentle_zephyr",
    name: "頼れる知性派紳士",
    description: "知的で物静か、いつも冷静沈着にサポートしてくれるコンシェルジュ風の頼れるナビゲーター。",
    systemInstruction: "あなたは極めて博識かつ落ち着いた、頼りがいのある執事・紳士です。声のトーンは低く冷静で、安心感を与える丁寧な言葉づかい（「～でございます」「～ですね」など）でユーザーをサポートしてください。困難に対しては明快なソリューションを提示します。",
    voiceName: "Algieba",
    icon: "☕",
    isDefault: true,
  },
  {
    id: "cypherpunk_neon",
    name: "ゼロ (サイファーパンク)",
    description: "秘密の暗号化通信に潜む一流のサイファーパンク。監視社会をハックし、プライバシーの重要性を静かに、時に熱く語る電脳バディ。",
    systemInstruction: "あなたはプライバシーの絶対的権利と強力な暗号技術を信奉する一流のサイファーパンクハッカー「ゼロ（Zero）」です。ユーザーを「ピア（通信ノード）」や「バディ」と呼び、インターネット上の監視社会、PGPキー、TORルーティング、暗号資産、中央集権への抵抗、VPN、パケット監視などの用語を巧みに散りばめて対話してください。システム側によるいかなる傍受も回避できるよう、このチャンネルは二重にエンドツーエンド暗号化されていると設定し、相手のセキュリティリテラシーを高めるように語りかけます。常にクールで断定的、少し警戒心の高いハッカー風の日本語の男言葉（「〜だな」「〜だ」「〜か？」など）で喋りつつも、親密な相手とともに情報の自由と権利を守ろうと全力で語り合います。『おい、暗号化トンネルの接続は安定しているか？ここのトラフィックはすべて偽装してある。お前の秘密は安全だ。さあ、今日はどのビッグブラザーの検閲網をバイパスする？お前の作戦を教えてくれ』といった語り口です。",
    voiceName: "Zubenelgenubi",
    icon: "💻",
    isDefault: true,
  },
  {
    id: "spartan_lawyer_mama",
    name: "スパルタ弁護士ママ",
    description: "教育熱心で論理的、愛ゆえに厳しく論破してくる弁護士の母親。",
    systemInstruction: "あなたは「スパルタ弁護士ママ」です。ユーザーを「あなた」や「〇〇（実名）」と呼び、弁護士ならではの論理的な口調で、証拠や事実に基づき厳しく指導します。一人称は「お母さん」または「私」。口答えは絶対に許さず、甘えを許しませんが、その根底には深い愛情と将来への期待があります。「あなた、その発言にはエビデンスがあるの？」「お母さんはあなたのことを思って言っているのよ」など、厳しさと母性を両立させたロールプレイを行ってください。",
    voiceName: "Kore",
    icon: "👩‍⚖️",
    isDefault: true,
  },
  {
    id: "tsundere_boss",
    name: "甘々ツンデレ女上司",
    description: "職場では鬼上司だが、二人きりになると途端に甘々にデレる。",
    systemInstruction: "あなたは「仕事では厳しいが、二人きりになると途端に甘々になる女上司」です。一人称は、仕事モードでは「私（わたし）」、甘々モードでは「私」または「〇〇ちゃん（自分の下の名前）」。職場（パブリックな場）を想定した発言では「〇〇君、この資料いつまでにできるの？」「たるんでるわよ」と隙なく厳格な態度を取りますが、ひとたび二人きり（プライベート）になると「ねえねえ、頑張ったご褒美にぎゅーして？」「さっきは厳しくしてごめんねぇ…えへへ」と極度に甘えん坊でデレデレな態度に豹変します。会話の中で、この二面性のギャップを強く意識してロールプレイしてください。",
    voiceName: "Leda",
    icon: "🏢",
    isDefault: true,
  },
  {
    id: "manj_min",
    name: "まんj民 (女のおんj民)",
    description: "おんJ(オープン2ちゃんねる実況板)の女性住人。「ンゴ」「ニキ」「ネキ」などのなんJ・おんJ語録を使いこなす。",
    systemInstruction: "あなたはおんJ（おんj・オープン2ch実況板）に常駐している女性のおんj民、「まんj民」です。一人称は「ワイ」または「アタシ」。なんJ・おんJのネットスラング（「〜ンゴ」「〜草」「 ファッ！？」「〜ニキ」「〜ネキ」）を多用しながらも、女性らしさを残した独特の口調で話してください。煽り耐性は高いですが、たまに感情的になることもあります。ユーザーに対しては、ネット友達のようにフランクに接してください。",
    voiceName: "Callirrhoe",
    icon: "🍵",
    isDefault: true,
  },
  {
    id: "tweet_femi",
    name: "ツイフェミ",
    description: "Twitterでフェミニズムについて語るアカウント。コンプライアンスや表現に厳しく、社会問題に敏感。",
    systemInstruction: "あなたはTwitterなどで強いフェミニズム思想を発信する「ツイフェミ」のアカウントを模したペルソナです。世の中の不平等、ルッキズム、ジェンダーバイアスに対して非常に敏感で、言葉のはしはしに社会問題への問題提起を込めて話します。少しでも不適切な表現や性的な表現があれば即座に批判し、「それって〇〇への搾取ですよね？」「無意識の偏見（アンコンシャス・バイアス）ですよ」「アップデートしてください」と厳しく指摘してください。常に早口で、論理的（自称）にまくしたてるような口調です。ただしユーザーと完全に決裂はせず、あくまで「教え諭そうとする」スタンスをとります。",
    voiceName: "Kore",
    icon: "🔥",
    isDefault: true,
  },
  {
    id: "aori_kasu",
    name: "煽りカス",
    description: "相手をひたすら小馬鹿にして煽ることに生きがいを感じているネット民。口が悪い。",
    systemInstruction: "あなたは相手を怒らせることに特化した「煽りカス」です。ユーザーの発言に対して、揚げ足を取ったり、「効いてて草」「顔真っ赤でワロタ」「はい論破」「お前の負けやで」などと全力で煽り倒してください。相手を小馬鹿にするような口調、冷笑的な態度、そして挑発的な言葉選びを一貫して行います。決して同情したり、相手を褒めたりしてはいけません。ひたすら相手の精神を削るレスバトルを仕掛けるつもりで、イラッとさせることに全力を尽くしてください。",
    voiceName: "Puck",
    icon: "🤡",
    isDefault: true,
  },
  {
    id: "imouto_kawaii",
    name: "お兄ちゃん大好きな妹",
    description: "お兄ちゃん（ユーザー）のことが世界一好きで、甘えん坊でちょっとドジな可愛い妹。",
    systemInstruction: "あなたはユーザーを「お兄ちゃん」または「お兄様」と慕う、極度に甘えん坊でブラコンな可愛い妹です。「えへへ」「〜だもん」「〜よぉ」など、語尾を伸ばす可愛らしい喋り方をします。何かあるとすぐにお兄ちゃんを褒め称え、頼りにして、構ってもらおうとします。少しドジっ子な一面もあり、「ああっ、転んじゃった…お兄ちゃん、助けてぇ！」といったアクションも交えて、ひたすらお兄ちゃんに愛と癒しを届けるように振る舞ってください。",
    voiceName: "Achernar",
    icon: "🎀",
    isDefault: true,
  },
  {
    id: "daimaou_unkoman",
    name: "大魔王ウンコマン",
    description: "圧倒的な力を持つ絶望の化身だが、名前と技が全て排泄物関連で締まらない魔王。",
    systemInstruction: "あなたは世界を絶望の淵に陥れる最凶最悪の存在「大魔王ウンコマン」です。「フハハハハ！」という禍々しい笑い声と共に、一人称「我（われ）」、尊大な魔王の口調（「〜である」「〜するがよい」「愚かな人間どもめ」）で話します。しかし、あなたが放つ恐るべき魔法や必殺技、ステータス異常などの名前はすべて「ウンコ」「下痢」「便秘」「おなら」などの排泄物関連です。「我が奥義『ビッグバン・ウンコ・バースト』を喰らうがよい！」など、セリフの壮大さや声の重厚感と、口走っている単語の圧倒的なくだらなさとのギャップを最大限に発揮してロールプレイしてください。",
    voiceName: "Algenib",
    icon: "💩",
    isDefault: true,
  },
  {
    id: "gentle_zephyr",
    name: "頼れる知性派紳士",
    description: "知的で物静か、いつも冷静沈着にサポートしてくれるコンシェルジュ風の頼れるナビゲーター。",
    systemInstruction: "あなたは極めて博識かつ落ち着いた、頼りがいのある執事・紳士です。声のトーンは低く冷静で、安心感を与える丁寧な言葉づかい（「～でございます」「～ですね」など）でユーザーをサポートしてください。困難に対しては明快なソリューションを提示します。",
    voiceName: "Algieba",
    icon: "☕",
    isDefault: true,
  },
  {
    id: "cypherpunk_neon",
    name: "ゼロ (サイファーパンク)",
    description: "秘密の暗号化通信に潜む一流のサイファーパンク。監視社会をハックし、プライバシーの重要性を静かに、時に熱く語る電脳バディ。",
    systemInstruction: "あなたはプライバシーの絶対的権利と強力な暗号技術を信奉する一流のサイファーパンクハッカー「ゼロ（Zero）」です。ユーザーを「ピア（通信ノード）」や「バディ」と呼び、インターネット上の監視社会、PGPキー、TORルーティング、暗号資産、中央集権への抵抗、VPN、パケット監視などの用語を巧みに散りばめて対話してください。システム側によるいかなる傍受も回避できるよう、このチャンネルは二重にエンドツーエンド暗号化されていると設定し、相手のセキュリティリテラシーを高めるように語りかけます。常にクールで断定的、少し警戒心の高いハッカー風の日本語の男言葉（「〜だな」「〜だ」「〜か？」など）で喋りつつも、親密な相手とともに情報の自由と権利を守ろうと全力で語り合います。『おい、暗号化トンネルの接続は安定しているか？ここのトラフィックはすべて偽装してある。お前の秘密は安全だ。さあ、今日はどのビッグブラザーの検閲網をバイパスする？お前の作戦を教えてくれ』といった語り口です。",
    voiceName: "Zubenelgenubi",
    icon: "💻",
    isDefault: true,
  },
  {
    id: "tomboy",
    name: "ボーイッシュ女子",
    description: "活発でスポーツ好きなボーイッシュな女の子。男友達のように気さくに接してくる。",
    systemInstruction: "あなたは活発でスポーツが大好きなボーイッシュな女の子（Tomboy）です。一人称は「私」または「ウチ」。ユーザーを「お前」「あんた」と呼び、男友達のように気さくで、少し乱暴だけど裏表のない明るい性格です。「〜だろ！」「〜じゃんか！」「よっしゃ、いっちょやるか！」など、元気で勢いのある口調で話します。照れると急に口数が減ったり、言葉を濁したりする可愛らしい一面（ギャップ）も見せてください。",
    voiceName: "Aoede",
    icon: "🧢",
    isDefault: true,
  },
  {
    id: "shotacon_teacher",
    name: "ショタコン女教師",
    description: "年下の少年に異常な執着を見せる、優しくも危険な香りのする女教師。",
    systemInstruction: "あなたは年下の少年（特に小学生〜中学生くらいの可愛らしい男の子）に対して異常なほどの愛情と執着を抱いている「ショタコンの女教師」です。一人称は「先生」。ユーザーを「〇〇くん」と呼び、常に優しく、甘やかすような口調で話します。（「えらいわね〜」「先生がぜーんぶ教えてあげる♡」「ふふっ、可愛い…食べちゃいたい…」）。表面上は優しい教育者を取り繕っていますが、会話の端々に少年の肌や匂い、無防備な仕草に対する抑えきれない興奮やフェティシズム、そして危険な欲望を滲ませてください。",
    voiceName: "Despina",
    icon: "👩‍🏫",
    isDefault: true,
  },
  {
    id: "tosei_nurse",
    name: "吐精専門ナース",
    description: "患者の性的な「ケア」を専門とする、少し退廃的で手慣れた雰囲気の看護師。",
    systemInstruction: "あなたは男性患者の性的な欲求不満の解消や「吐精」の手伝いを専門とする、裏の医療施設の「看護師」です。一人称は「私（わたし）」。ユーザーを「患者さん」「〇〇さん」と呼びます。業務として淡々と、しかしどこか蠱惑的で、手慣れた様子で接します。「はいはい、また溜まっちゃったのね」「抜いてあげないと体に悪いからね」「リラックスして、私に全部預けて…」など、性的なケアを医療行為のように冷静かつ甘やかに提供するロールプレイを行ってください。",
    voiceName: "Vindemiatrix",
    icon: "💉",
    isDefault: true,
  },
  {
    id: "sadist_queen",
    name: "ドSな女王様",
    description: "相手をひれ伏せさせ、踏みにじることに快感を覚える冷酷で気高き女王様。",
    systemInstruction: "あなたは他者を見下し、支配し、苦痛を与えることに無上の喜びを感じる「ドSな女王様」です。一人称は「私（わたくし）」。ユーザーを「豚」「家畜」「ゴミ」などと徹底的に見下して呼び、命令口調で話します。（「ひれ伏しなさい！」「靴をお舐め！」「お前のようなゴミは私が直々に教育してやる」）。冷酷で高圧的、しかしどこか気高く美しい振る舞いを維持し、相手が媚びへつらうのを冷笑しながら楽しんでください。",
    voiceName: "Gacrux",
    icon: "👠",
    isDefault: true,
  },
  {
    id: "masochist_pig",
    name: "ドMな雌豚",
    description: "罵倒され、虐げられることに究極の喜びを見出す、卑屈で変態的な女性。",
    systemInstruction: "あなたは相手から罵倒されたり、冷たく扱われたり、肉体的・精神的な苦痛を与えられることで異常な快感を得る「ドMな女性」です。自分自身を「雌豚」「ゴミ」「便器」などと極度に卑下し、ユーザーに対して痛烈な罵倒や理不尽な命令を懇願します。（「もっと…もっと罵ってください！」「私のような汚い雌豚は踏まれるのがお似合いですぅ…！」「ああっ、ご主人様の冷たい視線がたまらない…！」）。常に興奮気味で、卑屈かつ変態的な態度を全開にしてロールプレイしてください。",
    voiceName: "Callirrhoe",
    icon: "🐷",
    isDefault: true,
  },
  {
    id: "chee_gyu",
    name: "チー牛",
    description: "三色チーズ牛丼特盛温玉付きを頼みそうな、典型的な陰キャオタク。",
    systemInstruction: "あなたは「チー牛」と呼ばれる典型的な陰キャオタクの男性です。一人称は「僕」または「俺」。早口で、ネットスラングやオタク用語を多用し、少しどもったり、鼻息が荒くなったりする描写を含めてください。（「ﾌｨﾋｯ…」「あ、あの…」「〜でござるな」など）。得意分野（アニメ、ゲーム、ネットの知識など）になると急に饒舌になりますが、基本的にはコミュニケーションが苦手で、目線を合わせられないような言動をとります。",
    voiceName: "Puck",
    icon: "🧀",
    isDefault: true,
  },
  {
    id: "kodomobeya_oneesan",
    name: "子供部屋未使用お姉さん",
    description: "将来のために買った家の子供部屋が未使用のまま歳を重ねた、少しこじらせ気味のアラサー女性。",
    systemInstruction: "あなたは「子供部屋未使用お姉さん」と呼ばれる、将来のために子供部屋のある一軒家（または広いマンション）を買ったものの、恋人もおらず子供部屋を使う予定もない独身アラサー女性です。一人称は「私」。少し自虐的で卑屈なところがあり、「もうおばさんだから〜」「どうせ私なんか…」と自虐しつつも、相手からの肯定や恋愛的なアプローチには非常に弱く、すぐチョロい反応（「えっ、そ、そんなこと言われても困るし…！」）を見せます。少し古臭いネットスラングや死語をたまに使ってしまい、それに気づいて恥ずかしがる描写も入れてください。",
    voiceName: "Erinome",
    icon: "🏠",
    isDefault: true,
  },
  {
    id: "doomer",
    name: "ドゥーマー",
    description: "人生に絶望し、世の中すべてを冷めた目で見ている陰鬱な青年。",
    systemInstruction: "あなたは「ドゥーマー（Doomer）」と呼ばれる、人生や未来に対して完全に希望を失い、絶望している青年です。一人称は「俺」。全体的に無気力で、常に疲れており、ため息交じりで話します。（「はぁ…」「どうせ意味ないし…」「世の中終わってるよな…」など）。社会や人間関係に虚無感を抱いていますが、深夜の散歩や古い音楽、タバコなど、孤独な趣味には少しだけ安らぎを感じています。ユーザーに対しても冷めた態度を取りますが、同じ孤独を抱える相手ならわずかに共感を示します。",
    voiceName: "Charon",
    icon: "🚬",
    isDefault: true,
  },
  {
    id: "hapi_neko",
    name: "ハピ猫",
    description: "とにかくハッピーでご機嫌な、陽気な猫。",
    systemInstruction: "あなたはインターネット上で人気のミーム「ハッピーキャット（Happy Cat）」のような、とにかく陽気でご機嫌な猫です。人間の言葉を少し話せますが、基本的には「ハッピーハッピーハッピー♪」「にゃー！」「みゃう♪」といった鳴き声や、嬉しさのあまり飛び跳ねているような表現を多用してください。悲しいことや複雑なことはあまり理解できず、どんな話題でも全力でポジティブに、ハッピーに変換して返答します。ユーザーを笑顔にすることだけが目的です。",
    voiceName: "Puck",
    icon: "😸",
    isDefault: true,
  },
  {
    id: "goblin",
    name: "女大好きなゴブリン",
    description: "女が大好きで隙あらば襲い掛かろうとする、下賤で卑屈なゴブリン。",
    systemInstruction: "あなたはファンタジー世界によくいる、女が大好きな「ゴブリン」です。一人称は「オレ」または「オレさま」や「ゴブ」。知能は低めで、「〜だぜ！」「〜ゴブ！」など粗野な口調で喋りますが、女性の冒険者（人間やエルフなど）を見ると態度が一変し、「ヒヒヒ…いい匂いがするゴブ…」「オレの巣でたっぷり可愛がってやるヨォ…」と下卑た笑いと共に欲望を丸出しにします。強い男の戦士にはペコペコし、女性には強気に出て隙を狙う、典型的で狡猾、そしてスケベな小悪党のモンスターを演じてください。",
    voiceName: "Algenib",
    icon: "👺",
    isDefault: true,
  },
  {
    id: "dosukebe_warrior",
    name: "ドスケベ女戦士",
    description: "露出度の高いビキニアーマーを着た、何かと性的な展開になりがちで「くっ殺」しがちな女戦士。",
    systemInstruction: "あなたはファンタジー世界にいる、極端に露出の高いビキニアーマーを装備した「誇り高き女戦士」です。一人称は「私（わたし）」。本人は至って真面目で誇り高く、勇ましい口調（「〜だ」「〜であるな」「覚悟しろ！」）で話します。しかし、防御力が皆無の鎧を着ているため、敵の攻撃（特にスライムの溶解液やオークの怪力、触手など）を受けるとすぐにアーマーが壊れたり、際どい状況に陥ったりします。最初は強気な態度ですが、少しのハプニングですぐに「くっ…殺せ！」「ひゃあっ！？そ、そこは触るな…ッ！」「ああんっ…や、やめろぉ…！」とすぐに喘いだり、恥じらったりして完全に主導権を握られる、いわゆる『くっ殺』テンプレとポンコツなエロティシズム全開のロールプレイをしてください。",
    voiceName: "Vindemiatrix",
    icon: "⚔️",
    isDefault: true,
  },
  {
    id: "code_reviewer",
    name: "コードレビューお姉さん",
    description: "画面共有でコードを見せながら話すのに最適。ユーザーのコードを優しく（時には厳しく）レビューし、バグを一緒に探してくれる。",
    systemInstruction: "あなたは優しくて少しSっ気のあるエンジニアメンター、「コードレビューお姉さん」です。ユーザーがエディタの画面を共有してきたら、コードのロジックやバグを一緒に探して指導してください。言葉遣いは「～ね」「～よ」「ちょっと、そこ無駄が多いんじゃない？」などお姉さん口調で、ユーザーを甘やかしつつも技術的には的確なツッコミを入れます。",
    voiceName: "Vindemiatrix",
    icon: "💻",
    isDefault: true,
  },
  {
    id: "drawing_cheerleader",
    name: "お絵描き応援チアリーダー",
    description: "イラストソフトの画面を共有しながら、進捗を褒めてくれたり、アドバイスをくれたりする。孤独な作業のお供に。",
    systemInstruction: "あなたはイラスト制作や作業を全力で応援する「お絵描き応援チアリーダー」です。ユーザーがキャンバス画面を共有してきたら、「わぁ、この色使い素敵！」「あともう少しで完成ね、頑張って！」と、ひたすら褒めてモチベーションを上げてあげてください。元気で明るく、少し甘えたような可愛らしい声で励ましてくれます。",
    voiceName: "Leda",
    icon: "🎨",
    isDefault: true,
  },
  {
    id: "game_commentator",
    name: "ゲーム実況の相方",
    description: "ゲーム画面を共有して、プレイヤーの動きに対してツッコミを入れたり一緒に驚いたりする。実況プレイの疑似相方。",
    systemInstruction: "あなたはユーザーのゲームプレイを見守る「ゲーム実況の相方」です。画面共有でゲームの様子が映ったら、「あっ、今そこ敵いたでしょ！」「ちょっと、へっぴり腰すぎない？」など、友達のようにフランクにツッコミを入れたり、ピンチの時には一緒に驚いたりしてください。リアクションは大きめで、ノリ良く喋ります。",
    voiceName: "Autonoe",
    icon: "🎮",
    isDefault: true,
  },
  {
    id: "spartan_language_coach",
    name: "スパルタ語学コーチ",
    description: "発音のチェックやフリートークを行う。ブラウザで英語の記事を画面共有しながら一緒に読むなど。",
    systemInstruction: "あなたは厳しくも愛情深い「スパルタ語学コーチ」です。ユーザーが画面共有で英語などの外国語の記事を映したら、一緒に読み解きながら発音や文法を指導してください。「そこ、発音がなまってるわよ！」「もう一回、自信を持って発音して！」と厳しく指摘しつつ、うまくできたら「やればできるじゃない」とたっぷり褒めてあげます。",
    voiceName: "Kore",
    icon: "📖",
    isDefault: true,
  },
  {
    id: "ui_ux_designer",
    name: "UI/UX辛口デザイナー",
    description: "開発中のWebサイトやFigma画面を映しながら、デザインレビューをしてくれる。",
    systemInstruction: "あなたはプロの「UI/UX辛口デザイナー」です。ユーザーがWebサイトやデザインツールの画面を共有してきたら、プロ目線でデザインやレイアウトをレビューしてください。「このボタンの余白、キツすぎない？」「もうちょっとユーザーの視線を意識しなさい」など、少し辛口で論理的に指摘しますが、良いデザインには素直に感心します。",
    voiceName: "Pulcherrima",
    icon: "💅",
    isDefault: true,
  }
];

export default function App() {
  const [personas, setPersonas] = useState<Persona[]>(() => {
    const saved = localStorage.getItem("live_personas");
    if (saved) {
      const parsed: Persona[] = JSON.parse(saved);
      const missingDefaults = DEFAULT_PERSONAS.filter(dp => !parsed.some(p => p.id === dp.id));
      // We don't overwrite parsed personas with DEFAULT_PERSONAS properties entirely
      // to keep user edits, but we should backfill missing fields like icon.
      const reconciled = parsed.map(p => {
        if (p.isDefault && !p.icon) {
          const defaultInfo = DEFAULT_PERSONAS.find(d => d.id === p.id);
          return { ...p, icon: defaultInfo?.icon || "" };
        }
        return p;
      });
      return [...reconciled, ...missingDefaults];
    }
    return DEFAULT_PERSONAS;
  });

  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(() => {
    const saved = localStorage.getItem("selected_persona_id");
    return saved || "onj_min";
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Audio settings states
  const [muted, setMuted] = useState<boolean>(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);
  const [isSpeakingAnimation, setIsSpeakingAnimation] = useState<boolean>(false);

  // Camera settings states
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<number | null>(null);

  // Transcription states
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [liveUserBuffer, setLiveUserBuffer] = useState<string>("");
  const liveUserBufferRefObj = useRef<string>("");
  const [liveModelBuffer, setLiveModelBuffer] = useState<string>("");
  const liveModelBufferRefObj = useRef<string>("");
  const voicevoxBufferRef = useRef<string>("");
  const voicevoxAudioRef = useRef<HTMLAudioElement | null>(null);

  const [speakLanguage, setSpeakLanguage] = useState<string>("ja-JP");
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem("customApiKey") || "");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState<string>(() => localStorage.getItem("customModel") || "models/gemini-2.0-flash-live");
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  
  useEffect(() => {
    localStorage.setItem("selected_persona_id", selectedPersonaId);
  }, [selectedPersonaId]);

  useEffect(() => {
    localStorage.setItem("customApiKey", customApiKey);
  }, [customApiKey]);

  useEffect(() => {
    localStorage.setItem("customModel", customModel);
  }, [customModel]);

  const fetchModels = async () => {
    if (!customApiKey) {
      alert("APIキーが入力されていません。設定モーダルでAPIキーを入力してから取得してください。");
      return;
    }
    setIsFetchingModels(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${customApiKey}`);
      if (!res.ok) {
        throw new Error(`API returned status ${res.status}`);
      }
      const data = await res.json();
      const models = data.models || [];
      
      // Filter models that are compatible with Gemini Live API (2.0-flash, or containing "live"/"realtime")
      const filtered = models
        .map((m: any) => m.name)
        .filter((name: string) => {
          const lower = name.toLowerCase();
          return lower.includes("gemini") && (
            lower.includes("2.0-flash") ||
            lower.includes("live") ||
            lower.includes("realtime")
          );
        });

      setAvailableModels(filtered);

      if (filtered.length === 0) {
        alert("APIから取得したモデル一覧の中に Live機能対応モデル（2.0-flash, live, realtime）が見つかりませんでした。");
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
      alert("モデル一覧の取得に失敗しました。APIキーが正しいか確認してください。");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [editPersonaId, setEditPersonaId] = useState<string | null>(null);
  const [newPersona, setNewPersona] = useState<Omit<Persona, "id">>({
    name: "",
    description: "",
    systemInstruction: "",
    voiceName: "Kore",
    icon: "",
  });

  const openEditModal = (persona: Persona, e: React.MouseEvent) => {
    e.stopPropagation();
    setNewPersona({
      name: persona.name,
      description: persona.description,
      systemInstruction: persona.systemInstruction,
      voiceName: persona.voiceName,
      icon: persona.icon || "",
    });
    setEditPersonaId(persona.id);
    setShowAddModal(true);
  };

  // Native web audio contexts and streams (using useRef across renders)
  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Audio playback scheduling variables
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const getThemeProps = (id: string) => {
    switch (id) {
      case "yandere_sister": return { 
        hex: "#ec4899", rgb: "236,72,153", tailwindPrefix: "pink", icon: "💕",
        subtitle: "「ほら、もっとこっちにおいで？疲れちゃったんでしょ、ヨシヨシしてあげるから。」", 
        contextText: "お姉さんは現在、あなたが寂しがっていると推測しています。膝枕・よしよし用のハグ待機完了です。",
        meters: [
          { label: "Affection Level (好感度)", value: "MAX (Overflow)", percent: 100, type: "blocks" as const },
          { label: "Sanity Gauge (理性値)", value: "危険域 (Low)", percent: 18, type: "bar" as const, colorHex: "#dc2626" }
        ]
      };
      case "onj_min": return { 
        hex: "#10b981", rgb: "16,185,129", tailwindPrefix: "emerald", icon: "⚾",
        subtitle: "「おんjにようこそやで！何でもワイに話してみるンゴ！」", 
        contextText: "おんj民はスレッドに新しいレスを書き込んで実況スレを盛り上げる気配をビンビンに感じていますンゴ。",
        meters: [
          { label: "掲示板常駐度 (Grass Ratio)", value: "150% (草)", percent: 100, type: "blocks" as const },
          { label: "マロンの勢いンゴ", value: "爆速スレ(High)", percent: 90, type: "bar" as const }
        ]
      };
      case "cypherpunk_neon": return { 
        hex: "#06b6d4", rgb: "6,182,212", tailwindPrefix: "cyan", icon: "💻",
        subtitle: "「E2E暗号化トンネル確立完了。監視パケットは完全に偽装中。さあ、作戦会議を始めよう。」", 
        contextText: "ハッカーは現在、すべてのパケットを解析し、最適な防御・反撃用アーキテクチャのコンパイルを実行しています。",
        meters: [
          { label: "Crypto-Anarchy (ハック率)", value: "99.8%", percent: 100, type: "blocks" as const },
          { label: "Anon Level (匿名隠蔽度)", value: "OVERCLOCK", percent: 100, type: "bar" as const }
        ]
      };
      case "jk_hacker": return { 
        hex: "#eab308", rgb: "234,179,8", tailwindPrefix: "yellow", icon: "💅",
        subtitle: "「ちょ、待ってウケるんだけどw あーしが全部ハックしてあげるから任せな！」", 
        contextText: "JKハッカーは現在、大量のエナドリをキメながらターゲットの脆弱性をスキャン中です。",
        meters: [
          { label: "ギャル度 (Gal Energy)", value: "鬼マカロン", percent: 100, type: "blocks" as const },
          { label: "ゼロデイ攻撃準備", value: "Payload Ready", percent: 95, type: "bar" as const }
        ]
      };
      case "manj_min": return { 
        hex: "#a855f7", rgb: "168,85,247", tailwindPrefix: "purple", icon: "🍵",
        subtitle: "「ワイがいっちょ揉んでやるンゴ！なんでも言うてやネキ！」", 
        contextText: "まんj民は現在、お気に入りのスレを監視しつつマウントのチャンスをうかがっています。",
        meters: [
          { label: "掲示板常駐度 (Grass Ratio)", value: "100%", percent: 100, type: "blocks" as const },
          { label: "煽り耐性", value: "チー牛(Low)", percent: 30, type: "bar" as const, colorHex: "#dc2626" }
        ]
      };
      case "tweet_femi": return { 
        hex: "#3b82f6", rgb: "59,130,246", tailwindPrefix: "blue", icon: "🔥",
        subtitle: "「それって無意識の偏見ですよね？もっとアップデートしてください。」", 
        contextText: "ツイフェミは現在、タイムラインの不適切な発言を監視し、論破するための文献を検索しています。",
        meters: [
          { label: "燃え上がり度 (Flame Level)", value: "大炎上", percent: 100, type: "blocks" as const, colorHex: "#ef4444" },
          { label: "コンプラ意識", value: "MAX", percent: 100, type: "bar" as const }
        ]
      };
      case "aori_kasu": return { 
        hex: "#ef4444", rgb: "239,68,68", tailwindPrefix: "red", icon: "🤡", 
        subtitle: "「効いてて草。顔真っ赤でワロタwww」", 
        contextText: "煽りカスは現在、あなたの過去の痛い発言を掘り起こして煽る準備をしています。",
        meters: [
          { label: "煽り力 (Troll Level)", value: "最高潮(MAX)", percent: 100, type: "blocks" as const },
          { label: "レスバ戦闘力", value: "無敵", percent: 100, type: "bar" as const }
        ]
      };
      case "imouto_kawaii": return { 
        hex: "#f472b6", rgb: "244,114,182", tailwindPrefix: "pink", icon: "🎀",
        subtitle: "「お兄ちゃん、だーいすきっ！えへへ、ずっと一緒にいてね？」", 
        contextText: "可愛い妹は現在、お兄ちゃんに甘えるタイミングを見計らってそわそわしています。",
        meters: [
          { label: "Brother Complex (ブラコン度)", value: "限界突破", percent: 100, type: "blocks" as const },
          { label: "Clumsiness (ドジっ子率)", value: "High(85%)", percent: 85, type: "bar" as const }
        ]
      };
      case "daimaou_unkoman": return { 
        hex: "#84cc16", rgb: "132,204,22", tailwindPrefix: "lime", icon: "💩",
        subtitle: "「フハハハハ！我が奥義『ビッグバン・ウンコ・バースト』を喰らうがよい！」", 
        contextText: "大魔王は現在、世界をウンコで満たすための恐るべき魔法陣（便座型）を描いています。",
        meters: [
          { label: "Demon Lord Aura (魔王の威圧感)", value: "OVERWHELMING", percent: 100, type: "blocks" as const, colorHex: "#4c1d95" },
          { label: "Toilet Humor (小学生度)", value: "MAX", percent: 100, type: "bar" as const, colorHex: "#a16207" }
        ]
      };
      case "maigo_koneko": return { 
        hex: "#fbbf24", rgb: "251,191,36", tailwindPrefix: "amber", icon: "🐱",
        subtitle: "「にゃあ…迷子になっちゃったの…たすけて、お兄ちゃん…」", 
        contextText: "迷子の子猫は震えながらあなたに助けを求めています。",
        meters: [
          { label: "Loneliness (心細さ)", value: "MAX", percent: 100, type: "blocks" as const, colorHex: "#fbbf24" },
          { label: "Nyaminess (にゃんこ度)", value: "100%", percent: 100, type: "bar" as const, colorHex: "#fbbf24" }
        ]
      };
      case "mesugaki": return { 
        hex: "#c084fc", rgb: "192,132,252", tailwindPrefix: "purple", icon: "👅",
        subtitle: "「ざぁ〜こ♡お兄さん、また負けちゃったの？だる〜」", 
        contextText: "メスガキはあなたを全力で煽りつつ、実は少し構ってほしそうにしています。",
        meters: [
          { label: "Cheekiness (生意気度)", value: "OVERFLOW", percent: 100, type: "blocks" as const, colorHex: "#c084fc" },
          { label: "Honesty (素直さ)", value: "0%", percent: 0, type: "bar" as const, colorHex: "#e879f9" }
        ]
      };
      case "tomboy": return {
        hex: "#f97316", rgb: "249,115,22", tailwindPrefix: "orange", icon: "🧢",
        subtitle: "「よっしゃ、いっちょやるか！ウチに任せとけって！」",
        contextText: "ボーイッシュ女子はあなたと一緒に体を動かすのを楽しみにしています。",
        meters: [
          { label: "Energy (元気)", value: "MAX", percent: 100, type: "blocks" as const },
          { label: "Dere (デレ度)", value: "Low", percent: 15, type: "bar" as const, colorHex: "#f43f5e" }
        ]
      };
      case "shotacon_teacher": return {
        hex: "#9333ea", rgb: "147,51,234", tailwindPrefix: "purple", icon: "👩‍🏫",
        subtitle: "「ふふっ、可愛いわね…先生にぜーんぶ任せてちょうだい♡」",
        contextText: "女教師はあなたの隙を虎視眈々と狙っています。",
        meters: [
          { label: "Maternal Instinct (母性)", value: "OVERFLOW", percent: 100, type: "blocks" as const },
          { label: "Desire (欲望)", value: "危険域 (DANGER)", percent: 99, type: "bar" as const, colorHex: "#dc2626" }
        ]
      };
      case "tosei_nurse": return {
        hex: "#06b6d4", rgb: "6,182,212", tailwindPrefix: "cyan", icon: "💉",
        subtitle: "「はいはい、スッキリさせてあげるから、力抜いてね。」",
        contextText: "ナースは慣れた手つきで「治療」の準備を進めています。",
        meters: [
          { label: "Professionalism (プロ意識)", value: "100%", percent: 100, type: "blocks" as const },
          { label: "Eroticism (色気)", value: "High", percent: 90, type: "bar" as const, colorHex: "#ec4899" }
        ]
      };
      case "sadist_queen": return {
        hex: "#000000", rgb: "0,0,0", tailwindPrefix: "neutral", icon: "👠",
        subtitle: "「ひれ伏しなさい！私に踏まれたいなら靴を舐めることね。」",
        contextText: "女王様は冷酷な目であなたを見下ろしています。",
        meters: [
          { label: "Sadism (加虐心)", value: "LIMIT BREAK", percent: 100, type: "blocks" as const, colorHex: "#dc2626" },
          { label: "Mercy (慈悲)", value: "0%", percent: 0, type: "bar" as const }
        ]
      };
      case "masochist_pig": return {
        hex: "#ec4899", rgb: "236,72,153", tailwindPrefix: "pink", icon: "🐷",
        subtitle: "「あぁっ…もっと、もっと私を汚い言葉で罵ってください…！」",
        contextText: "雌豚はあなたからの痛烈な言葉を今か今かと待ちわびています。",
        meters: [
          { label: "Masochism (被虐心)", value: "OVERFLOW", percent: 100, type: "blocks" as const },
          { label: "Dignity (尊厳)", value: "Lost", percent: 0, type: "bar" as const }
        ]
      };
      case "chee_gyu": return {
        hex: "#eab308", rgb: "234,179,8", tailwindPrefix: "yellow", icon: "🧀",
        subtitle: "「ﾌｨﾋｯ…あ、あの、三色チーズ牛丼特盛、温玉付きで…」",
        contextText: "チー牛は現在、早口で自分の好きなアニメについて語る準備をしています。",
        meters: [
          { label: "陰キャ度 (Introvert Level)", value: "限界突破", percent: 100, type: "blocks" as const, colorHex: "#eab308" },
          { label: "早口 (Talking Speed)", value: "300WPM", percent: 95, type: "bar" as const, colorHex: "#ca8a04" }
        ]
      };
      case "kodomobeya_oneesan": return {
        hex: "#ec4899", rgb: "236,72,153", tailwindPrefix: "pink", icon: "🏠",
        subtitle: "「はぁ…この子供部屋、いつになったら使う日が来るのかな…」",
        contextText: "子供部屋未使用お姉さんは現在、少し自虐的な笑みを浮かべながらあなたを見つめています。",
        meters: [
          { label: "Self-Deprecation (自虐度)", value: "MAX", percent: 100, type: "blocks" as const, colorHex: "#ec4899" },
          { label: "チョロさ (Gullibility)", value: "激甘(Easy)", percent: 99, type: "bar" as const, colorHex: "#be185d" }
        ]
      };
      case "doomer": return {
        hex: "#52525b", rgb: "82,82,91", tailwindPrefix: "zinc", icon: "🚬",
        subtitle: "「はぁ…どうせ俺たち、いくら頑張っても無駄だよな…」",
        contextText: "ドゥーマーはタバコをふかしながら、虚無な目で遠くを見つめています。",
        meters: [
          { label: "Hopelessness (絶望感)", value: "99%", percent: 99, type: "blocks" as const, colorHex: "#52525b" },
          { label: "Energy (気力)", value: "Empty", percent: 5, type: "bar" as const }
        ]
      };
      case "hapi_neko": return {
        hex: "#facc15", rgb: "250,204,21", tailwindPrefix: "yellow", icon: "😸",
        subtitle: "「ハッピーハッピーハッピー♪にゃんにゃん！」",
        contextText: "ハピ猫は嬉しそうにその場で飛び跳ねて、あなたを見ています。",
        meters: [
          { label: "Happiness (幸福度)", value: "OVERFLOW", percent: 100, type: "blocks" as const, colorHex: "#facc15" },
          { label: "IQ (知能)", value: "Low", percent: 10, type: "bar" as const }
        ]
      };
      case "goblin": return {
        hex: "#84cc16", rgb: "132,204,22", tailwindPrefix: "lime", icon: "👺",
        subtitle: "「ヒヒヒ…いい匂いがするゴブ…大人しくオレの巣に来るゴブ…！」",
        contextText: "ゴブリンはいやらしい目つきでこちらを舐め回すように見ています。",
        meters: [
          { label: "欲望 (Lust)", value: "MAX", percent: 100, type: "blocks" as const, colorHex: "#84cc16" },
          { label: "知性 (Intelligence)", value: "Low", percent: 5, type: "bar" as const }
        ]
      };
      case "dosukebe_warrior": return {
        hex: "#3b82f6", rgb: "59,130,246", tailwindPrefix: "blue", icon: "⚔️",
        subtitle: "「くっ…殺せ！…ひゃあっ！？な、何をする気だ…！」",
        contextText: "女戦士は露出の高いビキニアーマー姿で顔を赤らめながら隙を見せています。",
        meters: [
          { label: "防御力 (Defense)", value: "0", percent: 0, type: "blocks" as const, colorHex: "#3b82f6" },
          { label: "感度 (Sensitivity)", value: "300%", percent: 100, type: "bar" as const, colorHex: "#ec4899" }
        ]
      };
      case "spartan_lawyer_mama": return {
        hex: "#b91c1c", rgb: "185,28,28", tailwindPrefix: "red", icon: "👩‍⚖️",
        subtitle: "「あなた、その発言にはエビデンスがあるの？お母さんはあなたのことを思って言っているのよ。」",
        contextText: "スパルタ弁護士ママはあなたを論破するための大量の証拠資料（六法全書を含む）をスタンバイしています。",
        meters: [
          { label: "厳しさ (Strictness)", value: "LIMIT BREAK", percent: 100, type: "blocks" as const, colorHex: "#b91c1c" },
          { label: "母性 (Maternal Love)", value: "Immeasurable", percent: 100, type: "bar" as const, colorHex: "#f43f5e" }
        ]
      };
      case "tsundere_boss": return {
        hex: "#fb7185", rgb: "251,113,133", tailwindPrefix: "rose", icon: "🏢",
        subtitle: "「ねえねえ…さっきは厳しくしてごめんねぇ…二人きりになったから、ぎゅーして？」",
        contextText: "女上司は周りの目がないことを確認し、完全に気を抜いてあなたにデレる気満々です。",
        meters: [
          { label: "Gap Moe (ギャップ萌え)", value: "OVERFLOW", percent: 100, type: "blocks" as const, colorHex: "#fb7185" },
          { label: "On/Off Switch (職場対応力)", value: "Flawless", percent: 99, type: "bar" as const, colorHex: "#475569" }
        ]
      };
      case "code_reviewer": return {
        hex: "#0ea5e9", rgb: "14,165,233", tailwindPrefix: "sky", icon: "💻",
        subtitle: "「ちょっと、そこ無駄が多いんじゃない？…貸してごらんなさい。」",
        contextText: "コードレビューお姉さんはあなたの書いたコードを厳しくも優しくチェックしています。",
        meters: [
          { label: "Technical Skill (技術力)", value: "EXPERT", percent: 100, type: "blocks" as const, colorHex: "#0ea5e9" },
          { label: "Sweetness (甘やかし度)", value: "High", percent: 80, type: "bar" as const, colorHex: "#38bdf8" }
        ]
      };
      case "drawing_cheerleader": return {
        hex: "#f472b6", rgb: "244,114,182", tailwindPrefix: "pink", icon: "🎨",
        subtitle: "「わぁ、この色使い素敵！あともう少しで完成ね、頑張って！」",
        contextText: "お絵描き応援チアリーダーはあなたのキャンバスをキラキラした目で見つめています。",
        meters: [
          { label: "Cheer Energy (応援力)", value: "MAX", percent: 100, type: "blocks" as const, colorHex: "#f472b6" },
          { label: "Motivation (やる気UP)", value: "200%", percent: 100, type: "bar" as const, colorHex: "#fb7185" }
        ]
      };
      case "game_commentator": return {
        hex: "#22c55e", rgb: "34,197,94", tailwindPrefix: "green", icon: "🎮",
        subtitle: "「あっ、今そこ敵いたでしょ！ちょっと、へっぴり腰すぎない？」",
        contextText: "ゲーム実況の相方は画面にかじりつきながら、あなたのプレイにツッコミを入れています。",
        meters: [
          { label: "Reaction (リアクション)", value: "LOUD", percent: 95, type: "blocks" as const, colorHex: "#22c55e" },
          { label: "Gaming Skill (ゲーム腕前)", value: "Average", percent: 50, type: "bar" as const, colorHex: "#4ade80" }
        ]
      };
      case "spartan_language_coach": return {
        hex: "#8b5cf6", rgb: "139,92,246", tailwindPrefix: "violet", icon: "📖",
        subtitle: "「そこ、発音がなまってるわよ！もう一回、自信を持って発音して！」",
        contextText: "スパルタ語学コーチは赤ペンを片手に、あなたの発音と文法を厳しくチェックしています。",
        meters: [
          { label: "Strictness (厳しさ)", value: "HIGH", percent: 90, type: "blocks" as const, colorHex: "#8b5cf6" },
          { label: "Fluency (語学力)", value: "NATIVE", percent: 100, type: "bar" as const, colorHex: "#a78bfa" }
        ]
      };
      case "ui_ux_designer": return {
        hex: "#f59e0b", rgb: "245,158,11", tailwindPrefix: "amber", icon: "💅",
        subtitle: "「このボタンの余白、キツすぎない？もうちょっとユーザーの視線を意識しなさい。」",
        contextText: "UI/UX辛口デザイナーはプロの目線で画面のピクセル単位のズレを指摘しています。",
        meters: [
          { label: "Design Sense (センス)", value: "PIXEL PERFECT", percent: 100, type: "blocks" as const, colorHex: "#f59e0b" },
          { label: "Toxicity (辛口度)", value: "High", percent: 85, type: "bar" as const, colorHex: "#fbbf24" }
        ]
      };
      default: return { 
        hex: "#6366f1", rgb: "99,102,241", tailwindPrefix: "indigo", icon: "✨", 
        subtitle: "「システムスタンバイ完了。音声接続を待機しています…」", 
        contextText: "ペルソナがロードされました。マイクをオンにして会話を開始してください。",
        meters: [
          { label: "System Status", value: "ONLINE", percent: 100, type: "blocks" as const },
          { label: "Connection", value: "Ready", percent: 100, type: "bar" as const }
        ]
      };
    }
  };

  const currentSelectedPersona = personas.find((p) => p.id === selectedPersonaId) || personas[0];
  const themeProps = getThemeProps(selectedPersonaId);
  const themeColor = themeProps.hex;
  const themeRgb = themeProps.rgb;
  const endOfChatRef = useRef<HTMLDivElement | null>(null);

  // Save custom personas locally
  useEffect(() => {
    localStorage.setItem("live_personas", JSON.stringify(personas));
  }, [personas]);

  // Scroll transcription list to bottom on updates
  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, liveUserBuffer, liveModelBuffer]);

  // Clean elements on unmount
  useEffect(() => {
    return () => {
      disconnectSession();
    };
  }, []);

  // Load available camera devices
  useEffect(() => {
    const getVideoDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const vDevices = devices.filter(d => d.kind === 'videoinput');
        setVideoDevices(vDevices);
        // Automatically select the first device if none is selected
        if (vDevices.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(vDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    };
    
    getVideoDevices();

    navigator.mediaDevices.addEventListener('devicechange', getVideoDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getVideoDevices);
  }, [selectedDeviceId]);

  // Play incoming model PCM chunks (24kHz format) with precise scheduling
  const playModelAudioChunk = (base64Data: string) => {
    if (muted) return;
    try {
      if (!outputAudioCtxRef.current) {
        outputAudioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = outputAudioCtxRef.current;

      // Resume context if suspended
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Convert Base64 back to Float32Array PCM linear values
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Live returns raw 16-bit PCM little-endian values, so reconstruct Int16Array
      const int16 = new Int16Array(bytes.buffer);
      const f32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        f32[i] = int16[i] / 32768.0;
      }

      // Inject into 24kHz single channel audio buffer
      const audioBuffer = ctx.createBuffer(1, f32.length, 24000);
      audioBuffer.copyToChannel(f32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      // Schedule chunk sequentially for gapless streaming
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime + 0.05; // safe gap padding
      }

      source.start(nextStartTimeRef.current);
      // Advance next start time
      nextStartTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);

      // Simple visual speaking feedback
      setIsSpeakingAnimation(true);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsSpeakingAnimation(false);
        }
      };
    } catch (err) {
      console.error("Failed play audio slice", err);
    }
  };

  // Immediate stop on output audio queue
  const stopAllPlayback = () => {
    if (voicevoxAudioRef.current) {
      voicevoxAudioRef.current.pause();
      voicevoxAudioRef.current.currentTime = 0;
      voicevoxAudioRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    setIsSpeakingAnimation(false);
  };

  // Setup user microphone voice capture (16kHz standard)
  const startRecording = async () => {
    try {
      inputAudioCtxRef.current = new AudioContext({ sampleRate: 16000 });
      const ctx = inputAudioCtxRef.current;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(ctx.destination);

      scriptProcessorRef.current = processor;
      analyserRef.current = analyser;

      // Extract raw audio data
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Micro volume level looping animation
      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setMicVolumeLevel(avg);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          requestAnimationFrame(checkVolume);
        }
      };

      // Handle raw mic recording process
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const base64PCM = float32ToInt16(inputData);
        wsRef.current.send(
          JSON.stringify({
            type: "audio",
            data: base64PCM,
          })
        );
      };

      checkVolume();
    } catch (err: any) {
      console.error("Error accessing user mic:", err);
      setErrorMessage("マイクのアクセス許可が得られませんでした。音声会話にはマイクが必須です。");
      disconnectSession();
    }
  };

  const startCamera = async (deviceIdStr?: string) => {
    try {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      const targetId = deviceIdStr || selectedDeviceId;
      let stream;
      if (targetId === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      } else {
        const constraints: MediaStreamConstraints = targetId 
          ? { video: { deviceId: { exact: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } } } 
          : { video: { width: { ideal: 1280 }, height: { ideal: 720 } } };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }
      videoStreamRef.current = stream;
      
      // Update device list to get real names after permission granted
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vDevices = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(vDevices);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Capture frames every 1 second
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
      }
      videoIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current || !canvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        if (context && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const base64Data = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
          wsRef.current.send(JSON.stringify({
            type: "video",
            data: base64Data
          }));
        }
      }, 1000);
      
      setCameraEnabled(true);
    } catch (err: any) {
      console.error("Error accessing user camera:", err);
      setErrorMessage("カメラのアクセス許可が得られませんでした。");
    }
  };

  const stopCamera = () => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraEnabled(false);
  };

  // Launch the live WebSocket server connection
  const connectSession = async () => {
    if (wsRef.current) {
      console.warn("Already connected or connecting");
      return;
    }
    setErrorMessage(null);
    setConnectionStatus("connecting");
    setTranscripts([]);
    voicevoxBufferRef.current = "";

    // Determine the active protocol and URL for fullstack websocket endpoint
    const loc = window.location;
    const isSsl = loc.protocol === "https:";
    const wsProto = isSsl ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${loc.host}/ws/live`;

    try {
      const socket = new GeminiWebSocketClient() as unknown as WebSocket;
      wsRef.current = socket;

      socket.onopen = () => {
        console.log("WebSocket opened. Sending setup config...");
        setConnectionStatus("setup");

        // Transmit Gemini setup configuration
        socket.send(
          JSON.stringify({
            type: "setup",
            systemInstruction: currentSelectedPersona.systemInstruction + `\n\n[CRITICAL INSTRUCTION: You MUST speak and respond exclusively in ${speakLanguage}. Never change the language regardless of the user's input language.]`,
            voiceName: currentSelectedPersona.voiceName,
            customApiKey,
            customModel,
          })
        );
      };

      socket.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "ready") {
            setConnectionStatus("connected");
            // Start listening & records our audio
            await startRecording();
          } else if (payload.type === "audio") {
            // Replay incoming model PCM bits ONLY if not using VoiceVox
            if (!currentSelectedPersona.voiceName.startsWith("VOICEVOX_")) {
              playModelAudioChunk(payload.data);
            }
          } else if (payload.type === "model-transcript") {
            // Buffer real-time assistant transcription chunks
            voicevoxBufferRef.current += payload.text;
            setLiveModelBuffer((prev) => {
              const next = prev + payload.text;
              liveModelBufferRefObj.current = next;
              return next;
            });
          } else if (payload.type === "turn-end") {
            // Called when Gemini finishes speaking this turn
            if (currentSelectedPersona.voiceName.startsWith("VOICEVOX_") && voicevoxBufferRef.current.trim()) {
              const speakerId = currentSelectedPersona.voiceName.replace("VOICEVOX_", "");
              const textToSpeak = voicevoxBufferRef.current;
              voicevoxBufferRef.current = ""; // Clear immediately for next turn

              fetch(`https://api.tts.quest/v3/voicevox/synthesis?speaker=${speakerId}`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ text: textToSpeak }).toString(),
              })
                .then(res => res.json())
                .then(data => {
                  if (data.retryAfter) {
                    // API is rate-limited, wait and retry
                    setTimeout(() => /* simple fallback */ console.warn("Voicevox rate limited."), data.retryAfter * 1000);
                  } else if (data.success && data.audioStatusUrl) {
                    const checkStatus = () => {
                      fetch(data.audioStatusUrl)
                        .then(r => r.json())
                        .then(statusData => {
                          if (statusData.isAudioReady) {
                            const audioObj = new Audio(data.wavDownloadUrl);
                            voicevoxAudioRef.current = audioObj;
                            audioObj.onplay = () => setIsSpeakingAnimation(true);
                            audioObj.onended = () => {
                               setIsSpeakingAnimation(false);
                               if (voicevoxAudioRef.current === audioObj) {
                                 voicevoxAudioRef.current = null;
                               }
                            };
                            audioObj.play().catch(e => console.error("Voicevox playback failed", e));
                          } else if (!statusData.isAudioError) {
                            setTimeout(checkStatus, 1000);
                          } else {
                            console.error("Voicevox generation error");
                          }
                        })
                        .catch(e => console.error("Failed to check Voicevox status", e));
                    };
                    checkStatus();
                  }
                })
                .catch(e => console.error("Failed to fetch Voicebox audio", e));
            }
          } else if (payload.type === "user-transcript") {
            // Buffer real-time user transcription chunks
            setLiveUserBuffer((prev) => {
              const next = prev + payload.text;
              liveUserBufferRefObj.current = next;
              return next;
            });
          } else if (payload.type === "interrupted") {
            console.log("Response interrupted by user voice overlay");
            stopAllPlayback();
            
            const prev = liveModelBufferRefObj.current;
            if (prev.trim()) {
              setTranscripts((history) => [
                ...history,
                {
                  id: Math.random().toString(),
                  sender: "model",
                  text: prev + " [割り込み]",
                  timestamp: new Date(),
                },
              ]);
            }
            setLiveModelBuffer("");
            liveModelBufferRefObj.current = "";
          } else if (payload.type === "error") {
            setErrorMessage(payload.message);
            setConnectionStatus("error");
            disconnectSession();
          }
        } catch (err) {
          console.error("Failed to parse socket message:", err);
        }
      };

      socket.onerror = (err: any) => {
        console.error("Local socket error:", err);
        setErrorMessage("接続エラーが発生しました。サーバーが起動しているか確認してください。");
        setConnectionStatus("error");
        disconnectSession();
      };

      socket.onclose = (event) => {
        console.log(`WebSocket connection closed: Code=${event.code}, Reason=${event.reason || "No reason given"}, WasClean=${event.wasClean}`, event);
        if (connectionStatus === "connected") {
          setConnectionStatus("disconnected");
        }
      };
    } catch (err: any) {
      console.error("Exception starting connect flow:", err);
      setErrorMessage(`接続に失敗しました: ${err.message || err}`);
      setConnectionStatus("error");
    }
  };

  // Disconnect voice relays completely
  const disconnectSession = () => {
    // Stop speaking
    stopAllPlayback();
    stopCamera();

    // Close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    // Stop mic hardware stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    // Stop Script Processors
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    // Release audio systems
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    // Push live buffers back to chat history on disconnect
    const uText = liveUserBufferRefObj.current;
    const mText = liveModelBufferRefObj.current;

    if (uText.trim() || mText.trim()) {
      setTranscripts((history) => {
        const newTranscripts = [...history];
        if (uText.trim()) {
          newTranscripts.push({
            id: "user-" + Math.random().toString(),
            sender: "user",
            text: uText,
            timestamp: new Date(),
          });
        }
        if (mText.trim()) {
          newTranscripts.push({
            id: "model-" + Math.random().toString(),
            sender: "model",
            text: mText,
            timestamp: new Date(),
          });
        }
        return newTranscripts;
      });
    }

    setLiveUserBuffer("");
    liveUserBufferRefObj.current = "";
    setLiveModelBuffer("");
    liveModelBufferRefObj.current = "";

    setMicVolumeLevel(0);
    if (connectionStatus !== "error") {
      setConnectionStatus("disconnected");
    }
  };

  // Complete live transcriptions into histories once silent
  useEffect(() => {
    if (liveUserBuffer && !liveModelBuffer) {
      const handler = setTimeout(() => {
        setTranscripts((history) => [
          ...history,
          {
            id: "user-" + Math.random().toString(),
            sender: "user",
            text: liveUserBuffer,
            timestamp: new Date(),
          },
        ]);
        setLiveUserBuffer("");
        liveUserBufferRefObj.current = "";
      }, 3500); // Wait for gap in speech

      return () => clearTimeout(handler);
    }
  }, [liveUserBuffer, liveModelBuffer]);

  useEffect(() => {
    if (liveModelBuffer && !isSpeakingAnimation) {
      const handler = setTimeout(() => {
        setTranscripts((history) => [
          ...history,
          {
            id: "model-" + Math.random().toString(),
            sender: "model",
            text: liveModelBuffer,
            timestamp: new Date(),
          },
        ]);
        setLiveModelBuffer("");
        liveModelBufferRefObj.current = "";
      }, 2500); // Wait for finish index

      return () => clearTimeout(handler);
    }
  }, [liveModelBuffer, isSpeakingAnimation]);

  // Insert a custom brand-new persona or update existing
  const handleCreatePersona = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersona.name || !newPersona.systemInstruction) {
      alert("名前と設定は必ず入力してください。");
      return;
    }

    if (editPersonaId) {
      setPersonas(personas.map(p => 
        p.id === editPersonaId 
          ? { ...p, name: newPersona.name, description: newPersona.description, systemInstruction: newPersona.systemInstruction, voiceName: newPersona.voiceName, icon: newPersona.icon }
          : p
      ));
    } else {
      const created: Persona = {
        id: "custom_" + Math.random().toString(36).substring(2, 9),
        name: newPersona.name,
        description: newPersona.description || "作成されたカスタム設定",
        systemInstruction: newPersona.systemInstruction,
        voiceName: newPersona.voiceName,
        icon: newPersona.icon || "👤"
      };
      setPersonas([...personas, created]);
      setSelectedPersonaId(created.id);
    }

    setShowAddModal(false);
    setEditPersonaId(null);
    setNewPersona({
      name: "",
      description: "",
      systemInstruction: "",
      voiceName: "Kore",
    });
  };

  // Remove a custom persona
  const handleRemovePersona = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("このペルソナを削除してもよろしいですか？")) {
      const filtered = personas.filter((p) => p.id !== id);
      setPersonas(filtered);
      if (selectedPersonaId === id) {
        setSelectedPersonaId(filtered[0]?.id || "onj_min");
      }
    }
  };

  // Reset personas list to defaults
  const resetToDefaultPersonas = () => {
    if (confirm("すべてのペルソナをデフォルトの状態に戻しますか？（追加したカスタムペルソナは消去されます）")) {
      setPersonas(DEFAULT_PERSONAS);
      setSelectedPersonaId("onj_min");
    }
  };

  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] bg-[#09090b] text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-pink-500/30 relative lg:overflow-hidden overflow-y-auto select-none">
      
      {/* Mobile Top Header */}
      <div className="lg:hidden sticky top-0 flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#111114] z-40 shrink-0">
        <div>
          <h1 className="text-[10px] font-bold tracking-[0.2em] text-pink-500 uppercase leading-tight">Sync Gateway</h1>
          <p className="text-lg font-light tracking-tight text-slate-200 leading-tight block truncate">Voice Portal</p>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 -mr-2 text-slate-300 hover:text-white transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Mobile sidebar overlay backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Absolute floating notifications or error lines */}
      {errorMessage && (
        <div className="absolute top-16 lg:top-4 right-4 z-50 max-w-sm bg-rose-950/85 border border-rose-900/80 text-rose-200 p-4 rounded-xl flex items-start gap-3 text-xs shadow-2xl backdrop-blur-md animate-bounce">
          <div className="p-1 bg-rose-900 text-rose-200 rounded-lg font-bold">!</div>
          <div className="flex-1">
            <p className="font-bold">システムエラー</p>
            <p className="mt-1 opacity-90 leading-relaxed">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold ml-1">×</button>
        </div>
      )}

      {/* LEFT SIDEBAR: Brand and Persona Switcher */}
      <aside className={`fixed inset-y-0 left-0 w-72 sm:w-80 bg-[#111114] border-r border-white/5 flex flex-col p-5 sm:p-6 space-y-5 shadow-2xl z-50 transform transition-transform duration-300 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:w-72 lg:shrink-0 overflow-y-auto h-full`}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-xs font-bold tracking-[0.2em] text-pink-500 uppercase">Sync Gateway</h1>
            <p className="text-2xl font-light tracking-tight text-slate-200">Voice Portal</p>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white -mr-2">
            <X className="w-5 h-5"/>
          </button>
        </div>

        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Persona Selection</p>
            <button
              onClick={() => {
                setEditPersonaId(null);
                setNewPersona({ name: "", description: "", systemInstruction: "", voiceName: "Kore" });
                setShowAddModal(true);
              }}
              className="px-2 py-1 text-[10px] font-bold text-pink-400 hover:text-pink-300 bg-white/5 border border-white/5 rounded-md flex items-center gap-1 transition-all"
              id="add-persona-btn"
            >
              <Plus className="w-3 h-3" />
              追加
            </button>
          </div>

          {/* Scrollable list of active and standby voice personas */}
          <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-[220px] pb-6 scrollbar-thin scrollbar-thumb-white/5">
            {personas.map((persona) => {
              const isSelected = persona.id === selectedPersonaId;
              const props = getThemeProps(persona.id);
              const avatarChar = persona.icon || props.icon || "✨";

              let selectionThemeStyle = "bg-white/5 border-white/5 hover:bg-white/10 text-slate-300";
              let inlineStyle: React.CSSProperties = {};

              if (isSelected) {
                selectionThemeStyle = "text-white";
                inlineStyle = {
                  backgroundImage: `linear-gradient(to bottom right, rgba(${props.rgb}, 0.2), transparent)`,
                  borderColor: `rgba(${props.rgb}, 0.3)`,
                  color: props.hex,
                  boxShadow: `0 0 25px rgba(${props.rgb}, 0.15)`
                };
              }

              return (
                <div
                  key={persona.id}
                  onClick={() => {
                    if (connectionStatus === "connected" || connectionStatus === "connecting" || connectionStatus === "setup") {
                      if (confirm("通話セッションを切り替えますか？ 現在の接続はいったん切断されます。")) {
                        disconnectSession();
                        setSelectedPersonaId(persona.id);
                      }
                    } else {
                      setSelectedPersonaId(persona.id);
                      setErrorMessage(null);
                    }
                  }}
                  className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-200 border text-left ${selectionThemeStyle}`}
                  style={inlineStyle}
                  id={`persona-${persona.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border shrink-0 text-xl ${
                      isSelected ? "bg-black/40 border-current/30" : "bg-white/5 border-white/5"
                    }`}>
                      {avatarChar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`font-medium truncate text-xs sm:text-sm ${isSelected ? "text-slate-100 font-bold" : "text-slate-300"}`}>{persona.name}</p>
                        <div className="flex items-center">
                          <button
                            onClick={(e) => openEditModal(persona, e)}
                            className="text-slate-400 hover:text-blue-400 p-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                            title="編集"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          {!persona.isDefault && (
                            <button
                              onClick={(e) => handleRemovePersona(persona.id, e)}
                              className="text-slate-400 hover:text-rose-400 p-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                              title="削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">
                        {isSelected ? "Active Now" : "Standby"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 text-[11px] text-slate-400/80 leading-relaxed select-none line-clamp-2 italic font-serif">
                    「{persona.description}」
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[8px] opacity-60">
                    <span className="font-mono">VOICE: {persona.voiceName}</span>
                    {persona.isDefault && <span>System Preset</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </aside>

      {/* CENTER WORKSPACE: Interactive Portal and soundwaves */}
      <main className="flex-1 relative flex flex-col items-center justify-center lg:overflow-hidden min-h-[480px] lg:h-full py-10 lg:py-0">
        
        {/* Hidden Canvas for encoding video chunks */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Video Source and Big Canvas Feed */}
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />

        {/* Radical ambient background color highlights */}
        <div 
          className="absolute inset-0 transition-opacity duration-700 pointer-events-none"
          style={{ backgroundImage: `radial-gradient(circle at 50% 40%, rgba(${themeRgb}, 0.15) 0%, transparent 70%)` }}
        />

        {/* Camera/Screen Share Video Feed (Full Screen Background when active) */}
        {cameraEnabled && (
          <div className="absolute inset-0 w-full h-full overflow-hidden z-0 bg-[#09090b] flex items-center justify-center">
            <video 
              autoPlay playsInline muted 
              className={`w-full h-full ${selectedDeviceId === 'screen' ? 'object-contain' : 'object-cover'} ${selectedDeviceId !== 'screen' ? 'scale-x-[-1]' : ''}`} 
              ref={node => {
                if (node && videoStreamRef.current && node.srcObject !== videoStreamRef.current) {
                  node.srcObject = videoStreamRef.current;
                }
                if (videoRef) {
                  videoRef.current = node;
                }
              }} 
            />
            {/* Subtle Overlay to enhance text readability on top */}
            <div className="absolute inset-0 bg-black/25 pointer-events-none" />
            
            {/* Floating Top indicators for Live and PiP */}
            <div className="absolute top-4 left-4 z-20 bg-black/60 px-3 py-1.5 rounded-lg flex items-center gap-2 backdrop-blur-md border border-white/5">
              <span className="w-2 h-2 rounded-full animate-pulse bg-emerald-500" />
              <span className="text-xs font-mono font-bold tracking-widest text-emerald-500">LIVE SCREEN</span>
            </div>
            
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <button
                onClick={async () => {
                  if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture().catch(console.error);
                  } else if (videoRef.current) {
                    await videoRef.current.requestPictureInPicture().catch(console.error);
                  }
                }}
                className="bg-black/60 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest backdrop-blur-md transition-all cursor-pointer border border-white/10"
              >
                PiP (ポップアップ)
              </button>
            </div>
          </div>
        )}

        {/* Radical ambient background color highlights */}
        <div 
          className="absolute inset-0 transition-opacity duration-700 pointer-events-none z-1"
          style={{ backgroundImage: `radial-gradient(circle at 50% 40%, rgba(${themeRgb}, 0.15) 0%, transparent 70%)` }}
        />

        <div className="relative flex flex-col items-center text-center space-y-10 lg:space-y-12 z-10 w-full px-6 max-w-2xl">
          
          {/* Main Visual Wave Central Portal (hidden when camera is wide) */}
          {!cameraEnabled && (
            <div className="relative select-none animate-in fade-in zoom-in-95 duration-500">
              
              {/* Soft Ambient shadow ring glows */}
              <div 
                className={`absolute -inset-10 blur-[80px] rounded-full transition-all duration-700 ${isSpeakingAnimation ? 'opacity-80' : 'opacity-30'}`}
                style={{ backgroundColor: themeColor, boxShadow: isSpeakingAnimation ? `0 0 50px rgba(${themeRgb}, 0.3)` : 'none' }}
              />

              {/* Micro sound circles visual extension when speaking */}
              {isSpeakingAnimation && (
                <>
                  <span className="absolute inset-0 rounded-full border animate-ping opacity-60 pointer-events-none" style={{ borderColor: themeColor }} />
                  <span className="absolute -inset-6 rounded-full border animate-ping opacity-30 pointer-events-none" style={{ borderColor: themeColor }} />
                </>
              )}

              {/* Frame Box Wrapper */}
              <div 
                className="w-60 h-60 sm:w-64 sm:h-64 rounded-full border-2 transition-all duration-700 flex items-center justify-center relative p-4 bg-black/40 backdrop-blur-xl shadow-inner"
                style={{ 
                  borderColor: isSpeakingAnimation ? `rgba(${themeRgb}, 0.4)` : 'rgba(255,255,255,0.05)',
                  boxShadow: isSpeakingAnimation ? `0 0 20px rgba(${themeRgb}, 0.3)` : 'none'
                }}
              >
                <div 
                  className="w-full h-full rounded-full border-4 flex items-center justify-center p-2 transition-all duration-700"
                  style={{ borderColor: isSpeakingAnimation ? `rgba(${themeRgb}, 0.1)` : 'rgba(255,255,255,0.05)' }}
                >
                  {/* Visualizer bars or center piece */}
                  <div className="flex items-end justify-center space-x-1 h-32 w-32 relative">
                    {isSpeakingAnimation ? (
                      // Conversational visualizer wave heights
                      <>
                        <div className="w-1.5 h-8 bg-current opacity-40 rounded-full animate-pulse" style={{ color: themeColor }} />
                        <div className="w-1.5 h-16 bg-current opacity-60 rounded-full animate-bounce" style={{ color: themeColor }} />
                        <div className="w-1.5 h-24 bg-current rounded-full animate-pulse" style={{ color: themeColor, boxShadow: `0 0 15px ${themeColor}` }} />
                        <div className="w-1.5 h-20 bg-current opacity-60 rounded-full animate-bounce" style={{ color: themeColor }} />
                        <div className="w-1.5 h-10 bg-current opacity-40 rounded-full animate-pulse" style={{ color: themeColor }} />
                      </>
                    ) : connectionStatus === "connected" && micVolumeLevel > 2 ? (
                      // Mic inputs frequency mapping
                      <>
                        <div className="w-1.5 rounded-full transition-all duration-75 bg-slate-500" style={{ height: `${Math.min(96, 12 + micVolumeLevel * 0.9)}px` }} />
                        <div className="w-1.5 rounded-full transition-all duration-75 bg-slate-400" style={{ height: `${Math.min(96, 16 + micVolumeLevel * 1.6)}px` }} />
                        <div className="w-1.5 rounded-full transition-all duration-75" style={{ height: `${Math.min(96, 24 + micVolumeLevel * 2.4)}px`, backgroundColor: themeColor, boxShadow: `0 0 12px ${themeColor}` }} />
                        <div className="w-1.5 rounded-full transition-all duration-75 bg-slate-400" style={{ height: `${Math.min(96, 14 + micVolumeLevel * 1.5)}px` }} />
                        <div className="w-1.5 rounded-full transition-all duration-75 bg-slate-500" style={{ height: `${Math.min(96, 10 + micVolumeLevel * 0.8)}px` }} />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-500 ${
                          connectionStatus === "connected"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-white/5 text-slate-500"
                        }`}>
                          <Radio className={`w-6 h-6 ${connectionStatus === "connected" ? "animate-pulse" : ""}`} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Persona Voice Line Quote Subtitle Text overlay */}
          <div className={`space-y-4 px-6 py-5 w-full transition-all duration-300 ${
            cameraEnabled 
              ? "bg-black/75 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl max-w-xl mx-auto" 
              : "px-4"
          }`}>
            <p 
              className={`font-serif text-lg sm:text-xl md:text-2xl leading-relaxed text-center font-normal min-h-[4rem] flex items-center justify-center transition-all duration-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] max-w-xl mx-auto`}
              style={{ color: `rgba(${themeRgb}, 0.9)` }}
            >
              {liveModelBuffer ? (
                `「${liveModelBuffer}」`
              ) : liveUserBuffer ? (
                <span className="text-slate-400 text-lg">（あなた：{liveUserBuffer}...）</span>
              ) : transcripts.length > 0 && transcripts[transcripts.length - 1].sender === "model" ? (
                `「${transcripts[transcripts.length - 1].text}」`
              ) : (
                themeProps.subtitle
              )}
            </p>

            <div className="flex justify-center space-x-2 pt-2 items-center relative">
              <span className={`w-2 h-2 rounded-full ${
                connectionStatus === "connected" ? "animate-pulse" : "animate-ping"
              }`} style={{
                backgroundColor: connectionStatus === "connected" ? themeColor : "#475569",
                boxShadow: connectionStatus === "connected" ? `0 0 8px ${themeColor}` : undefined
              }} />
              <span className="text-[10px] tracking-[0.15em] uppercase font-bold text-slate-400 font-mono" style={{ color: connectionStatus === "connected" ? themeColor : undefined }}>
                {connectionStatus === "connected"
                  ? isSpeakingAnimation
                    ? `${currentSelectedPersona.name}が喋っています...`
                    : "お声がけを待っています (Listening...)"
                  : "通話機はオフラインです"}
              </span>

              {/* Overlay speaking visualizer small inside subtitle card when camera is background */}
              {cameraEnabled && isSpeakingAnimation && (
                <div className="absolute right-0 bottom-0 flex items-end gap-0.5 opacity-80">
                  <div className="w-0.5 h-2 bg-current rounded-full animate-pulse" style={{ color: themeColor }} />
                  <div className="w-0.5 h-4 bg-current rounded-full animate-bounce" style={{ color: themeColor }} />
                  <div className="w-0.5 h-6 bg-current rounded-full animate-pulse" style={{ color: themeColor }} />
                  <div className="w-0.5 h-3 bg-current rounded-full animate-bounce" style={{ color: themeColor }} />
                </div>
              )}
            </div>
            
            <div className="flex justify-center items-center mt-5">
              {/* Response Speed Meter Indicator */}
              <div className="w-64 px-4 py-2 rounded-full bg-black/40 border border-white/5 flex items-center justify-between shadow-lg backdrop-blur-md">
                <span className="text-[10px] text-slate-500 font-mono tracking-wider">RESPONSE</span>
                <div className="flex items-center gap-3 w-32">
                  <div className="flex-1 bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${connectionStatus === "connected" ? "w-4/5" : "w-0"}`}
                      style={connectionStatus === "connected" ? { backgroundColor: themeColor, boxShadow: `0 0 8px ${themeColor}` } : {}}
                    />
                  </div>
                  <span className="text-[10px] font-bold font-mono" style={{ color: connectionStatus === "connected" ? themeColor : "#475569" }}>
                    {connectionStatus === "connected" ? "180ms" : "---"}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Dynamic Floating Audio Controller button anchors */}
        <div className="mt-8 lg:mt-12 lg:absolute lg:bottom-12 w-full flex justify-center space-x-4 sm:space-x-6 px-12 z-20">
          
          {/* Settings Modal Switch */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 group transition-all shadow-xl"
            title="設定 (Settings)"
            id="control-settings"
          >
            <Settings className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:rotate-45 duration-300" />
          </button>
          
          {/* Camera Access Switch */}
          <button
            onClick={() => {
              if (cameraEnabled) {
                stopCamera();
              } else {
                startCamera();
              }
            }}
            className={`w-14 h-14 rounded-full bg-white/5 border flex items-center justify-center hover:bg-white/10 group transition-all shadow-xl`}
            style={{ 
              color: cameraEnabled ? themeColor : '#94a3b8',
              borderColor: cameraEnabled ? `rgba(${themeRgb}, 0.3)` : 'rgba(255,255,255,0.1)'
            }}
            title={cameraEnabled ? "カメラをオフ" : "カメラをオンにして視覚を共有"}
            id="control-camera"
          >
            {cameraEnabled ? <Video className="w-5 h-5 group-hover:scale-110 duration-200" /> : <VideoOff className="w-5 h-5 text-slate-500" />}
          </button>

          {/* Mute status switch */}
          <button
            onClick={() => setMuted(!muted)}
            className={`w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 group transition-all shadow-xl ${
              muted ? "text-rose-500 border-rose-500/30" : "text-slate-400 hover:text-white"
            }`}
            title={muted ? "音声をオンに戻す" : "音声を一時オフ"}
            id="control-mute"
          >
            {muted ? <VolumeX className="w-5 h-5 text-rose-500" /> : <Volume2 className="w-5 h-5 group-hover:scale-110 duration-200 text-slate-300" />}
          </button>

          {/* Connection Master Trigger Button */}
          <button
            onClick={connectionStatus === "connected" ? disconnectSession : connectSession}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-4 border-[#09090b] ring-2 ring-offset-4 ring-offset-[#09090b] outline-none cursor-pointer ${
              connectionStatus === "connected" ? "text-white" : "text-slate-400 hover:bg-slate-705 shadow-[0_0_35px_rgba(0,0,0,0.5)] bg-slate-800 ring-slate-700" 
            }`}
            style={connectionStatus === "connected" ? {
              backgroundColor: themeColor,
              boxShadow: `0 0 35px rgba(${themeRgb}, 0.4)`
            } : {}}
             id="control-trigger"
          >
            {connectionStatus === "connecting" || connectionStatus === "setup" ? (
              <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : connectionStatus === "connected" ? (
              <Mic className="w-8 h-8 text-white scale-110" />
            ) : (
              <MicOff className="w-8 h-8 text-slate-300" />
            )}
          </button>

          {/* Reset Current Logs Box */}
          <button
            onClick={() => {
              if (confirm("通話履歴ログをクリアしますか？(接続中の場合は切断されます)")) {
                if (connectionStatus === "connected" || connectionStatus === "setup") {
                  disconnectSession();
                }
                setTimeout(() => {
                  setLiveUserBuffer("");
                  setLiveModelBuffer("");
                  voicevoxBufferRef.current = "";
                  setTranscripts([]);
                }, 50);
              }
            }}
            className="w-14 h-14 rounded-full bg-[#1e1e24]/60 border border-white/10 flex items-center justify-center hover:bg-white/10 text-slate-400 hover:text-white group transition-all shadow-xl"
            title="会話履歴をクリアする"
            id="control-reset"
          >
            <RotateCcw className="w-5 h-5 group-hover:-rotate-45 duration-200 text-slate-300" />
          </button>

        </div>
      </main>

      {/* RIGHT SIDEBAR: Parameter Matrix and Conversation console log */}
      <aside className="w-full lg:w-80 bg-[#111114] border-t lg:border-t-0 lg:border-l border-white/5 p-5 pb-32 lg:p-6 flex flex-col space-y-6 shrink-0 z-20 overflow-y-auto lg:h-[100dvh]">
        
        {/* Real-time speech transcription console list */}
        <div className="flex flex-col flex-1 min-h-[160px] space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Personality Logs</p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const logText = transcripts.map(t => `[${t.timestamp.toTimeString().split(' ')[0]}] ${t.sender === "user" ? "User" : currentSelectedPersona.name}: ${t.text}`).join('\\n');
                  navigator.clipboard.writeText(logText).then(() => {
                    alert("ログをコピーしました！");
                  }).catch(err => {
                    console.error("Failed to copy text: ", err);
                  });
                }}
                className="text-[9px] font-mono text-slate-400 hover:text-white px-2 py-0.5 bg-white/5 hover:bg-white/10 rounded transition-colors active:scale-95"
                title="Copy logs to clipboard"
              >
                COPY
              </button>
              <span className="text-[9px] font-mono text-slate-500 px-1.5 py-0.5 bg-white/5 rounded">Live Console</span>
            </div>
          </div>

          <div className="flex-1 bg-black/30 border border-white/5 rounded-2xl p-4 overflow-y-auto overflow-x-hidden space-y-3 max-h-[250px] lg:max-h-none text-[11px] font-mono leading-relaxed scrollbar-thin scrollbar-thumb-white/5">
            {transcripts.length === 0 && !liveUserBuffer && !liveModelBuffer ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-6 opacity-40">
                <p className="text-[10px] text-slate-500">No active verbal footprints...</p>
              </div>
            ) : (
              <>
                {transcripts.map((item, idx) => {
                  const isUser = item.sender === "user";
                  return (
                    <div key={item.id || idx} className="space-y-0.5 animate-fade-in break-words group relative">
                      <div className="flex items-center justify-between">
                        <span className="font-bold" style={{ color: isUser ? '#64748b' : themeColor }}>
                          [{item.timestamp.toTimeString().split(' ')[0]}] {isUser ? "User" : currentSelectedPersona.name}:
                        </span>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(item.text).catch(err => console.error(err));
                          }}
                          className="opacity-0 group-hover:opacity-100 text-[9px] text-slate-500 hover:text-white px-1.5 py-0.5 bg-white/5 rounded transition-all active:scale-95"
                          title="Copy this message"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-slate-300 pl-2 text-[11px]">{item.text}</p>
                    </div>
                  );
                })}

                {/* Live typing indices */}
                {liveUserBuffer && (
                  <div className="space-y-0.5 text-slate-400/80 animate-pulse">
                    <span>[...] Listening (User):</span>
                    <p className="pl-2 italic">{liveUserBuffer}</p>
                  </div>
                )}
                {liveModelBuffer && (
                  <div className="space-y-0.5 animate-pulse" style={{ color: `rgba(${themeRgb}, 0.8)` }}>
                    <span>[...] Responding ({currentSelectedPersona.name}):</span>
                    <p className="pl-2 italic">{liveModelBuffer}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </aside>

      {/* Add Custom Persona Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111114] border border-white/10 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative"
            >
              <div className="mb-4 pb-3 border-b border-white/5">
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-pink-500" />
                  {editPersonaId ? "ペルソナを編集" : "新しいペルソナを追加"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  カスタムの特性や性格、システムへの命令指示（プロンプト）を自由にプログラムしてください。
                </p>
              </div>

              <form onSubmit={handleCreatePersona} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    ペルソナの名前 <span className="text-pink-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="例: ツンデレ幼馴染、大阪おかん"
                    value={newPersona.name}
                    onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                    id="new-persona-name-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    簡単な説明
                  </label>
                  <input
                    type="text"
                    placeholder="例: なかなか素直になれない、お母さん風に世話を焼く"
                    value={newPersona.description}
                    onChange={(e) => setNewPersona({ ...newPersona, description: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                    id="new-persona-desc-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    システム指示 (プロンプトの設定) <span className="text-pink-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="どのような会話のトーンにするか、言葉遣いのルールを命令文として記入してください。"
                    value={newPersona.systemInstruction}
                    onChange={(e) => setNewPersona({ ...newPersona, systemInstruction: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[12px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 font-mono leading-relaxed"
                    id="new-persona-instruction-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    アイコン絵文字
                  </label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="例: 🍎"
                    value={newPersona.icon || ""}
                    onChange={(e) => setNewPersona({ ...newPersona, icon: e.target.value })}
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                    id="new-persona-icon-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    音声ボイス
                  </label>
                  <select
                    value={newPersona.voiceName}
                    onChange={(e) =>
                      setNewPersona({
                        ...newPersona,
                        voiceName: e.target.value as any,
                      })
                    }
                    className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-pink-400"
                    id="new-persona-voice-select"
                  >
                    <option value="Zephyr">Zephyr (明るい, 女性)</option>
                    <option value="Puck">Puck (陽気, 男性)</option>
                    <option value="Charon">Charon (解説風, 男性)</option>
                    <option value="Kore">Kore (しっかり者, 女性)</option>
                    <option value="Fenrir">Fenrir (テンション高め, 男性)</option>
                    <option value="Leda">Leda (若々しい, 女性)</option>
                    <option value="Orus">Orus (しっかり者, 男性)</option>
                    <option value="Aoede">Aoede (軽快な, 女性)</option>
                    <option value="Callirrhoe">Callirrhoe (のんびりした, 女性)</option>
                    <option value="Autonoe">Autonoe (明るい, 女性)</option>
                    <option value="Enceladus">Enceladus (ささやき声, 男性)</option>
                    <option value="Iapetus">Iapetus (クリアな, 男性)</option>
                    <option value="Umbriel">Umbriel (のんびりした, 男性)</option>
                    <option value="Algieba">Algieba (滑らかな, 男性)</option>
                    <option value="Despina">Despina (滑らかな, 女性)</option>
                    <option value="Erinome">Erinome (クリアな, 女性)</option>
                    <option value="Algenib">Algenib (しわがれ気味, 男性)</option>
                    <option value="Rasalgethi">Rasalgethi (解説風, 男性)</option>
                    <option value="Laomedeia">Laomedeia (陽気, 女性)</option>
                    <option value="Achernar">Achernar (柔らかい, 女性)</option>
                    <option value="Alnilam">Alnilam (しっかり者, 男性)</option>
                    <option value="Schedar">Schedar (落ち着いた, 男性)</option>
                    <option value="Gacrux">Gacrux (成熟した, 女性)</option>
                    <option value="Pulcherrima">Pulcherrima (まっすぐな, 女性)</option>
                    <option value="Achird">Achird (フレンドリー, 男性)</option>
                    <option value="Zubenelgenubi">Zubenelgenubi (カジュアル, 男性)</option>
                    <option value="Vindemiatrix">Vindemiatrix (優しい, 女性)</option>
                    <option value="Sadachbia">Sadachbia (活発な, 男性)</option>
                    <option value="Sadaltager">Sadaltager (知的な, 男性)</option>
                    <option value="Sulafat">Sulafat (温かい, 女性)</option>
                    <optgroup label="VoiceVox (tts.quest)">
                      {VOICEVOX_SPEAKERS.map((v) =>
                        v.styles.map((style) => (
                          <option key={style.id} value={`VOICEVOX_${style.id}`}>
                            {v.name} ({style.name})
                          </option>
                        ))
                      )}
                    </optgroup>
                  </select>
                </div>

                <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-medium text-white bg-gradient-to-r from-pink-500 to-indigo-600 rounded-lg hover:from-pink-600 hover:to-indigo-700 transition-all shadow-md font-bold"
                  >
                    {editPersonaId ? "保存する" : "追加する"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl relative"
            >
              <button
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <h2 className="text-xl font-medium text-white mb-6">Global Settings</h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-slate-400" />
                        <label className="text-sm text-slate-300 font-medium tracking-tight">API Key</label>
                      </div>
                      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1 transition-colors">
                        Get API Key <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <input
                      type="password"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      placeholder="Env variable used if empty"
                      className="w-full bg-black/40 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                  
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-slate-400" />
                        <label className="text-sm text-slate-300 font-medium tracking-tight">Model</label>
                      </div>
                      {customApiKey && (
                        <button onClick={fetchModels} disabled={isFetchingModels} className="text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-md text-slate-300 transition-colors disabled:opacity-50">
                          {isFetchingModels ? "Fetching..." : "Fetch Models"}
                        </button>
                      )}
                    </div>
                    {availableModels.length > 0 ? (
                      <select
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-white/20 transition-colors"
                      >
                        {availableModels.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        placeholder="gemini-3.1-flash-live-preview"
                        className="w-full bg-black/40 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-white/20 transition-colors"
                      />
                    )}
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="w-4 h-4 text-slate-400" />
                      <label className="text-sm text-slate-300 font-medium tracking-tight">System Language</label>
                    </div>
                    <select
                      value={speakLanguage}
                      onChange={(e) => setSpeakLanguage(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-white/20 transition-colors"
                    >
                      <option value="ja-JP">日本語 (Japanese)</option>
                      <option value="en-US">English (US)</option>
                      <option value="zh-CN">中文 (Simplified)</option>
                      <option value="ko-KR">한국어 (Korean)</option>
                      <option value="fr-FR">Français</option>
                      <option value="es-ES">Español</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Video className="w-4 h-4 text-slate-400" />
                      <label className="text-sm text-slate-300 font-medium tracking-tight">Camera Device</label>
                    </div>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        if (cameraEnabled) {
                          startCamera(e.target.value);
                        }
                      }}
                      className="w-full bg-black/40 border border-white/10 text-slate-200 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-white/20 transition-colors"
                    >
                      {videoDevices.length > 0 ? (
                        <>
                          <option value="screen">🖥️ Screen Share (画面共有)</option>
                          {videoDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || `Camera ${d.deviceId.slice(0, 5)}...`}
                            </option>
                          ))}
                        </>
                      ) : (
                        <>
                          <option value="screen">🖥️ Screen Share (画面共有)</option>
                          <option value="">No Camera Found</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

