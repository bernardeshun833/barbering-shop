const DEVICE_ID_KEY = "barbershop.device_id";

/**
 * Stable per-tablet identifier, persisted in localStorage. It survives reloads
 * and app updates but not a factory reset or a cleared browser profile — which
 * is the intended behaviour: a device that comes back with a new id shows up
 * in the reconciliation report as a new device rather than silently inheriting
 * the old one's history.
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `tablet-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
