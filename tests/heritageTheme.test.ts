import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const css = readFileSync(new URL("../src/atelier.css", import.meta.url), "utf8");
const webNginxConfig = readFileSync(new URL("../deploy/web-nginx.conf", import.meta.url), "utf8");
function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels.reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05); }
test("both themes provide readable text, status tags, placeholders and primary buttons", () => {
  const blocks = Array.from(css.matchAll(/:root(?:\[data-color-mode="dark"\])?\{([^}]+)\}/g)).map(match => Object.fromEntries(Array.from(match[1].matchAll(/--([\w-]+):(#[\da-f]{6})/g)).map(item => [item[1], item[2]]))).filter(tokens => tokens.paper);
  assert.equal(blocks.length, 2);
  for (const tokens of blocks) {
    for (const [text, background] of [["ink", "surface"], ["secondary", "surface"], ["muted", "paper"], ["muted", "inset"], ["on-accent", "bronze"], ["warning", "warning-bg"], ["danger", "danger-bg"], ["success", "success-bg"]]) {
      assert.ok(contrast(tokens[text], tokens[background]) >= 4.5, `${text}/${background} contrast too low: ${contrast(tokens[text], tokens[background])}`);
    }
  }
});
test("mobile business tables inherit the active theme instead of hardcoded dark rows", () => {
  assert.match(css, /\.responsive-table tr\{background:var\(--surface\);border-color:var\(--line\)/);
  assert.match(css, /\.responsive-table td::before\{color:var\(--secondary\)/);
});
test("web release does not keep stale frontend assets after a redeploy", () => {
  assert.match(webNginxConfig, /add_header\s+Cache-Control\s+"no-store"\s+always;/);
});

test("global theme scope preserves the browser rem baseline", () => { assert.match(css, /html\.atelier-theme\{font-size:16px\}/); });
