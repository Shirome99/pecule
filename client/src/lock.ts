// Code de verrouillage de l'app (facultatif) : 4 chiffres, gardé sur l'appareil sous forme d'empreinte salée.
// Il protège l'ouverture de l'app (téléphone prêté, posé sur une table) ; il ne chiffre pas les données.
const KEY = 'pecule_pin';
/** Après ce délai en arrière-plan, l'app redemande le code. */
export const RELOCK_AFTER_MS = 30_000;

type Stored = { salt: string; hash: string };

function read(): Stored | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

async function digest(salt: string, pin: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const hasPin = () => !!read();

export async function setPin(pin: string) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(KEY, JSON.stringify({ salt, hash: await digest(salt, pin) }));
}

export function removePin() {
  localStorage.removeItem(KEY);
}

export async function checkPin(pin: string) {
  const stored = read();
  return !!stored && (await digest(stored.salt, pin)) === stored.hash;
}
