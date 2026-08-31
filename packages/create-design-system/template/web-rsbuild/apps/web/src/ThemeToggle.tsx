import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import {
  colors,
  fonts,
  radius,
  spacing,
} from "{{scope}}/theme/tokens.stylex.ts";

/**
 * `system` leaves the choice to `prefers-color-scheme`; the other two pin it.
 * The pinned values are written to `document.documentElement.dataset.theme`,
 * which the generated stylesheet's `[data-theme="light"|"dark"]` blocks target.
 */
type Preference = "system" | "light" | "dark";

const PREFERENCES: readonly Preference[] = ["system", "light", "dark"];

const STORAGE_KEY = "theme";

function isPreference(value: unknown): value is Preference {
  return PREFERENCES.includes(value as Preference);
}

/**
 * `localStorage` throws rather than returning `null` when storage is denied
 * (Safari private browsing, blocked third-party contexts), so every access is
 * guarded and falls back to following the system.
 */
function readPreference(): Preference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function writePreference(preference: Preference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Persisting the choice is a convenience, never a requirement.
  }
}

const styles = stylex.create({
  group: {
    display: "inline-flex",
    gap: spacing[1],
    padding: spacing[1],
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderDefault,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSurface,
  },
  option: {
    borderWidth: 0,
    borderRadius: radius.pill,
    paddingBlock: spacing[1],
    paddingInline: spacing[3],
    backgroundColor: "transparent",
    color: colors.fgMuted,
    cursor: "pointer",
    fontFamily: fonts.familySans,
    fontSize: fonts.sizeSm,
    fontWeight: fonts.weightMedium,
  },
  selected: {
    backgroundColor: colors.brandDefault,
    color: colors.fgOnBrand,
  },
});

export function ThemeToggle() {
  const [preference, setPreference] = useState<Preference>(readPreference);

  useEffect(() => {
    const root = document.documentElement;

    if (preference === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = preference;
    }

    writePreference(preference);
  }, [preference]);

  return (
    <div role="group" aria-label="Theme" {...stylex.props(styles.group)}>
      {PREFERENCES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === preference}
          onClick={() => setPreference(option)}
          {...stylex.props(
            styles.option,
            option === preference && styles.selected,
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
