// client.js
// Frontend logic for the WebRTC VoIP Demo

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomIdInput = document.getElementById('room-id-input');
    const muteBtn = document.getElementById('mute-btn');
    const statusEl = document.getElementById('status');
    const roomIdDisplay = document.getElementById('room-id-display');
    const roomControls = document.getElementById('room-controls');
    const callArea = document.getElementById('call-area');
    const remoteAudio = document.getElementById('remote-audio');

    // --- State ---
    let localStream;
    let peer;
    let isMuted = false;
    let roomId;
    
    // Use 'ws' for local development, 'wss' for production (e.g., on Heroku/Glitch)
    const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${socketProtocol}//${window.location.host}`);

    // --- Signaling Logic ---
    socket.addEventListener('message', async (event) => {
        const data = JSON.parse(event.data);
        console.log('Signal received:', data);

        switch (data.type) {
            case 'created':
                roomId = data.roomId;
                roomIdDisplay.textContent = roomId;
                statusEl.textContent = 'Waiting for a peer to join...';
                break;
            case 'joined':
                statusEl.textContent = 'Peer joined. Setting up call...';
                // This client is the second to join, so it's not the initiator
                await initializePeer(false);
                break;
            case 'peer-joined':
                statusEl.textContent = 'Peer has joined. Initiating call...';
                // This client is the first one, so it initiates the connection
                await initializePeer(true);
                break;
            case 'signal':
                // Only signal if peer connection exists
                if (peer) {
                    peer.signal(data.payload);
                }
                break;
            case 'peer-left':
                statusEl.textContent = 'Peer left the call. Call ended.';
                resetCall();
                break;
            case 'error':
                alert(`Error: ${data.message}`);
                break;
        }
    });

    // --- WebRTC Logic ---
    async function initializePeer(initiator = false) {
        try {
            // Get user's audio stream
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            // Create a new Peer connection using simple-peer
            peer = new SimplePeer({
                initiator: initiator,
                stream: localStream,
                // Using public STUN servers
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            // --- Peer Event Listeners ---
            peer.on('signal', (data) => {
                // Send signal data to the other peer via the server
                socket.send(JSON.stringify({ type: 'signal', roomId, payload: data }));
            });

            peer.on('connect', () => {
                statusEl.innerHTML = `🔊 <span class="text-green-400">Live</span>`;
                console.log('PEER CONNECTED');
            });

            peer.on('stream', (stream) => {
                // Got remote audio stream, attach it to the <audio> element
                if ('srcObject' in remoteAudio) {
                    remoteAudio.srcObject = stream;
                } else {
                    remoteAudio.src = window.URL.createObjectURL(stream); // for older browsers
                }
                remoteAudio.play();
                console.log('Received remote stream');
            });
            
            peer.on('close', resetCall);
            peer.on('error', (err) => {
                console.error('Peer error:', err);
                resetCall();
            });

        } catch (err) {
            console.error('Error initializing peer:', err);
            statusEl.textContent = 'Failed to start call. Check permissions.';
            alert('Could not get audio permission. Please allow access to your microphone.');
        }
    }

    // --- UI Event Listeners ---
    createRoomBtn.addEventListener('click', () => {
        // Generate a simple random room ID
        roomId = Math.random().toString(36).substring(2, 8);
        socket.send(JSON.stringify({ type: 'create', roomId }));
        showCallArea();
    });

    joinRoomBtn.addEventListener('click', () => {
        roomId = roomIdInput.value.trim();
        if (!roomId) {
            alert('Please enter a Room ID.');
            return;
        }
        socket.send(JSON.stringify({ type: 'join', roomId }));
        roomIdDisplay.textContent = roomId;
        showCallArea();
    });

    muteBtn.addEventListener('click', () => {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted;
        muteBtn.innerHTML = isMuted 
            ? '<i class="fas fa-microphone-slash"></i> Unmute' 
            : '<i class="fas fa-microphone"></i> Mute';
        muteBtn.classList.toggle('bg-red-600', isMuted);
        muteBtn.classList.toggle('hover:bg-red-700', isMuted);
        muteBtn.classList.toggle('bg-gray-600', !isMuted);
        muteBtn.classList.toggle('hover:bg-gray-700', !isMuted);
    });

    // --- Helper Functions ---
    function showCallArea() {
        roomControls.classList.add('hidden');
        callArea.classList.remove('hidden');
    }

    function resetCall() {
        if (peer) {
            peer.destroy();
            peer = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        remoteAudio.srcObject = null;
        roomControls.classList.remove('hidden');
        callArea.classList.add('hidden');
        roomIdInput.value = '';
        statusEl.textContent = 'Ready. Create or join a room.';
        isMuted = false;
        muteBtn.innerHTML = '<i class="fas fa-microphone"></i> Mute';
        muteBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
        muteBtn.classList.add('bg-gray-600', 'hover:bg-gray-700');
    }
});
