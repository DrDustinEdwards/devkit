import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { WCAG_TAGS } from "../a11y-judge.mjs";

/** @typedef {any} Page A Playwright page (Playwright is found at run time, so it has no types here). */

export const TAB_PRESSES = 40;

export const FORCED_PRESSES = 20;

export const ESCAPE_CONTROLS = 3;

export const PAUSE_MS = 700;

export const sleep = (/** @type {number} */ ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A short selector for an element, defined in every page the walk opens. */
export const SELECTOR = `window.__sel = (el) => {
  if (!el || el.nodeType !== 1) return String(el);
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 4) {
    let s = el.localName;
    if (el.id) { parts.unshift(s + "#" + CSS.escape(el.id)); break; }
    const cls = [...el.classList].filter((c) => !/^(astro-|svelte-|css-|_)/.test(c)).slice(0, 2);
    if (cls.length) s += "." + cls.map((c) => CSS.escape(c)).join(".");
    const same = el.parentElement ? [...el.parentElement.children].filter((x) => x.localName === el.localName) : [];
    if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
    parts.unshift(s);
    el = el.parentElement;
  }
  return parts.join(" > ");
};`;

/** The focus-relevant computed style of an element. */
export const STYLE = `window.__ring = (cs) => cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor + " " + cs.boxShadow + " " + cs.borderColor;
window.__style = (el) => {
  const ringOf = (el) => {
    const own = [];
    for (const pseudo of ["::-webkit-slider-thumb", "::-moz-range-thumb"]) own.push(window.__ring(getComputedStyle(el, pseudo)));
    // An svg link draws its ring on its shape: the stroke of its first child.
    const shape = el.firstElementChild;
    if (shape) {
      const cs = getComputedStyle(shape);
      own.push(cs.stroke + " " + cs.strokeWidth);
    }
    let up = el;
    for (let i = 0; i < 4 && up.parentElement && up.parentElement !== document.body; i++) {
      up = up.parentElement;
      own.push(window.__ring(getComputedStyle(up)));
    }
    return own.join("|");
  };
  const cs = getComputedStyle(el);
  return { outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, shadow: cs.boxShadow, bg: cs.backgroundColor,
    border: cs.borderColor + " " + cs.borderWidth, decoration: cs.textDecorationLine + " " + cs.textDecorationThickness, color: cs.color,
    ring: ringOf(el) };
};`;

export const SPACING_CSS =
  "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

export function load(/** @type {string} */ name) {
  for (const base of [join(process.cwd(), "package.json"), import.meta.url]) {
    try {
      return createRequire(base)(name);
    } catch (error) {
      if (/** @type {any} */ (error).code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  return null;
}

export async function settle(/** @type {Page} */ page, /** @type {number} */ ms) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await sleep(ms);
}

export function basics(/** @type {Page} */ page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(
      (h) => h.getClientRects().length || h.closest("[hidden]") === null,
    );
    const outside = (/** @type {string} */ sel) =>
      [...document.querySelectorAll(sel)].filter(
        (el) => !el.parentElement?.closest("article,aside,main,nav,section"),
      ).length;
    return {
      lang: document.documentElement.getAttribute("lang") || null,
      title: document.title || null,
      h1: document.querySelectorAll("h1").length,
      headings: headings.map((h) => ({ level: Number(h.localName[1]), sel: window.__sel(h) })),
      landmarks: {
        main: document.querySelectorAll("main, [role=main]").length,
        banner: outside("header") + document.querySelectorAll("[role=banner]").length,
        nav: document.querySelectorAll("nav, [role=navigation]").length,
        contentinfo: outside("footer") + document.querySelectorAll("[role=contentinfo]").length,
      },
      imgNoAlt: [...document.querySelectorAll("img:not([alt]), input[type=image]:not([alt])")].map(
        (img) => window.__sel(img),
      ),
    };
  });
}

export async function axe(/** @type {Page} */ AxeBuilder, /** @type {Page} */ page) {
  try {
    // Only violations are read, so the passes are not built. A page with no frame in it is analyzed in the page itself
    // (legacy mode): the partial-results route that reaches cross-origin frames takes 4x as long on a chart page.
    const { violations } = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS, "best-practice"])
      .options({ resultTypes: ["violations"] })
      .setLegacyMode(page.frames().length === 1)
      .analyze();
    return violations.map((/** @type {Page} */ v) => ({
      id: v.id,
      impact: v.impact,
      tags: v.tags,
      nodes: v.nodes.length,
      target: v.nodes[0]?.target?.join(" ") ?? "",
    }));
  } catch (error) {
    return { error: String(error).slice(0, 200) };
  }
}

export const isRange = (/** @type {Page} */ page) =>
  page.evaluate(
    () =>
      /** @type {HTMLElement | null} */ (document.activeElement)?.matches?.("input[type=range]") ??
      false,
  );

/** A hash of the pixels around a range input (the focused one, or with a key the one a Tab press tagged), scrolled to the middle. */
export async function rangePixels(/** @type {Page} */ page, key = -1) {
  const box = await page.evaluate((/** @type {number} */ k) => {
    const el =
      k < 0 ? document.activeElement : document.querySelector('[data-devkit-tab="' + k + '"]');
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, r.x - 8),
      y: Math.max(0, r.y - 8),
      width: r.width + 16,
      height: r.height + 16,
    };
  }, key);
  if (!box) return undefined;
  await sleep(60);
  const png = await page.screenshot({ clip: box }).catch(() => null);
  return png ? createHash("sha1").update(png).digest("hex") : undefined;
}
