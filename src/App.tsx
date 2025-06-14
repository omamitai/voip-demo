// --- File: src/App.tsx ---
import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import Participant from './components/Participant';
import Peer from 'simple-peer';

const App = () => {
  const { localStream, peers, setLocalStream, addPeer, removePeer } = useStore();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  const socket = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // This effect runs only once to establish the WebSocket connection.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    socket.current = new WebSocket(wsUrl);
    
    socket.current.onopen = () => {
      console.log('Successfully connected to signaling server');
      setIsConnected(true);
      
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

    socket.current.onclose = () => {
      console.log('Disconnected from signaling server');
      setIsConnected(false);
    };

    return () => {
      socket.current?.close();
    };
  }, []); // Empty dependency array ensures this runs only once.

  const handleSignalingMessage = (data: any) => {
    switch (data.type) {
      case 'existing-users':
        data.payload.forEach((peerId: string) => connectToPeer(peerId, true));
        break;
      case 'new-user':
        connectToPeer(data.payload.userId, false);
        break;
      case 'signal':
        // Find the peer by its ID and signal it.
        const peerToSignal = peers[data.payload.from];
        if(peerToSignal) {
          peerToSignal.peer.signal(data.payload.signal);
        }
        break;
      case 'user-left':
        removePeer(data.payload.userId);
        break;
    }
  };

  const connectToPeer = (peerId: string, initiator: boolean) => {
    if (!localStream) return;
    
    const peer = new Peer({ initiator, stream: localStream });

    peer.on('signal', (signal) => {
      socket.current?.send(JSON.stringify({
        type: 'signal',
        payload: { to: peerId, from: userId, signal },
      }));
    });

    peer.on('stream', (stream) => {
      addPeer(peer, stream, peerId);
    });

    peer.on('close', () => removePeer(peerId));
  };
  
  const handleCreateRoom = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      const newRoomId = `room_${Math.random().toString(36).substr(2, 9)}`;
      setRoomId(newRoomId);
      window.history.pushState({}, '', `?room=${newRoomId}`);
      socket.current?.send(JSON.stringify({ type: 'join-room', roomId: newRoomId, userId }));
    } catch(err) {
      console.error("Error creating room:", err);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };

  const handleJoinRoom = async (roomIdToJoin: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setRoomId(roomIdToJoin);
      socket.current?.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin, userId }));
    } catch(err) {
      console.error("Error joining room:", err);
      alert("Could not access camera and microphone. Please check permissions.");
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white p-4">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-indigo-400">Starlight Pro</h1>
        <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full transition-colors ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>
      
      {roomId && <p className="text-center mt-2 text-gray-400">Room ID: <span className="font-mono text-indigo-300">{roomId}</span></p>}
      
      {!roomId && (
        <div className="flex justify-center mt-8">
          <button onClick={handleCreateRoom} className="bg-indigo-600 px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
            Create Room
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        {localStream && <Participant stream={localStream} isLocal />}
        {Object.entries(peers).map(([peerId, { stream }]) =>
          stream ? <Participant key={peerId} stream={stream} /> : null
        )}
      </div>
    </div>
  );
};
export default App;
