// server.js (v3 - Transcription Support)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const rooms = {};

wss.on('connection', (ws) => {
    let currentRoomId = null;
    let currentUserId = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) { return; }

        const { type, roomId, userId, payload } = data;
        
        switch (type) {
            case 'join-room':
                if (!roomId || !userId) return;
                currentRoomId = roomId;
                currentUserId = userId;
                if (!rooms[roomId]) rooms[roomId] = [];
                const otherUsers = rooms[roomId].map(client => client.userId);
                rooms[roomId].push({ ws, userId });
                ws.send(JSON.stringify({ type: 'existing-users', payload: otherUsers }));
                rooms[roomId].forEach(({ ws: clientWs }) => {
                    if (clientWs !== ws) {
                        clientWs.send(JSON.stringify({ type: 'new-user', payload: { userId } }));
                    }
                });
                break;

            case 'signal':
                if (!currentRoomId || !payload.to || !payload.from) return;
                const targetClient = rooms[currentRoomId]?.find(p => p.userId === payload.to);
                if (targetClient) {
                    targetClient.ws.send(JSON.stringify({ type: 'signal', payload: { signal: payload.signal, from: payload.from }}));
                }
                break;

            // New case to broadcast transcript chunks to everyone in the room.
            case 'transcript-chunk':
                if (!currentRoomId || !payload.text || !payload.from) return;
                rooms[currentRoomId]?.forEach(({ ws: clientWs }) => {
                    // Send to everyone including the original sender for consistency
                    clientWs.send(JSON.stringify({ type: 'transcript-chunk', payload }));
                });
                break;
        }
    });

    ws.on('close', () => {
        if (currentRoomId && currentUserId) {
            rooms[currentRoomId] = rooms[currentRoomId].filter(p => p.userId !== currentUserId);
            if (rooms[currentRoomId].length === 0) {
                delete rooms[currentRoomId];
            } else {
                rooms[currentRoomId].forEach(({ ws: clientWs }) => {
                    clientWs.send(JSON.stringify({ type: 'user-left', payload: { userId: currentUserId } }));
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
