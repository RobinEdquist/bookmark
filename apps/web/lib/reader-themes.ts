import type { FoliateView } from "./foliate-js/foliate-view";
import type { ReaderSettings } from "./use-reader-settings";

export interface ReaderTheme {
  bg: string;
  fg: string;
  link: string;
  isDark: boolean;
}

export const readerThemes = {
  light: { bg: "#ffffff", fg: "#1a1a1a", link: "#2563eb", isDark: false },
  sepia: { bg: "#f4ecd8", fg: "#5b4636", link: "#8a5a2b", isDark: false },
  dark: { bg: "#1a1a1a", fg: "#d4d4d4", link: "#60a5fa", isDark: true },
  // True black for OLED panels - pure #000 background with a slightly
  // dimmed foreground to avoid halation against the black.
  black: { bg: "#000000", fg: "#c9c9c9", link: "#60a5fa", isDark: true },
} as const satisfies Record<string, ReaderTheme>;

export type ReaderThemeName = keyof typeof readerThemes;

const FONT_STACKS = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: "ui-sans-serif, system-ui, sans-serif",
} as const;

/**
 * CSS injected into the book's content documents (inside foliate-js's
 * sandboxed iframe). Uses !important to win over publisher styles.
 */
export function getFoliateCSS(settings: ReaderSettings): string {
  const theme = readerThemes[settings.theme];
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
      color-scheme: ${theme.isDark ? "dark" : "light"};
      font-size: ${settings.fontSize}%;
    }
    html, body {
      background: ${theme.bg} !important;
      color: ${theme.fg} !important;
    }
    body, p, li, blockquote, dd {
      font-family: ${FONT_STACKS[settings.fontFamily]} !important;
    }
    p, li, blockquote, dd {
      line-height: ${settings.lineHeight} !important;
    }
    a:any-link {
      color: ${theme.link} !important;
    }
    img, svg, video {
      max-width: 100%;
    }
  `;
}

/** Apply layout attributes and content CSS to a <foliate-view>. */
export function applyReaderStyles(
  view: FoliateView,
  settings: ReaderSettings,
): void {
  view.renderer.setAttribute("flow", settings.flow);
  view.renderer.setAttribute("gap", `${settings.margin}%`);
  view.renderer.setAttribute("max-column-count", "2");
  view.renderer.setStyles?.(getFoliateCSS(settings));
}
