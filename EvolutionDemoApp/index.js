const express = require('express');
const http = require('http');
const axios = require('axios');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 4000;
const EVOLUTION_API_URL = 'http://127.0.0.1:8080';
const GLOBAL_API_KEY = 'GlobalToken12345';
const INSTANCE_NAME = 'MinhaInstanciaDemo';

const api = axios.create({
    baseURL: EVOLUTION_API_URL,
    headers: { 'apikey': GLOBAL_API_KEY, 'Content-Type': 'application/json' }
});

// Broadcast changes over socket
io.on('connection', (socket) => {
    console.log('🔗 Cliente Front-end (Clone Whatsapp) conectado:', socket.id);
    
    // Front end calls this to send message
    socket.on('send_message', async ({ number, text }) => {
        try {
            await api.post(`/message/sendText/${INSTANCE_NAME}`, { number, text });
            // Simulate that it sent successfully on screen via socket pushing
            io.emit('message_sent', { number, text, fromMe: true, timestamp: Date.now() });
        } catch (error) {
            console.error('❌ Erro no envio', error?.response?.data || error.message);
        }
    });

    // Front-end can request the QR Code explicitly
    socket.on('request_qr', async () => {
        try {
            const qrRes = await api.get(`/instance/connect/${INSTANCE_NAME}`);
            if (qrRes.data.code && qrRes.data.code !== 200) {
                // Se retornou base64 QR
                io.emit('qr_code_update', qrRes.data.base64);
            }
        } catch(e) { }
    });
});

app.post('/webhook', async (req, res) => {
    const event = req.body;
    res.status(200).send('OK');

    // Manda para todo mundo conectado no WebSocket Web
    io.emit('evolution_event', event);

    if (event.event === 'messages.upsert') {
        const messageData = event.data;
        const msgType = messageData.messageType;
        const remoteJid = messageData.key.remoteJid;
        const fromMe = messageData.key.fromMe;
        
        // Emitir nova mensagem pro frontend 
        let text = '';
        if (msgType === 'conversation') text = messageData.message?.conversation;
        else if (msgType === 'extendedTextMessage') text = messageData.message?.extendedTextMessage?.text;

        io.emit('new_message', { 
            number: remoteJid, 
            pushName: messageData.pushName || remoteJid.split('@')[0], 
            text, 
            fromMe,
            timestamp: messageData.messageTimestamp || Date.now() / 1000
        });
    }

    if (event.event === 'connection.update') {
         if (event.data.state === 'open') {
             io.emit('connection_success');
         } else if (event.data.qr) {
             io.emit('qr_code_update', event.data.qr);
         }
    }
});

server.listen(PORT, async () => {
    console.log(`🚀 Backend Clone rodando na porta ${PORT}`);
    
    // Tenta Criar ou Setup API
    try {
        await api.post('/instance/create', { instanceName: INSTANCE_NAME, b64: true, qrcode: true, integration: "WHATSAPP-BAILEYS" });
    } catch (e) { /* ignore already exists */ }

    try {
        await api.post(`/webhook/set/${INSTANCE_NAME}`, {
            url: `http://host.docker.internal:${PORT}/webhook`, // Adjust if frontend docker proxy
            webhookByEvents: true,
            webhookEvents: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
        });
    } catch (e) { }
});
