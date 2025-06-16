// --- File: src/App.tsx (Revised for two-user seamless pairing) ---
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from './store';
import Participant from './components/Participant';
import Peer from 'simple-peer';

type AppStatus = 'Initializing' | 'Searching' | 'Connecting' | 'Connected' | 'Error' | 'PartnerLeft';

const App = () => {
  const { localStream, peers, setLocalStream, addPeer, removePeer, removeAllPeers } = useStore();
  const [userId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  const socket = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<AppStatus>('Initializing');
  const peersRef = useRef<typeof peers>({});

  // Keep peersRef in sync with peers state from Zustand
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const connectToPeer = useCallback((peerId: string, initiator: boolean) => {
    if (!localStream) return;
    setStatus('Connecting');
    console.log(`Connecting to peer ${peerId} as ${initiator ? 'initiator' : 'receiver'}`);

    const peer = new Peer({ 
      initiator, 
      stream: localStream,
      trickle: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('signal', (signal) => {
      socket.current?.send(JSON.stringify({
        type: 'signal',
        payload: { to: peerId, from: userId, signal },
      }));
    });

    peer.on('stream', (stream) => {
      console.log(`Received stream from peer ${peerId}`);
      addPeer(peer, stream, peerId);
      setStatus('Connected');
    });
    
    peer.on('error', (err) => {
      console.error(`Peer connection error with ${peerId}:`, err);
      setStatus('Error');
      removePeer(peerId);
    });

    peer.on('close', () => {
      console.log(`Peer connection closed with ${peerId}`);
      setStatus('PartnerLeft');
      removePeer(peerId);
    });
    
    // Immediately add the peer instance to the store
    addPeer(peer, localStream, peerId);
  }, [localStream, userId, addPeer, removePeer]);

  const handleSignalingMessage = useCallback((data: any) => {
    const peerId = data.payload?.peerId || data.payload?.from;
    
    switch (data.type) {
      case 'wait':
        setStatus('Searching');
        break;
      case 'initiate-peer':
        console.log('Initiating peer connection with:', peerId);
        connectToPeer(peerId, true);
        break;
      case 'wait-for-peer':
        console.log('Waiting for peer connection from:', peerId);
        // We don't need to do anything, the 'signal' event will trigger the connection
        break;
      case 'signal':
        const peerToSignal = peersRef.current[peerId];
        if (peerToSignal && peerToSignal.peer) {
          peerToSignal.peer.signal(data.payload.signal);
        } else {
          // If peer doesn't exist, it means this is the offer signal from the initiator
          connectToPeer(peerId, false);
          // The signal will be queued by simple-peer and processed once the peer is created
          setTimeout(() => peersRef.current[peerId]?.peer.signal(data.payload.signal), 100);
        }
        break;
      case 'partner-left':
        console.log('Partner left the call:', data.payload.userId);
        setStatus('PartnerLeft');
        removePeer(data.payload.userId);
        break;
    }
  }, [connectToPeer, removePeer]);
  
  // Main effect to initialize the connection flow
  useEffect(() => {
    // 1. Get user media
    navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
      audio: { echoCancellation: true, noiseSuppression: true }
    }).then(stream => {
      setLocalStream(stream);

      // 2. Connect to WebSocket server
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      socket.current = new WebSocket(wsUrl);

      socket.current.onopen = () => {
        console.log('Connected to signaling server.');
        // 3. Announce readiness
        socket.current?.send(JSON.stringify({ type: 'user-ready', userId }));
      };

      socket.current.onmessage = (message) => {
        const data = JSON.parse(message.data);
        handleSignalingMessage(data);
      };

      socket.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('Error');
      };

      socket.current.onclose = () => {
        console.log('Disconnected from signaling server.');
        // If not intentionally disconnected, show an error.
        if (status !== 'PartnerLeft') {
          setStatus('Error');
        }
      };
    }).catch(err => {
      console.error("Failed to get user media:", err);
      setStatus('Error');
      alert("Could not access camera/microphone. Please check permissions and refresh.");
    });

    // Cleanup on unmount
    return () => {
      socket.current?.close();
      localStream?.getTracks().forEach(track => track.stop());
      removeAllPeers();
    };
  }, [userId, setLocalStream, removeAllPeers, handleSignalingMessage]);

  const getStatusMessage = () => {
    switch (status) {
      case 'Initializing': return 'Initializing, please wait...';
      case 'Searching': return 'Searching for a partner...';
      case 'Connecting': return 'Partner found! Connecting...';
      case 'Connected': return 'You are connected!';
      case 'PartnerLeft': return 'Your partner has left the call.';
      case 'Error': return 'A connection error occurred. Please refresh the page.';
      default: return '';
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4 flex flex-col">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-indigo-400">Starlight Pro (2-User)</h1>
        <div className="text-lg text-indigo-300 font-semibold">
          {getStatusMessage()}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 flex-grow">
        {localStream && <Participant stream={localStream} isLocal />}
        {Object.entries(peers).map(([peerId, { stream }]) =>
          stream ? <Participant key={peerId} stream={stream} /> : null
        )}
      </div>

      {(status === 'Searching' || status === 'PartnerLeft') && (
        <div className="flex-grow flex items-center justify-center">
            <div className="text-center text-gray-400">
                <p className="text-2xl">{status === 'Searching' ? 'Waiting for someone to join...' : 'You can close this window.'}</p>
                {status === 'Searching' && <p className="mt-2">Your video is on the left. Once someone joins, their video will appear on the right.</p>}
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
