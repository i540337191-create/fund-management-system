export type ColorMode = "dark" | "system" | "light";
export const COLOR_MODE_KEY = "fund-management-color-mode";
const CHANGE_EVENT = "fund-management-color-mode-change";
let currentMode: ColorMode | null = null;
export function parseColorMode(value: string | null): ColorMode {
  return value === "dark" || value === "light" ? value : "system";
}
export function resolveColorMode(mode: ColorMode, systemDark: boolean): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}
export function readColorMode(): ColorMode {
  try { return parseColorMode(window.localStorage.getItem(COLOR_MODE_KEY)); } catch { return "system"; }
}
export function getColorMode(): ColorMode { return currentMode ?? readColorMode(); }
export function applyColorMode(mode: ColorMode, systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches) {
  const resolved = resolveColorMode(mode, systemDark);
  document.documentElement.dataset.colorMode = resolved;
  document.documentElement.style.colorScheme = resolved;
}
export function setColorMode(mode: ColorMode) {
  currentMode = mode;
  try { window.localStorage.setItem(COLOR_MODE_KEY, mode); } catch { /* Disabled storage must not prevent an in-session choice. */ }
  applyColorMode(mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeColorMode(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
export function initializeColorMode() {
  currentMode = readColorMode();
  applyColorMode(currentMode);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const syncSystem = () => applyColorMode(getColorMode(), media.matches);
  const syncStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_MODE_KEY && event.key !== null) return;
    currentMode = parseColorMode(event.newValue);
    applyColorMode(currentMode, media.matches);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  media.addEventListener("change", syncSystem);
  window.addEventListener("storage", syncStorage);
  return () => { media.removeEventListener("change", syncSystem); window.removeEventListener("storage", syncStorage); };
}
