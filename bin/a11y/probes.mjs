import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { WCAG_TAGS } from "../a11y-judge.mjs";
import { locs } from "../warm.mjs";

export const VIEWS = [
  { width: 1440, height: 900, scheme: "light" },
  { width: 1440, height: 900, scheme: "dark" },
  { width: 390, height: 844, scheme: "light" },
  { width: 390, height: 844, scheme: "dark" },
];
const TAB_PRESSES = 40;
export const FORCED_PRESSES = 20;
const ESCAPE_CONTROLS = 3;
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

const SPACING_CSS =
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

export async function fetchText(/** @type {string} */ url) {
  try {
    const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    return { status: response.status, text: response.ok ? await response.text() : "" };
  } catch (error) {
    return { status: 0, text: "", error: /** @type {Error} */ (error).message };
  }
}

/** The sitemap's URLs (a sitemap index followed to its first five children), moved from origin to base. */
export async function sitemapUrls(/** @type {string} */ origin, /** @type {string} */ base) {
  // Same origin by the parsed URL, not by prefix: https://example.com.evil.test starts with https://example.com.
  const same = (/** @type {string} */ url) => {
    try {
      return new URL(url).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  };
  const move = (/** @type {string} */ url) => {
    const u = new URL(url);
    return base + u.pathname + u.search;
  };
  const { text } = await fetchText(`${base}/sitemap.xml`);
  if (!/<sitemapindex/i.test(text)) return locs(text).filter(same).map(move);
  const urls = [];
  for (const child of locs(text).filter(same).slice(0, 5))
    urls.push(
      ...locs((await fetchText(move(child))).text)
        .filter(same)
        .map(move),
    );
  return urls;
}

/** @typedef {any} Page A Playwright page (Playwright is found at run time, so it has no types here). */

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

const isRange = (/** @type {Page} */ page) =>
  page.evaluate(
    () =>
      /** @type {HTMLElement | null} */ (document.activeElement)?.matches?.("input[type=range]") ??
      false,
  );

/** A hash of the pixels around a range input (the focused one, or with a key the one a Tab press tagged), scrolled to the middle. */
async function rangePixels(/** @type {Page} */ page, key = -1) {
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

/** Every Tab press from the top of the page: what took focus, how it looked, and what covered it. */
export async function keyboardWalk(/** @type {Page} */ page, count = TAB_PRESSES) {
  await page.mouse.click(1, 1).catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-devkit-tab]"))
      el.removeAttribute("data-devkit-tab");
    /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.();
    window.scrollTo(0, 0);
    // The click above set Tab's starting point where it landed (an error page's whole-screen main takes it): the first Tab starts from the top of the page.
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    document.body.removeAttribute("tabindex");
    window.scrollTo(0, 0);
  });
  const presses = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    await sleep(120);
    const press = await page.evaluate((/** @type {number} */ key) => {
      const el = /** @type {HTMLElement | null} */ (document.activeElement);
      if (!el || el === document.body || el === document.documentElement) return { body: true };
      const same = el.getAttribute("data-devkit-tab") === String(key - 1);
      el.setAttribute("data-devkit-tab", String(key));
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const offscreen =
        r.width === 0 || r.height === 0 || cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight;
      let covered = null;
      if (!offscreen) {
        // elementFromPoint skips pointer-events:none, so a control that takes none (a chart's point buttons, drawn
        // over the marks inside a pointer-less layer) would read as covered by whatever lies under it. Letting this
        // one element take hits asks what is on top at its center by paint order.
        const restore = el.style.pointerEvents;
        el.style.pointerEvents = "auto";
        const hit = document.elementFromPoint(cx, cy);
        el.style.pointerEvents = restore;
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
          let position = null;
          for (
            let n = /** @type {Element | null} */ (hit);
            n && n !== document.body && !position;
            n = n.parentElement
          ) {
            const p = getComputedStyle(n).position;
            if (p === "fixed" || p === "sticky") position = p;
          }
          covered = { by: window.__sel(hit), position };
        }
      }
      let skipTargetsMain = false;
      const href = el.getAttribute("href") || "";
      if (el.localName === "a" && href.length > 1 && href.startsWith("#")) {
        const target = document.getElementById(
          (() => {
            try {
              return decodeURIComponent(href.slice(1));
            } catch {
              return href.slice(1); // a malformed escape (#%E0%A4%A) names the id as written
            }
          })(),
        );
        const main = document.querySelector("main, [role=main]");
        skipTargetsMain = Boolean(
          target &&
          main &&
          (target === main ||
            main.contains(target) ||
            target.contains(main) ||
            target.nextElementSibling === main),
        );
      }
      // A button that opens something (a menu, a dialog, the header sheet): the Escape test comes back to it.
      if (
        el.matches("button, [role=button]") &&
        ["aria-expanded", "aria-haspopup", "popovertarget"].some((a) => el.hasAttribute(a))
      )
        el.setAttribute("data-devkit-opener", "");
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40);
      return {
        key,
        sel: window.__sel(el),
        text,
        same,
        focused: window.__style(el),
        covered,
        offscreen,
        skipTargetsMain,
      };
    }, i);
    // A range input draws its ring on its thumb, a shadow part getComputedStyle cannot read: compare what it looks like.
    if (press.sel && press.focused && (await isRange(page)))
      press.focused.pixels = await rangePixels(page);
    presses.push(press);
  }
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur?.());
  await sleep(150);
  const unfocused = new Map(
    await page.evaluate(() =>
      [...document.querySelectorAll("[data-devkit-tab]")].map((el) => [
        Number(el.getAttribute("data-devkit-tab")),
        window.__style(el),
      ]),
    ),
  );
  for (const press of presses) {
    if (!press.focused?.pixels || !unfocused.has(press.key)) continue;
    const pixels = await rangePixels(page, press.key);
    if (pixels) unfocused.get(press.key).pixels = pixels;
  }
  // An element focused more than once carries its last press's key; its unfocused style is the same for every press.
  const bySel = new Map();
  for (const press of presses)
    if (!press.body && unfocused.has(press.key)) bySel.set(press.sel, unfocused.get(press.key));
  return presses.map((press) =>
    press.body ? press : { ...press, unfocused: bySel.get(press.sel) },
  );
}

export function reflow(/** @type {Page} */ page) {
  return page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = Math.min(innerWidth, document.documentElement.clientWidth);
    if (scrollWidth <= clientWidth) return { scrollWidth, clientWidth };
    const inScroller = (/** @type {Element} */ el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement)
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(n).overflowX)) return true;
      return false;
    };
    // The deepest element outside any scroller whose box or content reaches furthest right.
    let widest = null;
    let depth = -1;
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const right = Math.max(r.right, r.left + el.scrollWidth);
      if (
        r.width === 0 ||
        right < scrollWidth - 2 ||
        inScroller(el) ||
        getComputedStyle(el).visibility === "hidden"
      )
        continue;
      let d = 0;
      for (let n = /** @type {Element | null} */ (el); n; n = n.parentElement) d++;
      if (d > depth) [widest, depth] = [{ sel: window.__sel(el), right: Math.round(right) }, d];
    }
    return { scrollWidth, clientWidth, widest };
  });
}

/** The 720 px viewport that stands in for 200% zoom of a 1440 px window: sideways scroll, and a way to the navigation. */
export function zoomProxy(/** @type {Page} */ page) {
  return page.evaluate(() => {
    const visible = (/** @type {Element} */ el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const navLinks = [
      ...document.querySelectorAll("nav a[href], [role=navigation] a[href]"),
    ].filter(visible).length;
    const toggle = [
      ...document.querySelectorAll(
        "button[aria-expanded], button[aria-controls], [popovertarget], summary",
      ),
    ].find(
      (el) =>
        visible(el) &&
        !(/** @type {HTMLButtonElement} */ (el).disabled) &&
        /** @type {HTMLElement} */ (el).tabIndex >= 0,
    );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      navLinks,
      toggle: toggle ? window.__sel(toggle) : null,
    };
  });
}

/** Up to ESCAPE_CONTROLS openers the walk reached: Enter opens it, Escape must close it and put focus back on it. */
export async function escapeCloses(/** @type {Page} */ page) {
  const results = [];
  const url = page.url();
  for (const opener of (await page.$$("[data-devkit-opener]")).slice(0, ESCAPE_CONTROLS)) {
    const state = () =>
      opener.evaluate((/** @type {Element} */ el) => ({
        expanded: el.getAttribute("aria-expanded") === "true",
        layers:
          document.querySelectorAll("dialog[open], :popover-open").length +
          [...document.querySelectorAll("[aria-modal=true]")].filter(
            (m) => m.getClientRects().length,
          ).length,
        focusBack: document.activeElement === el,
        sel: window.__sel(el),
      }));
    const before = await state();
    if (!(await opener.isVisible())) continue;
    await opener.focus();
    await page.keyboard.press("Enter");
    await sleep(400);
    if (page.url() !== url) break;
    const open = await state();
    const opened = open.expanded || open.layers > before.layers;
    if (!opened) {
      results.push({ sel: before.sel, opened });
      continue;
    }
    await page.keyboard.press("Escape");
    await sleep(400);
    const after = await state();
    const closed = !after.expanded && after.layers <= before.layers;
    results.push({ sel: before.sel, opened, closed, focusBack: after.focusBack });
    if (!closed) break;
  }
  return results;
}

/** Elements whose text the WCAG 1.4.12 spacing pushes out of an overflow-hidden box that held it before. */
export async function textSpacing(/** @type {Page} */ page) {
  const clipped = () =>
    page.evaluate(() => {
      const hides = (/** @type {string} */ v) => v === "hidden" || v === "clip";
      /** @type {{ sel: string, dir: string }[]} */
      const out = [];
      for (const el of /** @type {NodeListOf<HTMLElement>} */ (
        document.body.querySelectorAll("*")
      )) {
        const cs = getComputedStyle(el);
        if (!hides(cs.overflowX) && !hides(cs.overflowY)) continue;
        if (el.clientWidth <= 2 || el.clientHeight <= 2 || !(el.innerText || "").trim()) continue;
        const vertical = hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
        const horizontal =
          hides(cs.overflowX) &&
          el.scrollWidth > el.clientWidth + 2 &&
          cs.textOverflow !== "ellipsis";
        if (vertical || horizontal)
          out.push({ sel: window.__sel(el), dir: vertical ? "vertical" : "horizontal" });
      }
      return out;
    });
  /** @type {{ sel: string, dir: string }[]} */
  const first = await clipped();
  const before = new Set(first.map((c) => c.sel));
  const style = await page.addStyleTag({ content: SPACING_CSS });
  await sleep(300);
  /** @type {{ sel: string, dir: string }[]} */
  const after = await clipped();
  await style.evaluate((/** @type {Element} */ node) => node.remove());
  return after.filter((c) => !before.has(c.sel));
}

export async function motion(/** @type {Page} */ browser, /** @type {string} */ url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(SELECTOR);
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    await settle(page, 1500);
    return await page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.playState === "running" && a.timeline instanceof DocumentTimeline)
        .map((animation) => {
          const a = /** @type {Animation & Record<string, any>} */ (animation);
          const timing = a.effect?.getTiming?.() ?? {};
          return {
            name: a.animationName || a.transitionProperty || a.constructor.name,
            target: window.__sel(/** @type {any} */ (a.effect)?.target),
            duration: timing.duration,
            iterations: timing.iterations === Infinity ? "infinite" : timing.iterations,
          };
        }),
    );
  } finally {
    await context.close();
  }
}
