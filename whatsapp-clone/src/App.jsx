import { useEffect, useState, useRef } from 'react';
import { 
  MessageSquareDiff, MoreVertical, ScanSearch, 
  Search, Smile, Paperclip, Mic, Send, Laptop 
} from 'lucide-react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:4000'; // O nosso proxy Node.js

function App() {
  const [socket, setSocket] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [connected, setConnected] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({}); // { '551199999@s.whatsapp.net': [{text, fromMe, time}] }
  const [inputText, setInputText] = useState('');
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom every time messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeChat]);

  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    // Connected to Node.js
    newSocket.on('connect', () => {
      // Pedimos a situação (vai gerar o QR Code se não estiver logado)
      newSocket.emit('request_qr');
    });

    newSocket.on('qr_code_update', (base64) => {
        setQrCode(base64);
    });

    newSocket.on('connection_success', () => {
        setConnected(true);
        // Em um sistema real, faríamos um `fetch` para pegar chats existentes.
        // Simulando que acabamos de logar:
        setContacts([
           { id: '5511999999999@s.whatsapp.net', name: 'Suporte Evolution', time: '11:45', lastMsg: 'Olá!' }
        ]);
    });

    newSocket.on('new_message', (msg) => {
        let chatId = msg.number;
        
        // Adiciona contato se não existir
        setContacts(prev => {
            if(!prev.find(c => c.id === chatId)) {
                return [{ id: chatId, name: msg.pushName || chatId, time: 'Agora', lastMsg: msg.text }, ...prev];
            } else {
                return prev.map(c => c.id === chatId ? {...c, lastMsg: msg.text, time: 'Agora'} : c);
            }
        });

        // Adiciona mensagem ao chat
        setMessages(prev => {
            const chatMsgs = prev[chatId] || [];
            return {
                ...prev,
                [chatId]: [...chatMsgs, { text: msg.text, fromMe: msg.fromMe, timestamp: msg.timestamp }]
            }
        });
    });

    newSocket.on('message_sent', (msg) => {
        setMessages(prev => {
            const chatMsgs = prev[msg.number] || [];
            return {
                ...prev,
                [msg.number]: [...chatMsgs, { text: msg.text, fromMe: msg.fromMe, timestamp: msg.timestamp }]
            }
        });
    });

    return () => newSocket.close();
  }, []);

  const handleSend = () => {
    if(!inputText.trim() || !activeChat) return;
    
    // Manda para o backend emitir para a API
    socket.emit('send_message', { number: activeChat.id, text: inputText });
    setInputText('');
  };

  const handleKeyPress = (e) => {
     if(e.key === 'Enter') handleSend();
  };

  if (!connected) {
      return (
          <div className="login-screen">
              <div className="login-header"></div>
              <div className="login-box">
                  <div className="login-instructions">
                      <h1>Use o WhatsApp Clone no seu computador</h1>
                      <ol>
                          <li>Abra o WhatsApp no seu celular</li>
                          <li>Toque em <strong>Mais opções</strong> ou <strong>Configurações</strong> e selecione <strong>Aparelhos conectados</strong></li>
                          <li>Toque em <strong>Conectar um aparelho</strong></li>
                          <li>Aponte seu celular para esta tela para capturar o código QR</li>
                      </ol>
                  </div>
                  <div className="login-qr">
                      {qrCode ? (
                         <img src={qrCode} alt="QR Code" />
                      ) : (
                         <div style={{color:'black', padding: '20px'}}>Carregando QR Code...</div>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  // --- Main App Layout ---
  return (
    <div className="app-container">
      {/* Sidebar Left */}
      <div className="sidebar">
        {/* Header Superior */}
        <div className="header">
           <div className="avatar">
               <img src="https://i.pravatar.cc/150?img=11" alt="My Avatar" />
           </div>
           <div className="header-icons">
               <ScanSearch size={20} />
               <MessageSquareDiff size={20} />
               <MoreVertical size={20} />
           </div>
        </div>

        {/* Search */}
        <div className="search-container">
           <div className="search-box">
               <Search size={18} color="var(--text-secondary)" />
               <input type="text" placeholder="Pesquisar ou começar uma nova conversa" />
           </div>
        </div>

        {/* Chats List */}
        <div className="chats-list">
           {contacts.map((contact) => (
             <div 
               key={contact.id} 
               className="chat-item" 
               style={{ backgroundColor: activeChat?.id === contact.id ? 'var(--bg-hover)' : ''}}
               onClick={() => setActiveChat(contact)}
             >
                <div className="avatar">
                    <img src={`https://i.pravatar.cc/150?u=${contact.id}`} alt="Avatar" />
                </div>
                <div className="chat-info">
                   <div className="chat-row">
                      <div className="chat-name">{contact.name}</div>
                      <div className="chat-time">{contact.time}</div>
                   </div>
                   <div className="chat-msg">{contact.lastMsg}</div>
                </div>
             </div>
           ))}
        </div>
      </div>

      {/* Main Chat Area */}
      {activeChat ? (
          <div className="chat-area">
             <div className="chat-bg"></div>
             
             {/* Header do Chat */}
             <div className="header" style={{zIndex: 1}}>
                 <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                    <div className="avatar">
                       <img src={`https://i.pravatar.cc/150?u=${activeChat.id}`} alt="User" />
                    </div>
                    <div className="chat-name" style={{fontSize: '16px'}}>{activeChat.name}</div>
                 </div>
                 <div className="header-icons">
                    <Search size={20} />
                    <MoreVertical size={20} />
                 </div>
             </div>

             {/* Histórico do Chat */}
             <div className="messages-container">
                {(messages[activeChat.id] || []).map((msg, idx) => {
                    const timeStr = new Date(msg.timestamp * (!msg.timestamp?.toString().includes('.') && msg.timestamp > 9999999999 ? 1 : 1000)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    return (
                        <div key={idx} className={`message ${msg.fromMe ? 'sent' : ''}`}>
                            <span>{msg.text}</span>
                            <span className="message-time">{timeStr}</span>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
             </div>

             {/* Área de Input Fixa em baixo */}
             <div className="message-input-area">
                <div className="input-icons">
                   <Smile size={24} />
                   <Paperclip size={24} />
                </div>
                <div className="text-input-wrapper">
                    <input 
                       type="text" 
                       placeholder="Digite uma mensagem" 
                       value={inputText}
                       onChange={(e) => setInputText(e.target.value)}
                       onKeyDown={handleKeyPress}
                    />
                </div>
                <div className="input-icons">
                   {inputText ? (
                       <Send size={24} onClick={handleSend} />
                   ) : (
                       <Mic size={24} />
                   )}
                </div>
             </div>
          </div>
      ) : (
          <div className="empty-chat">
             <Laptop size={100} style={{opacity: 0.1, marginBottom: '20px'}} />
             <h1>WhatsApp Clone Web</h1>
             <p>Envie e receba mensagens simulando a interface da web e conectada à Evolution API.</p>
          </div>
      )}
    </div>
  )
}

export default App
