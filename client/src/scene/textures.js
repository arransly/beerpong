import * as THREE from 'three';

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function initials(name = '?') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || '?').slice(0, 2);
  return letters.toUpperCase();
}

export function avatarTexture(name, color) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, '#1b1114');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 104px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), w / 2, h / 2 + 6);
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function labelSprite(text, { width = 0.42, color = '#fff', bg = 'rgba(20,12,14,0.78)', accent } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, (width * canvas.height) / canvas.width, 1);

  sprite.setText = (value, opts = {}) => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '800 54px Inter, system-ui, sans-serif';
    const textW = Math.min(canvas.width - 16, ctx.measureText(value).width + 56);
    const x = (canvas.width - textW) / 2;
    roundRectPath(ctx, x, 8, textW, canvas.height - 16, 44);
    ctx.fillStyle = opts.bg || bg;
    ctx.fill();
    const stroke = opts.accent || accent;
    if (stroke) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
    ctx.fillStyle = opts.color || color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 40);
    texture.needsUpdate = true;
  };
  sprite.setText(text);
  return sprite;
}

export function videoTexture(video) {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

// Crop a texture like CSS object-fit: cover.
export function fitCover(texture, srcAspect, dstAspect) {
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  if (!srcAspect || !isFinite(srcAspect)) return;
  if (srcAspect > dstAspect) {
    texture.repeat.x = dstAspect / srcAspect;
    texture.offset.x = (1 - texture.repeat.x) / 2;
  } else {
    texture.repeat.y = srcAspect / dstAspect;
    texture.offset.y = (1 - texture.repeat.y) / 2;
  }
}

export function roundedRectGeometry(width, height, radius, segments = 8) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  const geometry = new THREE.ShapeGeometry(shape, segments);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - x) / width, (pos.getY(i) - y) / height);
  }
  uv.needsUpdate = true;
  return geometry;
}

// Video elements report their real size only after metadata loads.
export function whenVideoSized(video, cb) {
  const run = () => video.videoWidth && cb(video.videoWidth / video.videoHeight);
  run();
  video.addEventListener('loadedmetadata', run);
  video.addEventListener('resize', run);
  return () => {
    video.removeEventListener('loadedmetadata', run);
    video.removeEventListener('resize', run);
  };
}
