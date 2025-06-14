// server.js
// A simple signaling server for WebRTC
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static('public'));

// In-memory store for rooms and their occupants
const rooms = {};

wss.on('connection', (ws) => {
    console.log('Client connected to signaling server');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        const { type, roomId, payload } = data;

        switch (type) {
            // A user wants to create and join a new room
            case 'create':
                if (!roomId) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room ID is required.' }));
                    return;
                }
                if (rooms[roomId]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room already exists.' }));
                    return;
                }
                rooms[roomId] = [ws];
                ws.roomId = roomId; // Associate ws with the room
                ws.send(JSON.stringify({ type: 'created', roomId }));
                console.log(`Room created: ${roomId}`);
                break;

            // A user wants to join an existing room
            case 'join':
                if (!roomId || !rooms[roomId]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room does not exist.' }));
                    return;
                }
                if (rooms[roomId].length >= 2) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is full.' }));
                    return;
                }

                // Add the second user and notify both parties
                rooms[roomId].push(ws);
                ws.roomId = roomId;
                
                // The second peer (initiator) is at index 0
                const initiator = rooms[roomId][0]; 
                // The new peer (receiver) is at index 1
                const receiver = ws; 

                // Notify receiver they have joined
                receiver.send(JSON.stringify({ type: 'joined', roomId }));
                // Notify initiator that a peer has joined, so it can start signaling
                initiator.send(JSON.stringify({ type: 'peer-joined' }));
                console.log(`Peer joined room: ${roomId}`);
                break;

            // Relaying WebRTC signaling data (offer, answer, ICE candidates)
            case 'signal':
                if (!roomId || !rooms[roomId]) return;
                // Find the other peer in the room and forward the signal
                const otherPeer = rooms[roomId].find(client => client !== ws);
                if (otherPeer) {
                    otherPeer.send(JSON.stringify({ type: 'signal', payload }));
                }
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const { roomId } = ws;
        if (roomId && rooms[roomId]) {
            // Remove the disconnected client
            rooms[roomId] = rooms[roomId].filter(client => client !== ws);
            // If the room is now empty, delete it
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
                console.log(`Room closed: ${roomId}`);
            } else {
                // Notify the remaining peer that their partner has left
                const remainingPeer = rooms[roomId][0];
                remainingPeer.send(JSON.stringify({ type: 'peer-left' }));
                 console.log(`Peer left room: ${roomId}`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
