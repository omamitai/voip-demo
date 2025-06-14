// --- src/App.tsx ---
import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import Participant from './components/Participant';
import Peer from 'simple-peer';

const App = () => {
  const { localStream, peers, setLocalStream, addPeer, removePeer } = useStore();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userId] = useState(`user_${Math.random().toString(36).substr(2, 9)}`);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket server
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket.current = new WebSocket(`${wsProtocol}//${window.location.host}`);
    
    socket.current.onopen = () => {
      console.log('Connected to signaling server');
      // Check for room ID in URL on load
      const urlParams = new URLSearchParams(window.location.search);
      const roomIdFromUrl = urlParams.get('room');
      if (roomIdFromUrl) {
        handleJoinRoom(roomIdFromUrl);
      }
    };

    socket.current.onmessage = (message) => {
      const data = JSON.parse(message.data);
      handleSignalingMessage(data);
    };

    return () => {
      socket.current?.close();
    };
  }, []);

  const handleSignalingMessage = (data: any) => {
    switch (data.type) {
      case 'existing-users':
        data.payload.forEach((peerId: string) => connectToPeer(peerId, true));
        break;
      case 'new-user':
        connectToPeer(data.payload.userId, false);
        break;
      case 'signal':
        const peer = Object.values(peers).find(p => p.peer.id === data.payload.from);
        if (peer) {
            peer.peer.signal(data.payload.signal);
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
        roomId,
        userId,
        payload: { to: peerId, from: userId, signal },
      }));
    });

    peer.on('stream', (stream) => {
      addPeer(peer, stream, peerId);
    });

    peer.on('close', () => removePeer(peerId));
    
  };
  
  const handleCreateRoom = async () => {
    const newRoomId = `room_${Math.random().toString(36).substr(2, 9)}`;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    setRoomId(newRoomId);
    window.history.pushState({}, '', `?room=${newRoomId}`);
    socket.current?.send(JSON.stringify({ type: 'join-room', roomId: newRoomId, userId }));
  };

  const handleJoinRoom = async (roomIdToJoin: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    setRoomId(roomIdToJoin);
    socket.current?.send(JSON.stringify({ type: 'join-room', roomId: roomIdToJoin, userId }));
  };


  return (
    <div className="bg-gray-900 min-h-screen text-white p-4">
      <h1 className="text-3xl font-bold text-center text-indigo-400">Starlight Pro</h1>
      {roomId && <p className="text-center mt-2">Room ID: {roomId}</p>}
      
      {!roomId && (
        <div className="flex justify-center mt-8">
          <button onClick={handleCreateRoom} className="bg-indigo-600 px-6 py-2 rounded-lg font-semibold">
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
