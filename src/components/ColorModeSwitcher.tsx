import { useSyncExternalStore } from "react";
import { Moon, Monitor, Sun } from "lucide-react";
import { getColorMode, setColorMode, subscribeColorMode } from "../lib/colorMode";
const options = [
  { value: "dark", label: "深色模式", Icon: Moon },
  { value: "system", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "浅色模式", Icon: Sun },
] as const;
export function ColorModeSwitcher() {
  const mode = useSyncExternalStore(subscribeColorMode, getColorMode, () => "system");
  return <fieldset className="color-mode-switcher"><legend className="sr-only">外观模式</legend>{options.map(({ value, label, Icon }) =>
    <label key={value} title={label} className={mode === value ? "selected" : ""}>
      <input className="sr-only" type="radio" name="color-mode" value={value} checked={mode === value} onChange={() => setColorMode(value)} aria-label={label} />
      <Icon size={18} aria-hidden="true" />
    </label>)}
  </fieldset>;
}
