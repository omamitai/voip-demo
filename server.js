// server.js (v2 - Multi-User)
// Signaling server for WebRTC group calls
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

// In-memory store for rooms and their occupants (sockets)
const rooms = {};

wss.on('connection', (ws) => {
    console.log('Client connected');
    let currentRoomId = null;
    let currentUserId = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        const { type, roomId, userId, payload } = data;
        
        switch (type) {
            // A user wants to join a room.
            case 'join-room':
                if (!roomId || !userId) return;

                currentRoomId = roomId;
                currentUserId = userId;

                // If room doesn't exist, create it.
                if (!rooms[roomId]) {
                    rooms[roomId] = [];
                }

                // Get all other users already in the room.
                const otherUsers = rooms[roomId].map(client => client.userId);
                rooms[roomId].push({ ws, userId });
                
                console.log(`User ${userId} joined room ${roomId}`);
                
                // Send the list of existing users to the new user.
                ws.send(JSON.stringify({
                    type: 'existing-users',
                    payload: otherUsers
                }));
                
                // Announce the new user to all other users in the room.
                rooms[roomId].forEach(({ ws: clientWs, userId: clientUserId }) => {
                    if (clientWs !== ws) {
                        clientWs.send(JSON.stringify({
                            type: 'new-user',
                            payload: { userId }
                        }));
                    }
                });
                break;

            // Relaying WebRTC signaling data (offer, answer, ICE candidates)
            case 'signal':
                if (!currentRoomId || !payload.to || !payload.from) return;

                const targetClient = rooms[currentRoomId].find(p => p.userId === payload.to);
                if (targetClient) {
                    targetClient.ws.send(JSON.stringify({
                        type: 'signal',
                        payload: {
                            signal: payload.signal,
                            from: payload.from
                        }
                    }));
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${currentUserId}`);
        if (currentRoomId && currentUserId) {
            // Remove the user from the room
            rooms[currentRoomId] = rooms[currentRoomId].filter(p => p.userId !== currentUserId);
            
            // If the room is empty, delete it
            if (rooms[currentRoomId].length === 0) {
                delete rooms[currentRoomId];
                console.log(`Room ${currentRoomId} is now empty and closed.`);
            } else {
                // Announce that the user has left to everyone else in the room
                rooms[currentRoomId].forEach(({ ws: clientWs }) => {
                    clientWs.send(JSON.stringify({
                        type: 'user-left',
                        payload: { userId: currentUserId }
                    }));
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
