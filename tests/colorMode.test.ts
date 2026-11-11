import assert from "node:assert/strict";
import { test } from "node:test";
import { applyColorMode, parseColorMode, readColorMode, resolveColorMode } from "../src/lib/colorMode.ts";
test("theme preference rejects invalid or old visual-style values", () => {
  for (const value of [null, "", "terminal", "heritage", "carbon", "unknown"]) assert.equal(parseColorMode(value), "system");
  assert.equal(parseColorMode("dark"), "dark"); assert.equal(parseColorMode("light"), "light");
});
test("system preference resolves both ways; explicit choices override the OS", () => {
  assert.equal(resolveColorMode("system", true), "dark"); assert.equal(resolveColorMode("system", false), "light");
  for (const os of [true, false]) { assert.equal(resolveColorMode("dark", os), "dark"); assert.equal(resolveColorMode("light", os), "light"); }
});
test("storage failures fall back to system and DOM color-scheme follows the resolved theme", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { getItem() { throw new Error("storage disabled"); } }, matchMedia() { return { matches: true }; } } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: root } });
  try {
    assert.equal(readColorMode(), "system"); applyColorMode("system"); assert.equal(root.dataset.colorMode, "dark"); assert.equal(root.style.colorScheme, "dark");
    applyColorMode("light", true); assert.equal(root.dataset.colorMode, "light"); assert.equal(root.style.colorScheme, "light");
    applyColorMode("dark", false); assert.equal(root.dataset.colorMode, "dark");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
test("global listener follows OS changes only in system mode and cleans up", async () => {
  const { initializeColorMode, setColorMode, getColorMode, subscribeColorMode, COLOR_MODE_KEY } = await import("../src/lib/colorMode.ts");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const media = Object.assign(new EventTarget(), { matches: false });
  const data = new Map<string, string>();
  const fakeWindow = Object.assign(new EventTarget(), { localStorage: { getItem(key: string) { return data.get(key) ?? null; }, setItem(key: string, value: string) { data.set(key, value); } }, matchMedia() { return media; } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: root } });
  const cleanup = initializeColorMode(); let notifications = 0; const unsubscribe = subscribeColorMode(() => notifications++);
  try {
    assert.equal(root.dataset.colorMode, "light"); media.matches = true; media.dispatchEvent(new Event("change")); assert.equal(root.dataset.colorMode, "dark");
    setColorMode("light"); media.dispatchEvent(new Event("change")); assert.equal(root.dataset.colorMode, "light"); assert.equal(data.get(COLOR_MODE_KEY), "light"); assert.equal(notifications, 1);
    setColorMode("system"); assert.equal(root.dataset.colorMode, "dark");
    const storageEvent = Object.assign(new Event("storage"), { key: COLOR_MODE_KEY, newValue: "light" }); fakeWindow.dispatchEvent(storageEvent); assert.equal(getColorMode(), "light"); assert.equal(root.dataset.colorMode, "light");
    cleanup(); media.matches = false; root.dataset.colorMode = "unchanged"; media.dispatchEvent(new Event("change")); assert.equal(root.dataset.colorMode, "unchanged");
  } finally {
    unsubscribe(); cleanup();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
  }
});
