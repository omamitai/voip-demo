// --- File: src/components/Participant.tsx ---
import { useRef, useEffect } from 'react';

// Note: simple-peer uses the global MediaStream, no import needed for type.
interface ParticipantProps {
  stream: MediaStream;
  isLocal?: boolean;
}

const Participant = ({ stream, isLocal = false }: ParticipantProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden relative shadow-lg">
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className="w-full h-full object-cover" />
      {isLocal && <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded text-sm">You</div>}
    </div>
  );
};
export default Participant;
