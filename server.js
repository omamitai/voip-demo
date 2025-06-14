// server.js (v5 - Beta-Ready)
// Production-ready signaling server for the Starlight Pro React application.

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Server Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8080;
const rooms = {}; // In-memory store for rooms. For production, consider Redis.

// --- Middleware ---
// Serve the built React application from the 'dist' directory.
app.use(express.static(path.join(__dirname, 'dist')));

// --- WebSocket Signaling Logic ---
wss.on('connection', (ws) => {
    console.log('[Server] A client connected to the signaling server.');
    let currentRoomId = null;
    let currentUserId = null;

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('[Server] Invalid JSON received:', message);
            return;
        }

        const { type, roomId, userId, payload } = data;

        switch (type) {
            case 'join-room':
                if (!roomId || !userId) return;
                
                currentRoomId = roomId;
                currentUserId = userId;

                if (!rooms[roomId]) {
                    rooms[roomId] = [];
                    console.log(`[Server] Room created: ${roomId}`);
                }

                // Add the new user to the room.
                rooms[roomId].push({ ws, userId });
                console.log(`[Server] User ${userId} joined room ${roomId}. Total users: ${rooms[roomId].length}`);

                // Send the list of existing users to the newcomer.
                const existingUsers = rooms[roomId]
                    .map(client => client.userId)
                    .filter(id => id !== currentUserId);
                
                ws.send(JSON.stringify({
                    type: 'existing-users',
                    payload: existingUsers
                }));

                // Announce the new user to everyone else in the room.
                rooms[roomId].forEach(({ ws: clientWs, userId: clientUserId }) => {
                    if (clientUserId !== currentUserId) {
                        clientWs.send(JSON.stringify({ type: 'new-user', payload: { userId } }));
                    }
                });
                break;

            case 'signal':
                if (!roomId || !payload || !payload.to || !payload.from) return;
                
                const targetClient = rooms[roomId]?.find(p => p.userId === payload.to);
                if (targetClient) {
                    // console.log(`[Server] Relaying signal from ${payload.from} to ${payload.to}`);
                    targetClient.ws.send(JSON.stringify({
                        type: 'signal',
                        payload: { signal: payload.signal, from: payload.from }
                    }));
                } else {
                    console.warn(`[Server] Could not find target client ${payload.to} in room ${roomId} to relay signal.`);
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log(`[Server] Client disconnected: ${currentUserId}`);
        if (currentRoomId && currentUserId) {
            // Remove the user from the room.
            rooms[currentRoomId] = rooms[currentRoomId]?.filter(p => p.userId !== currentUserId);
            
            if (rooms[currentRoomId]?.length === 0) {
                delete rooms[currentRoomId];
                console.log(`[Server] Room ${currentRoomId} is now empty and has been closed.`);
            } else {
                // Announce that the user has left to everyone else.
                console.log(`[Server] Announcing user ${currentUserId} has left room ${currentRoomId}.`);
                rooms[currentRoomId]?.forEach(({ ws: clientWs }) => {
                    clientWs.send(JSON.stringify({ type: 'user-left', payload: { userId: currentUserId } }));
                });
            }
        }
    });
});

// --- HTTP Routes ---
// This wildcard route is crucial. It ensures that if a user refreshes a page
// on a client-side route (e.g., /room/xyz), the server still sends the main
// React app, allowing React Router to handle the URL.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`[Server] Starlight Pro server is live and listening on http://localhost:${PORT}`);
});
