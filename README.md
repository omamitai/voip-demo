# Starlight Pro - Modern Video Calling Application

A robust, feature-rich video calling application built with React, WebRTC (simple-peer), and WebSocket signaling.

## Features

- 🎥 Real-time video and audio calling
- 👥 Multi-participant support
- 🔗 Simple room-based system with shareable URLs
- 🎨 Modern UI with Tailwind CSS
- 🔄 Automatic reconnection
- 📱 Responsive design

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd starlight-calls-react
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Development Mode

1. Start the signaling server:
```bash
npm run server
```

2. In a new terminal, start the Vite development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Production Build

1. Build the React application:
```bash
npm run build
```

2. Start the production server:
```bash
npm run server
```

3. Open your browser and navigate to `http://localhost:8080`

## Usage

1. Click "Create Room" to start a new video call
2. Share the generated URL with participants
3. Participants can join by opening the shared URL in their browser
4. Grant camera and microphone permissions when prompted

## Project Structure

```
starlight-calls-react/
├── src/
│   ├── components/
│   │   └── Participant.tsx    # Video participant component
│   ├── App.tsx                # Main application component
│   ├── store.ts               # Zustand state management
│   ├── main.tsx               # Application entry point
│   └── index.css              # Tailwind CSS styles
├── server.js                  # WebSocket signaling server
├── index.html                 # HTML template
├── package.json               # Project dependencies
├── vite.config.ts            # Vite configuration
├── tailwind.config.js        # Tailwind CSS configuration
├── postcss.config.js         # PostCSS configuration
└── tsconfig.json             # TypeScript configuration
```

## Technical Stack

- **Frontend**: React 18 with TypeScript
- **State Management**: Zustand
- **WebRTC**: simple-peer
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Backend**: Express + WebSocket (ws)

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers with WebRTC support

## Troubleshooting

### Connection Issues
- Ensure both the signaling server and development server are running
- Check that your firewall allows WebSocket connections
- For production deployment, ensure WebSocket connections are properly proxied

### Camera/Microphone Access
- Grant permissions when prompted by the browser
- Check browser settings if permissions were previously denied
- Some browsers require HTTPS for camera access in production

### Peer Connection Failures
- The application uses Google's public STUN servers
- For production use, consider adding TURN servers for better connectivity

## Deployment

For production deployment:

1. Build the application: `npm run build`
2. Deploy the `dist` folder and `server.js` to your hosting provider
3. Ensure WebSocket connections are supported and properly configured
4. Use HTTPS for secure connections and camera access

## License

MIT
