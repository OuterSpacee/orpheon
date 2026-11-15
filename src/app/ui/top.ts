// The top of the page: the name and the three modes, nothing more.
import type { App } from "../app.ts";
import { el } from "../dom.ts";
import { MODES } from "../state.ts";
import type { Mode } from "../state.ts";

export function mountTop(app: App): HTMLElement {
  const { store } = app;
  const tabs = new Map<Mode, HTMLButtonElement>();
  const nav = el("nav.modes", { "aria-label": "Mode" });
  for (const mode of MODES) {
    const tab = el("button.mode", { type: "button", onclick: () => store.set({ mode: mode.id }) }, mode.name);
    tabs.set(mode.id, tab);
    nav.append(tab);
  }
  store.on(["mode"], (s) => tabs.forEach((tab, id) => (id === s.mode ? tab.setAttribute("aria-current", "page") : tab.removeAttribute("aria-current"))));
  return el("header.top.ui", {}, el("h1.name", {}, "Orpheon"), nav, sourceLink("mode.source"));
}

/** Where the source of this page is: the licence (AGPL-3.0) asks that everyone using it can get it. */
export const SOURCE_URL = "https://github.com/OuterSpacee/orpheon";

/** GitHub's mark (Octicons mark-github, MIT), drawn in the text's colour. */
const GITHUB_MARK =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

/**
 * A link to the source on GitHub, styled as `classes` ("mode.source" in the top bar, where a
 * phone shows only the mark; "action.source" in a phone's More sheet).
 */
export function sourceLink(classes: string): HTMLAnchorElement {
  const link = el(`a.${classes}` as "a", { href: SOURCE_URL, target: "_blank", rel: "noopener", title: "The source code, on GitHub", "aria-label": "Source code on GitHub" });
  link.innerHTML = `${GITHUB_MARK}<span>GitHub</span>`;
  return link;
}
