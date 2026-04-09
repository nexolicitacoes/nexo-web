const express = require("express");
const http = require("http");
const axios = require("axios");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 4000;
const API = "http://127.0.0.1:8085";
const KEY = "NexoGlobalToken2026";
const INST = "NexoWhatsappClone";

const api = axios.create({
  baseURL: API,
  headers: { apikey: KEY, "Content-Type": "application/json" },
  timeout: 15000,
});

// --- Helpers ---
async function getState() {
  try {
    return (await api.get(`/instance/connectionState/${INST}`)).data?.instance
      ?.state;
  } catch {
    return null;
  }
}

async function getQr() {
  try {
    return (await api.get(`/instance/connect/${INST}`)).data?.base64 || null;
  } catch {
    return null;
  }
}

// --- REST API ---

// Chats list
app.get("/api/chats", async (req, res) => {
  try {
    const r = await api.post(`/chat/findChats/${INST}`, {});
    res.json(r.data || []);
  } catch {
    res.json([]);
  }
});

// Messages (DEDUPLICATED)
app.get("/api/messages/:jid", async (req, res) => {
  try {
    const r = await api.post(
      `/chat/findMessages/${INST}?page=${req.query.page || 1}&offset=80`,
      { where: { key: { remoteJid: req.params.jid } } }
    );
    const records = r.data?.messages?.records || [];

    // Deduplicate by key.id
    const seen = new Set();
    const unique = [];
    for (const m of records) {
      const kid = m.key?.id;
      if (kid && !seen.has(kid)) {
        seen.add(kid);
        unique.push(m);
      }
    }
    res.json(unique);
  } catch (e) {
    console.error("Erro msgs:", e?.response?.status);
    res.json([]);
  }
});

// Proxy images (profile pics and media from WhatsApp CDN)
app.get("/api/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Missing url");
  try {
    const r = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    res.set("Content-Type", r.headers["content-type"] || "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(r.data);
  } catch {
    res.status(404).send("Not found");
  }
});

// Connection state
app.get("/api/state", async (req, res) => {
  res.json({ state: await getState() });
});

// --- Socket.io ---
io.on("connection", async (socket) => {
  console.log("Frontend:", socket.id);

  const state = await getState();
  if (state === "open") {
    socket.emit("connection_success");
  } else {
    const qr = await getQr();
    if (qr) socket.emit("qr_code_update", qr);
  }

  socket.on("request_qr", async () => {
    const qr = await getQr();
    if (qr) socket.emit("qr_code_update", qr);
  });

  socket.on("send_message", async ({ number, text }) => {
    try {
      await api.post(`/message/sendText/${INST}`, { number, text });
      io.emit("message_sent", {
        number,
        text,
        fromMe: true,
        timestamp: Date.now() / 1000,
      });
    } catch (e) {
      console.error("Erro envio:", e?.response?.data || e.message);
    }
  });
});

// --- Webhook ---
app.post("/webhook", (req, res) => {
  const ev = req.body;
  res.status(200).send("OK");

  if (ev.event === "messages.upsert") {
    const d = ev.data;
    const m = d.message || {};
    let text = "";
    let mediaUrl = null;
    let mediaType = null;

    if (m.conversation) text = m.conversation;
    else if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;
    else if (m.imageMessage) {
      text = m.imageMessage.caption || "";
      mediaUrl = m.imageMessage.url;
      mediaType = "image";
    } else if (m.audioMessage) {
      text = "🎤 Áudio";
      mediaType = "audio";
    } else if (m.videoMessage) {
      text = m.videoMessage.caption || "🎥 Vídeo";
      mediaType = "video";
    } else if (m.documentMessage) {
      text = "📄 " + (m.documentMessage.fileName || "Documento");
      mediaType = "document";
    } else if (m.stickerMessage) {
      text = "🏷️ Figurinha";
      mediaType = "sticker";
    }

    io.emit("new_message", {
      id: d.key.id,
      number: d.key.remoteJid,
      pushName: d.pushName || d.key.remoteJid?.split("@")[0],
      text,
      fromMe: d.key.fromMe,
      timestamp: d.messageTimestamp || Date.now() / 1000,
      mediaUrl,
      mediaType,
    });
  }

  if (ev.event === "connection.update" && ev.data?.state === "open") {
    io.emit("connection_success");
  }
});

// --- Start ---
server.listen(PORT, "0.0.0.0", async () => {
  console.log("Backend porta " + PORT);

  try {
    await api.post("/instance/create", {
      instanceName: INST,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    });
  } catch {}

  try {
    await api.post(`/webhook/set/${INST}`, {
      webhook: {
        enabled: true,
        url: `http://127.0.0.1:${PORT}/webhook`,
        byEvents: false,
        base64: true,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    });
    console.log("Webhook OK");
  } catch {}
});
