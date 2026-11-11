// Socket.IO event names shared by client and server.

export const C2S = {
  CREATE: 'room:create',
  JOIN: 'room:join',
  LEAVE: 'room:leave',
  INPUT: 'input',
  SERVE: 'serve',
  START: 'host:start',
  RESTART: 'host:restart',
  ADD_BOT: 'host:addBot',
  REMOVE_BOT: 'host:removeBot',
  CAMERA: 'member:camera',
};

export const S2C = {
  JOINED: 'room:joined',
  STATE: 'room:state',
  ERROR: 'room:error',
  SNAPSHOT: 'snapshot',
  EVENT: 'game:event',
};

export const PHASE = {
  LOBBY: 'lobby',
  SERVE: 'serve',
  PLAY: 'play',
  POINT: 'point',
  SWAP: 'swap',
  OVER: 'over',
};

export const EVENT = {
  SIP: 'sip',
  DOWNED: 'downed',
  FINISHED: 'finished',
  ELIMINATED: 'eliminated',
  RALLY: 'rally',
  SWAP: 'swap',
  MATCH_OVER: 'matchOver',
  SERVE: 'serve',
};

// Short codes used inside snapshots for per-tick sound/visual cues.
export const CUE = {
  HIT: 'h',
  BOUNCE: 'b',
  NET: 'n',
  GLASS: 'g',
  IN: 'i',
};
