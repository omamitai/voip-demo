// --- File: src/App.tsx ---
import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from './store';
import Participant from './components/Participant';
import Peer from 'simple-peer';

const App = () => {
  const { localStream, peers, setLocalStream, addPeer, removePeer } = useStore();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  const socket = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const peersRef = useRef<typeof peers>({});

  // Keep peersRef in sync with peers state
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  // Create peer connection with proper error handling
  const connectToPeer = useCallback((peerId: string, initiator: boolean) => {
    if (!localStream) {
      console.error('No local stream available');
      return;
    }
    
    console.log(`Connecting to peer ${peerId} as ${initiator ? 'initiator' : 'receiver'}`);
    
    const peer = new Peer({ 
      initiator, 
      stream: localStream,
      trickle: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('signal', (signal) => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({
          type: 'signal',
          roomId: roomId,
          payload: { to: peerId, from: userId, signal },
        }));
      }
    });

    peer.on('stream', (stream) => {
      console.log(`Received stream from peer ${peerId}`);
      addPeer(peer, stream, peerId);
    });

    peer.on('error', (err) => {
      console.error(`Peer connection error with ${peerId}:`, err);
      removePeer(peerId);
    });

    peer.on('close', () => {
      console.log(`Peer connection closed with ${peerId}`);
      removePeer(peerId);
    });

    // Store the peer temporarily before stream is received
    if (!peersRef.current[peerId]) {
      addPeer(peer, localStream, peerId);
    }
  }, [localStream, roomId, userId, addPeer, removePeer]);

  const handleSignalingMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'existing-users':
        console.log('Existing users in room:', data.payload);
        data.payload.forEach((peerId: string) => connectToPeer(peerId, true));
        break;
      case 'new-user':
        console.log('New user joined:', data.payload.userId);
        connectToPeer(data.payload.userId, false);
        break;
      case 'signal':
        const peerToSignal = peersRef.current[data.payload.from];
        if (peerToSignal && peerToSignal.peer) {
          try {
            peerToSignal.peer.signal(data.payload.signal);
          } catch (err) {
            console.error('Error signaling peer:', err);
          }
        } else {
          console.warn(`No peer found for ${data.payload.from}`);
        }
        break;
      case 'user-left':
        console.log('User left:', data.payload.userId);
        removePeer(data.payload.userId);
        break;
    }
  }, [connectToPeer, removePeer]);

  useEffect(() => {
    const connectWebSocket = () => {
      setIsConnecting(true);
      
      // Determine WebSocket URL based on environment
      let wsUrl: string;
      if (import.meta.env.DEV) {
        // In development, connect directly to the server port
        wsUrl = 'ws://localhost:8080';
      } else {
        // In production, use the same host with appropriate protocol
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProtocol}//${window.location.host}`;
      }
      
      console.log('Connecting to WebSocket:', wsUrl);
      
      try {
        socket.current = new WebSocket(wsUrl);
        
        socket.current.onopen = () => {
          console.log('Successfully connected to signaling server');
          setIsConnected(true);
          setIsConnecting(false);
          
          // Check for room ID in URL
          const urlParams = new URLSearchParams(window.location.search);
          const roomIdFromUrl = urlParams.get('room');
          if (roomIdFromUrl) {
            handleJoinRoom(roomIdFromUrl);
          }
        };

        socket.current.onmessage = (message) => {
          try {
            const data = JSON.parse(message.data);
            handleSignalingMessage(data);
          } catch (error) {
            console.error("Failed to parse message from server", error);
          }
        };

        socket.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnecting(false);
        };

        socket.current.onclose = () => {
          console.log('Disconnected from signaling server');
          setIsConnected(false);
          setIsConnecting(false);
          
          // Attempt to reconnect after 3 seconds
          setTimeout(() => {
            if (!socket.current || socket.current.readyState === WebSocket.CLOSED) {
              console.log('Attempting to reconnect...');
              connectWebSocket();
            }
          }, 3000);
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setIsConnecting(false);
      }
    };

    connectWebSocket();

    return () => {
      if (socket.current) {
        socket.current.close();
        socket.current = null;
      }
    };
  }, []);

  // Update handleSignalingMessage when it changes
  useEffect(() => {
    if (socket.current) {
      socket.current.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data);
          handleSignalingMessage(data);
        } catch (error) {
          console.error("Failed to parse message from server", error);
        }
      };
    }
  }, [handleSignalingMessage]);
  
  const handleCreateRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      setLocalStream(stream);
      
      const newRoomId = `room_${Math.random().toString(36).substr(2, 9)}`;
      setRoomId(newRoomId);
      window.history.pushState({}, '', `?room=${newRoomId}`);
      
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({ type: 'join-room', roomId: newRoomId, userId }));
      } else {
        alert('Not connected to server. Please wait and try again.');
      }
    } catch(err) {
      console.error("Error creating room:", err);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };

  const handleJoinRoom = async (roomIdToJoin: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });
      setLocalStream(stream);
      setRoomId(roomIdToJoin);
      
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin, userId }));
      } else {
        alert('Not connected to server. Please wait and try again.');
      }
    } catch(err) {
      console.error("Error joining room:", err);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };

  const getConnectionStatus = () => {
    if (isConnecting) return { text: 'Connecting...', color: 'bg-yellow-500' };
    if (isConnected) return { text: 'Connected', color: 'bg-green-500' };
    return { text: 'Disconnected', color: 'bg-red-500' };
  };

  const status = getConnectionStatus();

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-indigo-400">Starlight Pro</h1>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full transition-colors ${status.color}`}></div>
          <span>{status.text}</span>
        </div>
      </header>
      
      {roomId && (
        <div className="text-center mt-2">
          <p className="text-gray-400">
            Room ID: <span className="font-mono text-indigo-300">{roomId}</span>
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Share this URL with others: {window.location.href}
          </p>
        </div>
      )}
      
      {!roomId && (
        <div className="flex justify-center mt-8">
          <button 
            onClick={handleCreateRoom} 
            disabled={!isConnected}
            className="bg-indigo-600 px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {isConnected ? 'Create Room' : 'Waiting for connection...'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {localStream && <Participant stream={localStream} isLocal />}
        {Object.entries(peers).map(([peerId, { stream }]) =>
          stream ? <Participant key={peerId} stream={stream} /> : null
        )}
      </div>
      
      {roomId && Object.keys(peers).length === 0 && (
        <div className="text-center mt-8 text-gray-400">
          <p>Waiting for others to join...</p>
          <p className="text-sm mt-2">Share the room URL above with participants</p>
        </div>
      )}
    </div>
  );
};

export default App;
