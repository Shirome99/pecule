// Rappel quotidien (téléphone) : une notification locale, programmée sur l'appareil, sans serveur ni réseau.
import { isNative } from './native';

const KEY = 'pecule_reminder';
const ID = 1;
export const OPEN_NEW_TX = 'pecule:new-tx';

export type Reminder = { enabled: boolean; hour: number };

export function getReminder(): Reminder {
  try { return { enabled: false, hour: 20, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; }
  catch { return { enabled: false, hour: 20 }; }
}

/** Active ou coupe le rappel ; renvoie false si l'utilisateur refuse les notifications. */
export async function setReminder(r: Reminder): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: [{ id: ID }] }).catch(() => {});
  if (r.enabled) {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: ID,
        title: 'Pécule',
        body: 'Des dépenses aujourd’hui ? Note-les en quelques secondes.',
        schedule: { on: { hour: r.hour, minute: 0 } },
      }],
    });
  }
  localStorage.setItem(KEY, JSON.stringify(r));
  return true;
}

/** Toucher la notification ouvre directement « Nouvelle opération ». */
export async function listenReminderTap() {
  if (!isNative) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
    if (e.notification.id === ID) window.dispatchEvent(new Event(OPEN_NEW_TX));
  });
}
