/**
 * Utility per la gestione delle Notifiche Web Push (PWA / Browser) in NetSentinel
 */

export interface WebPushSettings {
  enabled: boolean;
  notifyCritical: boolean;
  notifyWarning: boolean;
  notifyRecovery: boolean;
}

const STORAGE_KEY = 'netsentinel_web_push_settings';

export const DEFAULT_PUSH_SETTINGS: WebPushSettings = {
  enabled: false,
  notifyCritical: true,
  notifyWarning: true,
  notifyRecovery: true,
};

/**
 * Verifica se l'ambiente browser supporta le Notifiche Web
 */
export function isWebPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Restituisce lo stato attuale del permesso nel browser
 */
export function getPushPermission(): NotificationPermission {
  if (!isWebPushSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Legge le impostazioni push da localStorage
 */
export function getWebPushSettings(): WebPushSettings {
  if (typeof window === 'undefined') return DEFAULT_PUSH_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PUSH_SETTINGS;
    return { ...DEFAULT_PUSH_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PUSH_SETTINGS;
  }
}

/**
 * Salva le impostazioni push in localStorage
 */
export function saveWebPushSettings(settings: Partial<WebPushSettings>): WebPushSettings {
  const current = getWebPushSettings();
  const updated = { ...current, ...settings };
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Richiede esplicitamente l'autorizzazione alle notifiche al browser
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isWebPushSupported()) {
    throw new Error('Le notifiche push non sono supportate da questo browser.');
  }

  const result = await Notification.requestPermission();
  if (result === 'granted') {
    saveWebPushSettings({ enabled: true });
  } else if (result === 'denied') {
    saveWebPushSettings({ enabled: false });
  }
  return result;
}

/**
 * Invia una notifica nativa al browser / PWA
 */
export async function sendWebPushNotification(title: string, options?: NotificationOptions): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const defaultOptions: NotificationOptions & { renotify?: boolean } = {
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'netsentinel-alert',
    renotify: true,
    ...options,
  };

  try {
    // Prova prima tramite Service Worker se attivo (PWA in background)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.active) {
          await reg.showNotification(title, defaultOptions);
          return true;
        }
      } catch (swErr) {
        // Fallback a Notification classica
      }
    }

    new Notification(title, defaultOptions);
    return true;
  } catch (err) {
    console.warn('Errore invio notifica push:', err);
    return false;
  }
}

/**
 * Invia una notifica di test istantanea
 */
export async function sendTestWebPush(): Promise<boolean> {
  return sendWebPushNotification('NetSentinel — Notifica di Prova', {
    body: 'Le notifiche push sono configurate correttamente e attive sul tuo dispositivo!',
    tag: 'netsentinel-test-' + Date.now(),
  });
}
