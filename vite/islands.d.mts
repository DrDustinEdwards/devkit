/**
 * Islands (islands.mjs): elements marked `data-island="<name>"` load their module only when the page needs it (by
 * default the content-hashed URL a built /site.js carries, or /islands/<name>.js in `vite dev`),
 * by `data-client` (load, idle, visible or media), as Astro's client directives do (MIT, Copyright (c) 2021 Fred K.
 * Schott). The module's default export is called once with the element and its parsed `data-props`.
 */

/** What an island file is named: lower case words and hyphens. */
export const ISLAND_NAME: RegExp;

/** What an island module exports. */
export type Island<P = unknown> = (el: HTMLElement, props: P) => unknown;

export function startIslands(options?: {
  root?: ParentNode;
  load?: (name: string) => Promise<{ default: Island }>;
}): void;
