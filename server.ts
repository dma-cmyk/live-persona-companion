import express from "express";
import http from "http";
import path from "path";
import { GoogleGenAI, Modality } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Parse JSON bodies
  app.use(express.json());

  // Models list API
  app.get("/api/models", async (req, res) => {
    try {
      const apiKey = req.headers["x-api-key"] as string || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "No API key provided" });
      }
      const ai = new GoogleGenAI({ apiKey });
      const modelsResponse = await ai.models.list();
      const models = [];
      for await (const m of modelsResponse) {
        // filter for gemini models that might support Live API
        if (m.name.includes("models/gemini") && (m.name.includes("flash") || m.name.includes("live") || m.name.includes("pro"))) {
          models.push(m.name);
        }
      }
      res.json({ models });
    } catch (error: any) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: error.message || "Failed to fetch models" });
    }
  });

  // WebSocket Server for Gemini Live API audio relay
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrades
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
    if (pathname === "/ws/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle WebSocket connections
  wss.on("connection", async (clientWs: WebSocket) => {
    console.log("Client connected to socket");
    let geminiSession: any = null;
    let isClosed = false;

    // Send error message helper
    const sendError = (msg: string) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: msg }));
      }
    };

    clientWs.on("message", async (message) => {
      if (isClosed) return;

      try {
        const payload = JSON.parse(message.toString());

        if (payload.type === "setup") {
          const { systemInstruction, voiceName, customApiKey, customModel } = payload;
          const apiKey = customApiKey || process.env.GEMINI_API_KEY;

          if (!apiKey) {
            sendError("APIキーが設定されていません。画面からAPIキーを入力するか、Settings > Secrets から GEMINI_API_KEY を設定してください。");
            return;
          }

          console.log(`Setting up Gemini Live API connection with voice: ${voiceName}, model: ${customModel || "gemini-3.1-flash-live-preview"}`);

          try {
            const ai = new GoogleGenAI({
              apiKey: apiKey,
              httpOptions: {
                headers: {
                  "User-Agent": "aistudio-build",
                },
              },
            });

            // Connect to Gemini Real-Time Live API
            geminiSession = await ai.live.connect({
              model: customModel || "gemini-3.1-flash-live-preview",
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: voiceName && voiceName.startsWith("VOICEVOX") ? undefined : {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName || "Kore" },
                  },
                },
                systemInstruction: systemInstruction || "You are a helpful companion.",
                outputAudioTranscription: {},
                inputAudioTranscription: {},
              },
              callbacks: {
                onmessage: (msg: any) => {
                  if (isClosed) return;
                  
                  if (msg.serverContent) {
                    // Extract model output audio
                    if (msg.serverContent.modelTurn?.parts) {
                      for (const part of msg.serverContent.modelTurn.parts) {
                        if (part.inlineData?.data && clientWs.readyState === WebSocket.OPEN) {
                          clientWs.send(
                            JSON.stringify({
                              type: "audio",
                              data: part.inlineData.data,
                            })
                          );
                        }
                      }
                    }

                    // Extract model text transcription
                    if (msg.serverContent.outputTranscription?.text && clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(
                        JSON.stringify({
                          type: "model-transcript",
                          text: msg.serverContent.outputTranscription.text,
                        })
                      );
                    }

                    // Extract user input audio transcription
                    if (msg.serverContent.inputTranscription?.text && clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(
                        JSON.stringify({
                          type: "user-transcript",
                          text: msg.serverContent.inputTranscription.text,
                        })
                      );
                    }

                    if (msg.serverContent.turnComplete && clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({ type: "turn-end" }));
                    }

                    // Handle model response execution completion / interruption
                    if (msg.serverContent.interrupted && clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({ type: "interrupted" }));
                    }
                  }
                },
              },
            });

            // Session created successfully
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "ready" }));
              console.log("Gemini Live API Session is ready!");
            }
          } catch (err: any) {
            console.error("Failed to connect to Gemini Live:", err);
            sendError(`Geminiとのリアルタイム音声接続に失敗しました: ${err.message || err}`);
          }
        } else if (payload.type === "audio") {
          // Forward raw pcm audio bits to Gemini live session
          if (geminiSession) {
            geminiSession.sendRealtimeInput({
              audio: {
                data: payload.data,
                mimeType: "audio/pcm;rate=16000",
              },
            });
          }
        } else if (payload.type === "video") {
          // Forward raw video frame bits to Gemini live session
          if (geminiSession) {
            geminiSession.sendRealtimeInput({
              video: {
                data: payload.data,
                mimeType: "image/jpeg",
              },
            });
          }
        }
      } catch (err: any) {
        console.error("Error processing client socket message:", err);
      }
    });

    clientWs.on("close", () => {
      console.log("Client socket connection closed");
      isClosed = true;
      if (geminiSession) {
        try {
          geminiSession.close();
        } catch (e) {
          console.error("Error closing Gemini live session:", e);
        }
      }
    });

    clientWs.on("error", (err) => {
      console.error("Client WS error:", err);
    });
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "alive" });
  });

  // Serve static assets in production, use Vite dev middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Listen on Port 3000 and Host 0.0.0.0
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`WebSockets proxy enabled at ws://0.0.0.0:${PORT}/ws/live`);
  });
}

startServer().catch((err) => {
  console.error("Critical error starting Express full stack server:", err);
});
