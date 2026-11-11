# Beer Pong Table Tennis

Real-time 3D 2v2 table tennis with a pint in every corner. Hit an opponent's glass and they sip; land the ball in it and they down it and are out. The next person in the queue takes their corner. Waiting players spectate live, and everyone's front camera shows their face in their corner or in the stands.

- `client/`: Vite, Three.js, GSAP, Socket.IO client, LiveKit client
- `server/`: Node, Express, Socket.IO. Authoritative physics and rules at 60 Hz, snapshots at 30 Hz.
- `shared/`: constants and event names used by both

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Create a room, use **Add bot** to fill seats, then press **Start match**. To join from a phone on the same Wi-Fi, use the Network URL Vite prints. Phones only allow the camera over HTTPS, so for camera testing on a phone use a tunnel (for example `cloudflared tunnel --url http://localhost:5173`).

`npm test` runs the physics and room simulation tests.

## Face video (LiveKit)

1. Create a free project at https://cloud.livekit.io.
2. Copy `.env.example` to `server/.env` and fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
3. Restart the server. `/health` reports `"video": true`.

Without these, the game still works and everyone shows as initials.

## Deploy

The server also serves the built client, so one Node web service is enough.

**Render** (uses `render.yaml`): create a Blueprint from this repo, set the three LiveKit variables, then add `playbeerpong.online` as a custom domain and point your DNS at Render.

**Fly.io or a VPS** (uses `Dockerfile`):

```bash
docker build -t playbeerpong .
docker run -p 3001:3001 --env-file server/.env playbeerpong
```

Put it behind HTTPS (camera access requires it) with WebSocket support.

**Client hosted separately** (for example Vercel): build with `VITE_SERVER_URL=https://your-game-server` and set `CLIENT_ORIGIN=https://playbeerpong.online` on the server.
