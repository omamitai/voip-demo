// client.js (v2 - Final Production-Ready Version)
// Frontend logic for the Starlight Calls WebRTC App

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    // We cache these references for performance and cleaner code.
    const entryScreen = document.getElementById('entry-screen');
    const callScreen = document.getElementById('call-screen');
    const createRoomBtn = document.getElementById('create-room-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const muteBtn = document.getElementById('mute-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const statusEl = document.getElementById('status');
    const roomIdDisplay = document.getElementById('room-id-display');
    const participantsGrid = document.getElementById('participants-grid');
    const remoteAudioContainer = document.getElementById('remote-audio-container');

    // --- Application State ---
    // Centralized state management makes the app's logic easier to follow.
    let localStream;    // The user's own microphone audio stream
    let localUserId;    // A unique ID for the local user
    let roomId;         // The ID of the room the user is in
    let isMuted = false;
    let peers = {};     // A map of connected peers. Key: peer's userId, Value: simple-peer instance

    // Establish a WebSocket connection for signaling.
    // It automatically uses wss:// on secure (https) connections.
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`);

    // --- Core Application Logic ---

    /**
     * Initializes the application by setting up listeners and checking the URL for a room ID.
     * This is the main entry point of the script.
     */
    const init = () => {
        // A unique ID for this user session.
        localUserId = `user-${Math.random().toString(36).substring(2, 9)}`;
        
        setupSocketListeners();
        setupUIListeners();
        checkForRoomIdInUrl();
    };

    /**
     * Sets up listeners for the UI elements like buttons.
     */
    const setupUIListeners = () => {
        createRoomBtn.addEventListener('click', createRoom);
        copyLinkBtn.addEventListener('click', copyInviteLink);
        muteBtn.addEventListener('click', toggleMute);
        disconnectBtn.addEventListener('click', () => window.location.href = '/'); // Simple disconnect: go home
    };

    /**
     * Sets up WebSocket event listeners for handling signaling messages from the server.
     */
    const setupSocketListeners = () => {
        socket.addEventListener('open', () => console.log("Signaling server connection established."));
        socket.addEventListener('error', (err) => console.error("Signaling server connection error:", err));
        socket.addEventListener('message', handleSignalingMessage);
    };

    /**
     * Routes incoming signaling messages to the appropriate handler function.
     * This is the central hub for all communication with the signaling server.
     * @param {MessageEvent} event - The message event from the WebSocket.
     */
    const handleSignalingMessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Signal received:', data.type, data.payload);

            switch (data.type) {
                case 'existing-users': // Received when you first join a room with others.
                    await startCall(data.payload);
                    break;
                case 'new-user': // Received when a new user joins the room you are in.
                    handleNewUser(data.payload.userId);
                    break;
                case 'signal': // Received when a peer sends WebRTC signaling data (offer/answer/candidate).
                    handleSignal(data.payload);
                    break;
                case 'user-left': // Received when a user disconnects from the room.
                    handleUserLeft(data.payload.userId);
                    break;
            }
        } catch (error) {
            console.error("Error processing signaling message:", error);
        }
    };
    
    /**
     * Gets access to the user's microphone. This is a prerequisite for starting a call.
     * @returns {Promise<void>}
     */
    const startLocalStream = async () => {
        try {
            // This promise will resolve with the audio stream if the user grants permission.
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            addParticipantCard(localUserId, true); // Add our own card to the UI.
        } catch(err) {
            console.error("Error accessing microphone:", err);
            // Inform the user gracefully instead of failing silently.
            statusEl.innerHTML = `
                <span class="text-red-400">Microphone access denied.</span><br>
                <small>Please allow microphone access in your browser settings to continue.</small>
            `;
            // Disable the entry button to prevent further actions.
            createRoomBtn.disabled = true;
        }
    };

    // --- Room & Call Lifecycle Functions ---

    /**
     * Handles the logic for creating a new room.
     */
    const createRoom = () => {
        // Generate a unique, human-readable room ID.
        roomId = `starlight-${Math.random().toString(36).substring(2, 9)}`;
        // Update the URL in the browser without reloading the page.
        window.history.pushState({}, '', `?room=${roomId}`);
        joinRoom(roomId);
    };
    
    /**
     * Checks if the page URL contains a room ID and attempts to join if it does.
     */
    const checkForRoomIdInUrl = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoomId = urlParams.get('room');
        if (urlRoomId) {
            statusEl.textContent = 'Joining room...';
            joinRoom(urlRoomId);
        }
    };

    /**
     * Joins a specified room by sending a message to the signaling server.
     * @param {string} targetRoomId - The ID of the room to join.
     */
    const joinRoom = (targetRoomId) => {
        roomId = targetRoomId;
        // Wait for the socket to be open before sending.
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'join-room', roomId, userId: localUserId }));
        } else {
            // If the socket is not yet open, wait for it.
            socket.addEventListener('open', () => {
                socket.send(JSON.stringify({ type: 'join-room', roomId, userId: localUserId }));
            }, { once: true });
        }
        
        // Transition the UI from the entry screen to the call screen.
        entryScreen.classList.add('hidden');
        callScreen.classList.remove('hidden');
        roomIdDisplay.textContent = roomId;
    };
    
    /**
     * The main function to initiate the call after joining a room.
     * It gets the local audio and then connects to all existing users.
     * @param {string[]} existingUsers - An array of user IDs already in the room.
     */
    const startCall = async (existingUsers) => {
        await startLocalStream();
        if (!localStream) return; // Exit if microphone access was denied.

        console.log(`Connecting to ${existingUsers.length} existing user(s)...`);
        // For each existing user, create a new peer connection. We are the "initiator".
        for (const userId of existingUsers) {
            const peer = createPeer(userId, true);
            peers[userId] = peer;
        }
    };

    // --- Peer-to-Peer Connection Handlers ---

    /**
     * Handles the 'new-user' signal by creating a non-initiator peer connection.
     * @param {string} userId - The ID of the new user who joined.
     */
    const handleNewUser = (userId) => {
        console.log(`New user joined: ${userId}. Creating peer connection.`);
        // We are not the initiator because the new user will send the first signal.
        const peer = createPeer(userId, false);
        peers[userId] = peer;
    };

    /**
     * Relays a signal from the signaling server to the correct local peer instance.
     * @param {{from: string, signal: any}} payload - The signal data and sender's ID.
     */
    const handleSignal = ({ from, signal }) => {
        const peer = peers[from];
        if (peer) {
            peer.signal(signal);
        } else {
            console.warn(`Received signal from unknown peer: ${from}`);
        }
    };

    /**
     * Cleans up the connection and UI elements for a user who has left.
     * @param {string} userId - The ID of the user who left.
     */
    const handleUserLeft = (userId) => {
        console.log(`User left: ${userId}`);
        const peer = peers[userId];
        if (peer) {
            peer.destroy(); // Gracefully close the connection.
            delete peers[userId];
        }
        // Remove the participant's card and audio element from the DOM.
        document.getElementById(`participant-${userId}`)?.remove();
        document.getElementById(`audio-${userId}`)?.remove();
    };

    /**
     * Creates and configures a new SimplePeer instance.
     * @param {string} targetUserId - The ID of the peer we want to connect to.
     * @param {boolean} initiator - Whether we are initiating the connection.
     * @returns {SimplePeer.Instance}
     */
    const createPeer = (targetUserId, initiator) => {
        console.log(`Creating peer for ${targetUserId}, initiator: ${initiator}`);
        const peer = new SimplePeer({
            initiator,
            stream: localStream,
            // Use a public TURN server for robust connectivity across different networks.
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }, // Google's public STUN server
                    { 
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ]
            }
        });

        // Event listener for when the peer wants to send signaling data.
        peer.on('signal', (signal) => {
            socket.send(JSON.stringify({
                type: 'signal',
                payload: { to: targetUserId, from: localUserId, signal }
            }));
        });

        // Event listener for when we receive the remote user's audio stream.
        peer.on('stream', (stream) => {
            console.log(`Received stream from ${targetUserId}`);
            addRemoteAudio(targetUserId, stream);
            addParticipantCard(targetUserId);
        });
        
        // Event listeners for connection status and cleanup.
        peer.on('connect', () => console.log(`Connection to ${targetUserId} established.`));
        peer.on('close', () => handleUserLeft(targetUserId));
        peer.on('error', (err) => {
            console.error(`Error with peer ${targetUserId}:`, err);
            handleUserLeft(targetUserId); // Clean up on error.
        });
        
        return peer;
    };


    // --- UI & Utility Functions ---

    /**
     * Copies the current room URL to the user's clipboard.
     */
    const copyInviteLink = () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
            copyLinkBtn.textContent = 'Copied!';
            setTimeout(() => {
                 copyLinkBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Copy Invite Link';
            }, 2000);
        });
    };
    
    /**
     * Creates and adds an <audio> element to the page for a remote user.
     * @param {string} userId - The ID of the remote user.
     * @param {MediaStream} stream - The user's audio stream.
     */
    const addRemoteAudio = (userId, stream) => {
        const audio = document.createElement('audio');
        audio.id = `audio-${userId}`;
        audio.srcObject = stream;
        audio.autoplay = true;
        remoteAudioContainer.appendChild(audio);
    };

    /**
     * Creates and adds a participant card to the UI grid.
     * @param {string} userId - The user's ID.
     * @param {boolean} isLocal - True if this is the local user's card.
     */
    const addParticipantCard = (userId, isLocal = false) => {
        // Prevent duplicate cards from being added.
        if (document.getElementById(`participant-${userId}`)) return;

        const card = document.createElement('div');
        card.id = `participant-${userId}`;
        card.className = 'participant-card';
        card.innerHTML = `
            <div class="w-10 h-10 rounded-full ${isLocal ? 'bg-green-500' : 'bg-indigo-500'} flex items-center justify-center">
                <i class="fas fa-user text-xl"></i>
            </div>
            <div>
                <p class="font-semibold">${isLocal ? 'You' : `Peer ${userId.substring(0, 4)}`}</p>
            </div>
        `;
        participantsGrid.appendChild(card);
    };
    
    /**
     * Toggles the local user's microphone on and off.
     */
    const toggleMute = () => {
        if (!localStream) return;
        isMuted = !isMuted;
        localStream.getAudioTracks()[0].enabled = !isMuted; // Enable/disable the audio track.
        
        // Update the UI to reflect the new mute state.
        muteBtn.classList.toggle('active', !isMuted);
        muteBtn.classList.toggle('inactive', isMuted);
        muteBtn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    };

    // --- Application Entry Point ---
    init();
});
