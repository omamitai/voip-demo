// --- File: src/store.ts (Zustand Store) ---
import create from 'zustand';
import Peer from 'simple-peer';

// Define the shape of a single peer's state
type PeerState = {
  [key: string]: {
    peer: Peer.Instance;
    stream?: MediaStream;
  };
};

// Define the shape of the entire application's global state
type AppState = {
  localStream: MediaStream | null;
  peers: PeerState;
  setLocalStream: (stream: MediaStream | null) => void;
  addPeer: (peer: Peer.Instance, stream: MediaStream, peerId: string) => void;
  removePeer: (peerId: string) => void;
};

export const useStore = create<AppState>((set) => ({
  localStream: null,
  peers: {},
  setLocalStream: (stream) => set({ localStream: stream }),
  addPeer: (peer, stream, peerId) =>
    set((state) => ({
      peers: {
        ...state.peers,
        [peerId]: { peer, stream },
      },
    })),
  removePeer: (peerId) =>
    set((state) => {
      const newPeers = { ...state.peers };
      if (newPeers[peerId]) {
        // Important: Cleanly destroy the peer connection
        newPeers[peerId].peer.destroy();
      }
      delete newPeers[peerId];
      return { peers: newPeers };
    }),
}));
