import { useEffect, useState, useRef, useCallback } from "react";
import {
  MessageSquareDiff,
  MoreVertical,
  Search,
  Smile,
  Paperclip,
  Mic,
  Send,
  CheckCheck,
  Image as ImageIcon,
  ArrowDown,
} from "lucide-react";
import { io } from "socket.io-client";

const API = window.location.origin;

// Default WhatsApp silhouette avatar
const SILHOUETTE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 212 212'%3E%3Cpath fill='%23DFE5E7' d='M106.251.5C164.653.5 212 47.846 212 106.25S164.653 212 106.25 212C47.846 212 .5 164.654.5 106.25S47.846.5 106.251.5z'/%3E%3Cpath fill='%23FFF' d='M173.561 171.615a62.767 62.767 0 0 0-2.065-2.955 67.7 67.7 0 0 0-2.608-3.299 70.112 70.112 0 0 0-3.184-3.527 71.097 71.097 0 0 0-5.924-5.47 72.458 72.458 0 0 0-10.204-7.026 75.2 75.2 0 0 0-5.98-3.055c-.062-.028-.118-.059-.18-.087-9.792-4.44-22.106-7.529-37.416-7.529s-27.624 3.089-37.416 7.529c-.338.153-.653.318-.985.474a75.37 75.37 0 0 0-6.229 3.298 72.589 72.589 0 0 0-9.15 6.395 71.243 71.243 0 0 0-5.924 5.47 70.064 70.064 0 0 0-3.184 3.527 67.142 67.142 0 0 0-2.609 3.299 63.292 63.292 0 0 0-2.065 2.955 56.33 56.33 0 0 0-1.447 2.324c-.033.056-.073.119-.104.174a47.92 47.92 0 0 0-1.07 1.926c-.559 1.068-.818 1.678-.818 1.678v.398c18.285 17.927 43.322 28.985 70.945 28.985 27.623 0 52.661-11.058 70.945-28.985v-.398s-.26-.61-.818-1.678a49.126 49.126 0 0 0-1.07-1.926c-.031-.055-.071-.118-.104-.174a55.307 55.307 0 0 0-1.447-2.324zM106.002 125.5c2.645 0 5.212-.253 7.68-.737a38.272 38.272 0 0 0 3.624-.896 37.124 37.124 0 0 0 5.12-1.958 36.307 36.307 0 0 0 6.15-3.67 35.923 35.923 0 0 0 9.489-10.48 36.558 36.558 0 0 0 2.422-4.84 37.051 37.051 0 0 0 1.716-5.25c.299-1.208.542-2.443.725-3.701.275-1.887.417-3.827.417-5.811s-.142-3.925-.417-5.811a38.734 38.734 0 0 0-.725-3.701 37.205 37.205 0 0 0-1.716-5.25 36.612 36.612 0 0 0-2.422-4.84 35.923 35.923 0 0 0-9.489-10.48 36.284 36.284 0 0 0-6.15-3.67 37.124 37.124 0 0 0-5.12-1.958 37.67 37.67 0 0 0-3.624-.896 39.875 39.875 0 0 0-7.68-.737c-21.162 0-37.345 16.183-37.345 37.345 0 21.159 16.183 37.342 37.345 37.342z'/%3E%3C/svg%3E";

function fmtTime(ts) {
  if (!ts) return "";
  const ms = ts > 9999999999 ? ts : ts * 1000;
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPhone(jid) {
  const n = jid.split("@")[0];
  if (n.length < 10) return n;
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
}

function proxyUrl(url) {
  if (!url) return null;
  return `${API}/api/proxy?url=${encodeURIComponent(url)}`;
}

function extractMsg(record) {
  const m = record.message || {};
  const mt = record.messageType;
  let text = "";
  let imageUrl = null;
  let caption = "";

  if (m.conversation) text = m.conversation;
  else if (m.extendedTextMessage?.text) text = m.extendedTextMessage.text;
  else if (m.imageMessage) {
    imageUrl = m.imageMessage.url || null;
    caption = m.imageMessage.caption || "";
  } else if (m.audioMessage) text = "🎤 Áudio";
  else if (m.videoMessage) {
    text = m.videoMessage.caption || "🎥 Vídeo";
  } else if (m.documentMessage)
    text = "📄 " + (m.documentMessage.fileName || "Documento");
  else if (m.stickerMessage) text = "🏷️ Figurinha";
  else if (m.contactMessage)
    text = "👤 " + (m.contactMessage.displayName || "Contato");
  else if (m.locationMessage) text = "📍 Localização";
  else if (mt === "reactionMessage") return null;
  else if (mt === "protocolMessage") return null;
  else if (mt === "associatedChildMessage") return null;
  else text = mt || "";

  return {
    id: record.key?.id,
    text,
    imageUrl,
    caption,
    fromMe: record.key?.fromMe || false,
    timestamp: record.messageTimestamp,
    pushName: record.pushName,
  };
}

function lastMsgPreview(chat) {
  const lm = chat.lastMessage;
  if (!lm) return "";
  const m = lm.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return "📷 " + (m.imageMessage.caption || "Imagem");
  if (m.audioMessage) return "🎤 Áudio";
  if (m.videoMessage) return "🎥 Vídeo";
  if (m.documentMessage)
    return "📄 " + (m.documentMessage.fileName || "Documento");
  if (m.stickerMessage) return "🏷️ Figurinha";
  return lm.messageType || "";
}

export default function App() {
  const [socket, setSocket] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [connected, setConnected] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState("");
  const [search, setSearch] = useState("");
  const endRef = useRef(null);
  const activeChatRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMsgs]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const loadChats = useCallback(async () => {
    try {
      const r = await fetch(API + "/api/chats");
      const data = await r.json();
      if (!Array.isArray(data)) return;
      const parsed = data
        .filter((c) => c.remoteJid && !c.remoteJid.includes("status@"))
        .sort(
          (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
        )
        .slice(0, 100)
        .map((c) => ({
          jid: c.remoteJid,
          name: c.name || c.pushName || fmtPhone(c.remoteJid),
          pic: c.profilePicUrl || null,
          time: fmtTime(c.lastMessage?.messageTimestamp),
          lastMsg: lastMsgPreview(c),
          isGroup: c.remoteJid.includes("@g.us"),
        }));
      setContacts(parsed);
    } catch {}
  }, []);

  const loadMsgs = useCallback(async (jid) => {
    setLoading(true);
    setChatMsgs([]);
    try {
      const r = await fetch(
        API + "/api/messages/" + encodeURIComponent(jid)
      );
      const data = await r.json();
      if (Array.isArray(data)) {
        const parsed = data
          .map(extractMsg)
          .filter(Boolean)
          .filter((m) => m.text || m.imageUrl)
          .reverse();
        setChatMsgs(parsed);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const s = io(API, { path: "/socket.io/" });
    setSocket(s);

    s.on("qr_code_update", (b64) => setQrCode(b64));
    s.on("connection_success", () => {
      setConnected(true);
      setQrCode(null);
      loadChats();
    });

    s.on("new_message", (msg) => {
      setContacts((prev) => {
        const ex = prev.find((c) => c.jid === msg.number);
        if (!ex) {
          return [
            {
              jid: msg.number,
              name: msg.pushName || fmtPhone(msg.number),
              pic: null,
              time: "Agora",
              lastMsg: msg.text,
              isGroup: msg.number.includes("@g.us"),
            },
            ...prev,
          ];
        }
        return prev.map((c) =>
          c.jid === msg.number
            ? { ...c, lastMsg: msg.text, time: "Agora" }
            : c
        );
      });
      if (activeChatRef.current?.jid === msg.number) {
        setChatMsgs((prev) => [
          ...prev,
          {
            id: msg.id,
            text: msg.text,
            fromMe: msg.fromMe,
            timestamp: msg.timestamp,
            pushName: msg.pushName,
            imageUrl: msg.mediaUrl,
          },
        ]);
      }
    });

    s.on("message_sent", (msg) => {
      if (activeChatRef.current?.jid === msg.number) {
        setChatMsgs((prev) => [
          ...prev,
          { text: msg.text, fromMe: true, timestamp: msg.timestamp },
        ]);
      }
    });

    fetch(API + "/api/state")
      .then((r) => r.json())
      .then((d) => {
        if (d.state === "open") {
          setConnected(true);
          loadChats();
        }
      })
      .catch(() => {});

    return () => s.close();
  }, []);

  const selectChat = (c) => {
    setActiveChat(c);
    loadMsgs(c.jid);
  };

  const send = () => {
    if (!inputText.trim() || !activeChat) return;
    socket.emit("send_message", {
      number: activeChat.jid,
      text: inputText,
    });
    setChatMsgs((prev) => [
      ...prev,
      { text: inputText, fromMe: true, timestamp: Date.now() / 1000 },
    ]);
    setInputText("");
  };

  const filtered = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // --- LOGIN SCREEN ---
  if (!connected) {
    return (
      <div className="login-screen">
        <div className="login-header" />
        <div className="login-box">
          <div className="login-instructions">
            <h1>Use o WhatsApp Clone no seu computador</h1>
            <ol>
              <li>Abra o WhatsApp no seu celular</li>
              <li>
                Toque em <strong>Mais opções</strong> ou{" "}
                <strong>Configurações</strong> e selecione{" "}
                <strong>Aparelhos conectados</strong>
              </li>
              <li>
                Toque em <strong>Conectar um aparelho</strong>
              </li>
              <li>
                Aponte seu celular para esta tela para capturar o código QR
              </li>
            </ol>
          </div>
          <div className="login-qr">
            {qrCode ? (
              <img src={qrCode} alt="QR" />
            ) : (
              <div className="qr-loading">Aguardando QR Code...</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="avatar">
            <img src={SILHOUETTE} alt="" />
          </div>
          <div className="header-icons">
            <MessageSquareDiff size={20} />
            <MoreVertical size={20} />
          </div>
        </div>

        <div className="search-container">
          <div className="search-box">
            <Search size={16} color="#8696a0" />
            <input
              type="text"
              placeholder="Pesquisar ou começar uma nova conversa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="chats-list">
          {filtered.map((c) => (
            <div
              key={c.jid}
              className={`chat-item ${
                activeChat?.jid === c.jid ? "active" : ""
              }`}
              onClick={() => selectChat(c)}
            >
              <div className="avatar">
                <img
                  src={c.pic ? proxyUrl(c.pic) : SILHOUETTE}
                  alt=""
                  onError={(e) => {
                    e.target.src = SILHOUETTE;
                  }}
                />
              </div>
              <div className="chat-info">
                <div className="chat-top">
                  <span className="chat-name">{c.name}</span>
                  <span className="chat-time">{c.time}</span>
                </div>
                <div className="chat-preview">{c.lastMsg}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {activeChat ? (
        <div className="chat-area">
          <div className="chat-header">
            <div className="chat-header-left">
              <div className="avatar">
                <img
                  src={
                    activeChat.pic ? proxyUrl(activeChat.pic) : SILHOUETTE
                  }
                  alt=""
                  onError={(e) => {
                    e.target.src = SILHOUETTE;
                  }}
                />
              </div>
              <div className="chat-header-info">
                <div className="chat-header-name">{activeChat.name}</div>
              </div>
            </div>
            <div className="header-icons">
              <Search size={20} />
              <MoreVertical size={20} />
            </div>
          </div>

          <div className="messages-area">
            {loading && (
              <div className="loading-msgs">Carregando mensagens...</div>
            )}
            {chatMsgs.map((m, i) => (
              <div
                key={m.id || i}
                className={`msg-bubble ${m.fromMe ? "out" : "in"}`}
              >
                {activeChat.isGroup && !m.fromMe && m.pushName && (
                  <div className="msg-sender">{m.pushName}</div>
                )}
                {m.imageUrl && (
                  <div className="msg-image">
                    <img
                      src={proxyUrl(m.imageUrl)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                )}
                {(m.text || m.caption) && (
                  <span className="msg-text">{m.caption || m.text}</span>
                )}
                <span className="msg-meta">
                  {fmtTime(m.timestamp)}
                  {m.fromMe && (
                    <CheckCheck
                      size={16}
                      className="msg-check"
                    />
                  )}
                </span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="input-bar">
            <Smile size={24} className="input-icon" />
            <Paperclip size={24} className="input-icon" />
            <div className="input-wrapper">
              <input
                type="text"
                placeholder="Digite uma mensagem"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
            </div>
            {inputText ? (
              <Send
                size={24}
                className="input-icon send"
                onClick={send}
              />
            ) : (
              <Mic size={24} className="input-icon" />
            )}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 303 172" width="250">
              <path
                fill="#364147"
                d="M229.565 160.229c32.647-13.156 53.932-44.04 53.932-79.903C283.497 36.129 244.569 0 196.402 0c-31.394 0-59.168 15.56-76.302 39.357C105.254 14.626 81.244 0 54.127 0 24.227 0 0 20.427 0 45.602c0 18.044 12.052 33.9 30.004 40.465-1.055 4.549-1.623 9.271-1.623 14.123.001 45.472 40.892 82.286 91.335 82.286 17.549 0 33.89-4.479 47.668-12.201 11.471 3.084 23.681 4.724 36.367 4.724 33.497 0 64.125-10.399 85.141-27.475-16.858 13.376-38.08 17.474-59.327 12.705z"
              />
            </svg>
          </div>
          <h1>WhatsApp Web</h1>
          <p>
            Envie e receba mensagens sem precisar manter o celular conectado.
          </p>
          <div className="empty-footer">
            🔒 Suas mensagens pessoais são protegidas com a criptografia de
            ponta a ponta.
          </div>
        </div>
      )}
    </div>
  );
}
