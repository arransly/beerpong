const ID_KEY = 'bptt.playerId';
const NAME_KEY = 'bptt.name';

function randomId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Per-tab id (sessionStorage) so two tabs on one machine count as two players,
// while a refresh keeps your seat during the reconnect grace period.
export function playerId() {
  let id = sessionStorage.getItem(ID_KEY);
  if (!id) {
    id = randomId();
    sessionStorage.setItem(ID_KEY, id);
  }
  return id;
}

export const savedName = () => localStorage.getItem(NAME_KEY) || '';
export const saveName = (name) => localStorage.setItem(NAME_KEY, name);
