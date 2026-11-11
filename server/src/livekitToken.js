import { AccessToken } from 'livekit-server-sdk';

const env = () => process.env;

export const livekitConfigured = () =>
  Boolean(env().LIVEKIT_URL && env().LIVEKIT_API_KEY && env().LIVEKIT_API_SECRET);

export const livekitRoomName = (code) => `bptt-${code}`;

/**
 * POST /livekit-token { code, playerId, socketId }
 * Only issues a token when that socket is the live connection for that member,
 * so a room code alone isn't enough to watch someone's camera.
 */
export function livekitTokenHandler(rooms) {
  return async (req, res) => {
    if (!livekitConfigured()) {
      return res.status(503).json({ error: 'Face video is not configured on this server.' });
    }
    const { code, playerId, socketId } = req.body || {};
    const room = typeof code === 'string' ? rooms.get(code.toUpperCase()) : null;
    const member = room?.members.get(playerId);
    if (!member || member.isBot || !member.connected || member.socketId !== socketId) {
      return res.status(403).json({ error: 'Not a member of this room.' });
    }

    const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env();
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: member.id,
      name: member.name,
      ttl: '4h',
    });
    token.addGrant({
      room: livekitRoomName(room.code),
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
    res.json({ url: LIVEKIT_URL, token: await token.toJwt() });
  };
}
