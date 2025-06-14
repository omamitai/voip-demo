// client.js (v4 - AI Integration)
// Final, robust, and AI-powered frontend for Starlight Calls

class StarlightApp {
    constructor() {
        this.dom = {
            screens: { entry: document.getElementById('entry-screen'), lobby: document.getElementById('lobby-screen'), call: document.getElementById('call-screen') },
            buttons: { createRoom: document.getElementById('create-room-btn'), joinCall: document.getElementById('join-call-btn'), copyLink: document.getElementById('copy-link-btn'), mute: document.getElementById('mute-btn'), summarize: document.getElementById('summarize-btn'), disconnect: document.getElementById('disconnect-btn'), closeSummary: document.getElementById('close-summary-btn') },
            displays: { entryStatus: document.getElementById('entry-status'), roomId: document.getElementById('room-id-display'), lobbyMicFill: document.getElementById('lobby-mic-level-fill'), participantsGrid: document.getElementById('participants-grid'), remoteAudioContainer: document.getElementById('remote-audio-container'), summaryModal: document.getElementById('summary-modal'), summaryContent: document.getElementById('summary-content') }
        };
        this.state = { localStream: null, localUserId: `user-${Math.random().toString(36).substring(2, 9)}`, roomId: null, isMuted: false, peers: {}, localAudioAnalyzer: null, speechRecognition: null, transcript: {} };
        this.socket = null;
        this.audioContext = null;
    }

    init() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.setupUIListeners();
        this.connectSignalingServer();
        this.checkForRoomIdInUrl();
    }

    connectSignalingServer() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = new WebSocket(`${wsProtocol}//${window.location.host}`);
        this.socket.addEventListener('open', () => console.log("Signaling server connection established."));
        this.socket.addEventListener('error', (err) => console.error("Signaling server connection error:", err));
        this.socket.addEventListener('message', this.handleSignalingMessage.bind(this));
    }
    
    setupUIListeners() {
        this.dom.buttons.createRoom.addEventListener('click', () => this.createRoom());
        this.dom.buttons.joinCall.addEventListener('click', () => this.joinCall());
        this.dom.buttons.copyLink.addEventListener('click', () => this.copyInviteLink());
        this.dom.buttons.mute.addEventListener('click', () => this.toggleMute());
        this.dom.buttons.disconnect.addEventListener('click', () => this.hangUp());
        this.dom.buttons.summarize.addEventListener('click', () => this.summarizeConversation());
        this.dom.buttons.closeSummary.addEventListener('click', () => this.toggleSummaryModal(false));
    }

    showScreen(screenName) {
        Object.values(this.dom.screens).forEach(screen => screen.classList.remove('active'));
        this.dom.screens[screenName].classList.add('active');
    }

    checkForRoomIdInUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        this.state.roomId = urlParams.get('room');
        if (this.state.roomId) {
            this.dom.displays.entryStatus.textContent = 'Joining room...';
            this.prepareToJoin();
        }
    }
    
    createRoom() {
        this.state.roomId = `starlight-${Math.random().toString(36).substring(2, 9)}`;
        window.history.pushState({}, '', `?room=${this.state.roomId}`);
        this.prepareToJoin();
    }

    async prepareToJoin() {
        this.dom.buttons.createRoom.disabled = true;
        this.dom.displays.entryStatus.textContent = "Checking microphone...";
        await this.startLocalStream();
        if (this.state.localStream) {
            this.showScreen('lobby');
            this.setupLocalAudioVisualizer();
        }
    }

    joinCall() {
        this.socket.send(JSON.stringify({ type: 'join-room', roomId: this.state.roomId, userId: this.state.localUserId }));
        this.showScreen('call');
        this.dom.displays.roomId.textContent = this.state.roomId;
        this.addParticipantCard(this.state.localUserId, true);
        this.startTranscription();
    }
    
    handleSignalingMessage(event) {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'existing-users': data.payload.forEach(userId => this.createPeer(userId, true)); break;
            case 'new-user': this.createPeer(data.payload.userId, false); break;
            case 'signal': this.state.peers[data.payload.from]?.peer.signal(data.payload.signal); break;
            case 'user-left': this.handleUserLeft(data.payload.userId); break;
            case 'transcript-chunk': this.handleTranscriptChunk(data.payload); break;
        }
    }

    async startLocalStream() {
        try {
            this.state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err) {
            this.dom.displays.entryStatus.innerHTML = `<span class="text-red-400">Microphone access denied.</span><br><small>Please allow microphone access in your browser settings.</small>`;
            this.dom.buttons.createRoom.disabled = true;
        }
    }

    createPeer(targetUserId, initiator) {
        const peer = new SimplePeer({
            initiator, stream: this.state.localStream,
            config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }, { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }] }
        });
        peer.on('signal', signal => this.socket.send(JSON.stringify({ type: 'signal', payload: { to: targetUserId, from: this.state.localUserId, signal } })));
        peer.on('stream', stream => this.addParticipant(targetUserId, stream));
        peer.on('close', () => this.handleUserLeft(targetUserId));
        peer.on('error', err => { console.error(`Error with peer ${targetUserId}:`, err); this.handleUserLeft(targetUserId); });
        this.state.peers[targetUserId] = { peer };
    }

    handleUserLeft(userId) {
        if (!this.state.peers[userId]) return;
        this.state.peers[userId].peer.destroy();
        delete this.state.peers[userId];
        delete this.state.transcript[userId];
        document.getElementById(`participant-${userId}`)?.remove();
        document.getElementById(`audio-${userId}`)?.remove();
    }
    
    hangUp() {
        Object.values(this.state.peers).forEach(({ peer }) => peer.destroy());
        this.state.peers = {};
        this.state.localStream?.getTracks().forEach(track => track.stop());
        this.state.localStream = null;
        this.state.speechRecognition?.stop();
        if (this.state.localAudioAnalyzer) cancelAnimationFrame(this.state.localAudioAnalyzer.rafId);
        this.dom.displays.participantsGrid.innerHTML = '';
        this.dom.displays.remoteAudioContainer.innerHTML = '';
        this.state.isMuted = false;
        this.dom.buttons.mute.classList.add('active'); this.dom.buttons.mute.classList.remove('inactive');
        this.dom.buttons.mute.innerHTML = '<i class="fas fa-microphone"></i>';
        this.showScreen('entry');
        window.history.pushState({}, '', '/');
    }

    addParticipant(userId, stream) {
        const audio = document.createElement('audio');
        audio.id = `audio-${userId}`; audio.srcObject = stream; audio.autoplay = true;
        this.dom.displays.remoteAudioContainer.appendChild(audio);
        this.addParticipantCard(userId);
        this.state.peers[userId].audioAnalyzer = this.createAudioVisualizer(stream, `participant-${userId}`);
    }
    
    addParticipantCard(userId, isLocal = false) {
        if (document.getElementById(`participant-${userId}`)) return;
        const card = document.createElement('div');
        card.id = `participant-${userId}`; card.className = 'participant-card';
        card.innerHTML = `<div class="w-10 h-10 rounded-full ${isLocal ? 'bg-green-500' : 'bg-indigo-500'} flex items-center justify-center"><i class="fas ${isLocal ? 'fa-user' : 'fa-user-astronaut'} text-xl"></i></div><div><p class="font-semibold">${isLocal ? 'You' : `Peer ${userId.substring(0, 4)}`}</p></div>`;
        this.dom.displays.participantsGrid.appendChild(card);
    }

    copyInviteLink() { navigator.clipboard.writeText(window.location.href).then(() => { this.dom.buttons.copyLink.textContent = 'Copied!'; setTimeout(() => { this.dom.buttons.copyLink.innerHTML = '<i class="fas fa-copy mr-2"></i>Copy Invite Link'; }, 2000); }); }
    toggleMute() { if (!this.state.localStream) return; this.state.isMuted = !this.state.isMuted; this.state.localStream.getAudioTracks()[0].enabled = !this.state.isMuted; this.dom.buttons.mute.classList.toggle('active', !this.state.isMuted); this.dom.buttons.mute.classList.toggle('inactive', this.state.isMuted); this.dom.buttons.mute.innerHTML = this.state.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>'; }
    setupLocalAudioVisualizer() { this.state.localAudioAnalyzer = this.createAudioVisualizer(this.state.localStream, null, volume => { this.dom.displays.lobbyMicFill.style.width = `${volume}%`; }); }
    createAudioVisualizer(stream, cardId, onVolumeChange = null) { if (!this.audioContext || stream.getAudioTracks().length === 0) return null; const source = this.audioContext.createMediaStreamSource(stream); const analyser = this.audioContext.createAnalyser(); analyser.fftSize = 512; analyser.minDecibels = -100; analyser.maxDecibels = -10; analyser.smoothingTimeConstant = 0.85; source.connect(analyser); const dataArray = new Uint8Array(analyser.frequencyBinCount); const cardElement = cardId ? document.getElementById(cardId) : null; let rafId; const loop = () => { rafId = requestAnimationFrame(loop); analyser.getByteFrequencyData(dataArray); let average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length; if (cardElement) cardElement.classList.toggle('speaking', average > 10); if (onVolumeChange) onVolumeChange(Math.min(100, average * 2)); }; rafId = requestAnimationFrame(loop); return { rafId, source, analyser }; }

    // --- AI & Transcription Features ---

    startTranscription() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { console.warn("Speech Recognition not supported."); return; }
        this.state.speechRecognition = new SpeechRecognition();
        this.state.speechRecognition.continuous = true;
        this.state.speechRecognition.interimResults = true;
        this.state.speechRecognition.lang = 'en-US';

        this.state.speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript) {
                this.socket.send(JSON.stringify({ type: 'transcript-chunk', payload: { from: this.state.localUserId, text: finalTranscript.trim() + '. ' } }));
            }
        };

        this.state.speechRecognition.onend = () => {
            // Restart recognition if we are still in a call
            if (this.state.localStream) {
                this.state.speechRecognition.start();
            }
        };
        
        this.state.speechRecognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
        };

        this.state.speechRecognition.start();
    }

    handleTranscriptChunk({ from, text }) {
        if (!this.state.transcript[from]) {
            this.state.transcript[from] = '';
        }
        this.state.transcript[from] += text;
        console.log(`Transcript from ${from}:`, text);
    }
    
    async summarizeConversation() {
        this.toggleSummaryModal(true, true); // Show modal in loading state

        const fullTranscript = Object.entries(this.state.transcript)
            .map(([userId, text]) => `User ${userId.substring(0, 4)}: ${text}`)
            .join('\n');

        if (fullTranscript.trim().length < 20) {
            this.dom.displays.summaryContent.innerHTML = `<p>Not enough conversation to summarize yet.</p>`;
            return;
        }

        const prompt = `Please provide a concise summary of the following conversation. Use bullet points for key topics and action items if any are mentioned:\n\n${fullTranscript}`;
        
        try {
            const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
            const payload = { contents: chatHistory };
            const apiKey = ""; // API key will be provided by the environment
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0) {
                const summaryText = result.candidates[0].content.parts[0].text;
                // Basic markdown to HTML conversion
                const formattedSummary = summaryText
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<li>$1</li>')
                    .replace(/\n/g, '<br>');
                this.dom.displays.summaryContent.innerHTML = formattedSummary;
            } else {
                throw new Error("No summary content received from API.");
            }
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            this.dom.displays.summaryContent.innerHTML = `<p class="text-red-400">Could not generate summary. Please try again later.</p>`;
        }
    }
    
    toggleSummaryModal(show, isLoading = false) {
        if (show) {
            this.dom.displays.summaryModal.classList.remove('hidden');
            setTimeout(() => this.dom.displays.summaryModal.classList.remove('opacity-0'), 10);
            if (isLoading) {
                this.dom.displays.summaryContent.innerHTML = `<div class="flex items-center justify-center p-8"><i class="fas fa-spinner fa-spin text-3xl text-purple-400"></i><p class="ml-4">Generating summary...</p></div>`;
            }
        } else {
            this.dom.displays.summaryModal.classList.add('opacity-0');
            setTimeout(() => this.dom.displays.summaryModal.classList.add('hidden'), 200);
        }
    }
}

window.addEventListener('load', () => {
    new StarlightApp().init();
});
