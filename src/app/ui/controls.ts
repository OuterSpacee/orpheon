// The few kinds of control the page is made of. Each is a native element underneath (a range, a
// radio, a button), so the keyboard and a screen reader work without anything extra; the
// stylesheet takes the boxes away.
import { el } from "../dom.ts";

export interface Slider {
  root: HTMLElement;
  /** Show a value that changed somewhere else. */
  set(value: number): void;
}

export interface SliderSpec {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** The value in words or numbers, shown at the right. */
  show?: (value: number) => string;
  /** What the two ends mean, for controls that run between two qualities. */
  ends?: [string, string];
  /** Numbers are set in the mono face; set false when `show` gives words. */
  numeric?: boolean;
  input: (value: number) => void;
}

export function slider(spec: SliderSpec): Slider {
  // A value from 0 to 1 reads as a share; any other as its number.
  const show = spec.show ?? (spec.min >= 0 && spec.max <= 1 ? (v: number) => `${Math.round(v * 100)}%` : (v: number) => v.toFixed(2));
  const value = el(spec.numeric === false ? "output.dial-value" : "output.dial-value.num");
  const range = el("input", {
    type: "range",
    min: spec.min,
    max: spec.max,
    step: spec.step,
    "aria-label": spec.label,
    oninput: () => {
      paint(Number(range.value));
      spec.input(Number(range.value));
    },
  });
  // While a slider is being moved, its value is the warm thing on the page.
  const root = el(
    "label.dial",
    {},
    el("span.dial-name", {}, spec.label),
    value,
    range,
    spec.ends ? el("span.dial-ends", { "aria-hidden": "true" }, el("span", {}, spec.ends[0]), el("span", {}, spec.ends[1])) : null,
  );
  function paint(v: number): void {
    value.textContent = show(v);
    range.setAttribute("aria-valuetext", show(v));
    range.style.setProperty("--at", String((v - spec.min) / (spec.max - spec.min)));
  }
  function set(v: number): void {
    if (Number(range.value) !== v) range.value = String(v);
    paint(Number(range.value));
  }
  set(spec.value);
  return { root, set };
}

export interface Choice<T extends string> {
  root: HTMLElement;
  set(value: T): void;
}

let groups = 0;

/** One of several, as a list of words: the chosen one is lit. Arrow keys move between them. */
export function choice<T extends string>(spec: {
  label: string;
  options: readonly { value: T; label: string; lang?: string }[];
  value: T;
  pick: (value: T) => void;
  /** Lay the words out in a row instead of a column. */
  row?: boolean;
}): Choice<T> {
  const name = `choice-${groups++}`;
  const inputs = new Map<T, HTMLInputElement>();
  const root = el(spec.row ? "fieldset.choice.row" : "fieldset.choice", {}, el("legend.dial-name", {}, spec.label));
  for (const option of spec.options) {
    const input = el("input", { type: "radio", name, value: option.value, onchange: () => spec.pick(option.value) });
    inputs.set(option.value, input);
    root.append(el("label.option", {}, input, el("span", { lang: option.lang }, option.label)));
  }
  const set = (value: T) => {
    const input = inputs.get(value);
    if (input) input.checked = true;
    else inputs.forEach((i) => (i.checked = false));
  };
  set(spec.value);
  return { root, set };
}

export interface Toggle {
  root: HTMLButtonElement;
  set(on: boolean): void;
}

/** Something that is on or off. */
export function toggle(label: string, on: boolean, flip: (on: boolean) => void): Toggle {
  const root = el("button.toggle", { type: "button", onclick: () => flip(root.getAttribute("aria-pressed") !== "true") }, label);
  const set = (value: boolean) => root.setAttribute("aria-pressed", String(value));
  set(on);
  return { root, set };
}

/** Something to do. */
export function action(label: string, act: () => void, extra: Record<string, string | boolean> = {}): HTMLButtonElement {
  return el("button.action", { type: "button", onclick: act, ...extra }, label);
}

export interface Section {
  root: HTMLDetailsElement;
  /** What the section holds, put where its children go. */
  body: HTMLElement;
  /** A few words beside the title, read while it is closed ("off", "bass, strings"). */
  note(text: string): void;
}

/** A group of controls that folds away under its title, so a long column stays short. */
export function section(title: string, open: boolean, ...children: (Node | null)[]): Section {
  const noted = el("span.section-note");
  const body = el("div.section-body", {}, ...children);
  const root = el("details.section", { open }, el("summary.section-title", {}, el("span", {}, title), noted), body);
  return { root, body, note: (text) => void (noted.textContent = text) };
}
