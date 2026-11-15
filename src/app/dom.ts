// The page's only helper for making elements.

type Child = Node | string | number | null | undefined | false;
type Value = string | number | boolean | null | undefined | ((event: never) => void);

/**
 * Make an element. `el("button.quiet", { type: "button", onclick: go }, "Speak")`.
 * Keys starting with "on" are listeners; `true` sets an empty attribute; false and null are left out.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}`,
  attrs: Record<string, Value> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split(".");
  const node = document.createElement(tag) as HTMLElementTagNameMap[K];
  if (classes.length) node.className = classes.join(" ");
  for (const key in attrs) {
    const value = attrs[key];
    if (typeof value === "function") node.addEventListener(key.slice(2), value as EventListener);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  }
  node.append(...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false).map((c) => (typeof c === "number" ? String(c) : c)));
  return node;
}

/** Is the keyboard's focus somewhere that wants the keys for itself (typing)? */
export function typing(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && a.type !== "range" && a.type !== "radio" && a.type !== "checkbox");
}
