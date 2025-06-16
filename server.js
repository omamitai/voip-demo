// server.js (Revised for two-user seamless pairing)
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

// In-memory store for pairing. `waitingUser` holds the first user until the second one connects.
let waitingUser = null;
// A map to hold the two paired users for easy signaling.
const pairs = new Map();

// --- Middleware ---
app.use(express.static(path.join(__dirname, 'dist')));

// --- WebSocket Signaling Logic ---
wss.on('connection', (ws) => {
    let currentUserId = null;

    // Handle incoming messages
    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('[Server] Invalid JSON received:', message);
            return;
        }

        const { type, userId, payload } = data;
        currentUserId = userId; // Keep track of the user ID for this connection

        switch (type) {
            case 'user-ready':
                console.log(`[Server] User ${userId} is ready.`);
                ws.userId = userId; // Attach userId to the websocket connection object

                if (waitingUser) {
                    // Pair found!
                    const peer1 = waitingUser;
                    const peer2 = ws;

                    // Create a pair mapping
                    pairs.set(peer1.userId, peer2);
                    pairs.set(peer2.userId, peer1);

                    // Notify both users they have been paired
                    console.log(`[Server] Pairing ${peer1.userId} and ${peer2.userId}.`);
                    peer1.send(JSON.stringify({ type: 'initiate-peer', payload: { peerId: peer2.userId } }));
                    peer2.send(JSON.stringify({ type: 'wait-for-peer', payload: { peerId: peer1.userId } }));

                    waitingUser = null; // Reset the waiting user
                } else {
                    // This is the first user, make them wait
                    waitingUser = ws;
                    ws.send(JSON.stringify({ type: 'wait' }));
                    console.log(`[Server] User ${userId} is waiting for a partner.`);
                }
                break;

            case 'signal':
                const targetWs = pairs.get(payload.to);
                if (targetWs) {
                    // Relay signal to the other user in the pair
                    targetWs.send(JSON.stringify({
                        type: 'signal',
                        payload: { signal: payload.signal, from: payload.from }
                    }));
                }
                break;
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log(`[Server] Client disconnected: ${currentUserId}`);
        
        // If the disconnected user was waiting, clear the waiting spot.
        if (waitingUser && waitingUser.userId === currentUserId) {
            waitingUser = null;
            console.log('[Server] The waiting user disconnected.');
        }

        // If the user was in a pair, notify the other user.
        const pairedUser = pairs.get(currentUserId);
        if (pairedUser) {
            console.log(`[Server] Notifying ${pairedUser.userId} that their partner has left.`);
            pairedUser.send(JSON.stringify({ type: 'partner-left', payload: { userId: currentUserId } }));
            // Clean up the pair mapping
            pairs.delete(currentUserId);
            pairs.delete(pairedUser.userId);
        }
    });
});

// --- HTTP Routes ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`[Server] Starlight Pro (2-User) server is live on http://localhost:${PORT}`);
});
