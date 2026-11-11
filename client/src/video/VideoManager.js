import {
  Room,
  RoomEvent,
  Track,
  VideoPreset,
  VideoQuality,
  createLocalVideoTrack,
} from 'livekit-client';

const PLAYER_CAPTURE = { width: 320, height: 240, frameRate: 15 };
const SPECTATOR_CAPTURE = { width: 160, height: 160, frameRate: 12 };

/**
 * Face video over LiveKit. Video only (no audio). Each participant's identity is
 * their game member id, so the game state decides where each face is drawn.
 */
export class VideoManager {
  constructor(sink) {
    this.sink = sink;
    this.room = null;
    this.localTrack = null;
    this.localPreview = null;
    this.remote = new Map();
    this.listeners = new Set();
    this.role = 'spectator';
    this.connectingFor = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  get cameraOn() {
    return !!this.localTrack;
  }

  async startCamera() {
    if (this.localTrack) return this.localTrack;
    const capture = this.role === 'player' ? PLAYER_CAPTURE : SPECTATOR_CAPTURE;
    this.localTrack = await createLocalVideoTrack({
      facingMode: 'user',
      resolution: { width: capture.width, height: capture.height, frameRate: capture.frameRate },
    });
    this.localPreview = this.localTrack.attach();
    this.localPreview.muted = true;
    this.localPreview.playsInline = true;
    if (this.room?.state === 'connected') await this.publish();
    this.emit();
    return this.localTrack;
  }

  async stopCamera() {
    if (!this.localTrack) return;
    if (this.room?.state === 'connected') {
      await this.room.localParticipant.unpublishTrack(this.localTrack).catch(() => {});
    }
    this.localTrack.detach();
    this.localTrack.stop();
    this.localTrack = null;
    this.localPreview = null;
    this.emit();
  }

  async publish() {
    if (!this.localTrack || !this.room) return;
    const already = [...this.room.localParticipant.trackPublications.values()]
      .some((pub) => pub.track === this.localTrack);
    if (already) return;
    await this.room.localParticipant.publishTrack(this.localTrack, {
      source: Track.Source.Camera,
      simulcast: true,
      videoEncoding: { maxBitrate: 180_000, maxFramerate: 15 },
      videoSimulcastLayers: [new VideoPreset(160, 120, 60_000, 12)],
    });
  }

  /** Spectators send a smaller picture; players send the larger one. */
  async setRole(role) {
    if (role === this.role) return;
    this.role = role;
    const capture = role === 'player' ? PLAYER_CAPTURE : SPECTATOR_CAPTURE;
    await this.localTrack?.mediaStreamTrack
      .applyConstraints({ width: capture.width, height: capture.height, frameRate: capture.frameRate })
      .catch(() => {});
  }

  async connect(roomKey, getToken) {
    if (this.connectingFor === roomKey) return;
    await this.disconnect();
    this.connectingFor = roomKey;
    const { url, token } = await getToken();

    // Videos are drawn into WebGL textures rather than visible <video> tags, so
    // element-based adaptive streaming can't see them. Quality is chosen per face
    // with setQuality() instead, and dynacast stops layers nobody receives.
    const room = new Room({ adaptiveStream: false, dynacast: true });
    this.room = room;

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== Track.Kind.Video) return;
      const el = track.attach();
      el.muted = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      this.sink.appendChild(el);
      this.remote.get(participant.identity)?.el.remove();
      this.remote.set(participant.identity, { track, publication, el });
      this.emit();
    });
    const drop = (identity) => {
      const entry = this.remote.get(identity);
      if (!entry) return;
      entry.track.detach(entry.el);
      entry.el.remove();
      this.remote.delete(identity);
      this.emit();
    };
    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => drop(participant.identity));
    room.on(RoomEvent.ParticipantDisconnected, (participant) => drop(participant.identity));
    room.on(RoomEvent.Disconnected, () => {
      for (const id of [...this.remote.keys()]) drop(id);
    });

    await room.connect(url, token, { autoSubscribe: true });
    await this.publish();
    this.emit();
  }

  async disconnect() {
    this.connectingFor = null;
    if (!this.room) return;
    const room = this.room;
    this.room = null;
    await room.disconnect().catch(() => {});
  }

  video(memberId) {
    return this.remote.get(memberId)?.el || null;
  }

  stream(memberId) {
    return this.remote.get(memberId)?.track.mediaStream || null;
  }

  /** High quality for faces at the table, the small layer for faces in the stands. */
  setQuality(memberId, high) {
    const entry = this.remote.get(memberId);
    if (!entry || entry.high === high) return;
    entry.high = high;
    entry.publication.setVideoQuality(high ? VideoQuality.HIGH : VideoQuality.LOW);
  }
}
