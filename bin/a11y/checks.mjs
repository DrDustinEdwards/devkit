import {
  ESCAPE_CONTROLS,
  FORCED_PRESSES,
  PAUSE_MS,
  SELECTOR,
  SPACING_CSS,
  STYLE,
  TAB_PRESSES,
  axe,
  basics,
  isRange,
  rangePixels,
  settle,
  sleep,
} from "./page.mjs";

/** @typedef {import("./page.mjs").Page} Page */

const VIEWS = [
  { width: 1440, height: 900, scheme: "light" },
  { width: 1440, height: 900, scheme: "dark" },
  { width: 390, height: 844, scheme: "light" },
  { width: 390, height: 844, scheme: "dark" },
];

/** Every Tab press from the top of the page: what took focus, how it looked, and what covered it. */
async function keyboardWalk(/** @type {Page} */ page, count = TAB_PRESSES) {
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

function reflow(/** @type {Page} */ page) {
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
function zoomProxy(/** @type {Page} */ page) {
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
async function escapeCloses(/** @type {Page} */ page) {
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
async function textSpacing(/** @type {Page} */ page) {
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

async function motion(/** @type {Page} */ browser, /** @type {string} */ url) {
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

/** Every measurement of one page, in the shape judgeSite reads. */
export async function scanPage(
  /** @type {Page} */ browser,
  /** @type {Page} */ AxeBuilder,
  /** @type {{ url: string, why: string }} */ { url, why },
) {
  /** @type {Record<string, any>} */
  const scan = { url, why };
  // bypassCSP: a style-src 'self' policy would refuse the injected text spacing, as it refuses the bookmarklet.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    bypassCSP: true,
  });
  await context.addInitScript(SELECTOR + STYLE);
  try {
    const page = await context.newPage();
    scan.status = (await page.goto(url, { waitUntil: "load", timeout: 45_000 }))?.status();
    await settle(page, 800);
    scan.landed = page.url();
    scan.basics = await basics(page);
    scan.axe = {};
    for (const view of VIEWS) {
      await page.setViewportSize({ width: view.width, height: view.height });
      await page.emulateMedia({ colorScheme: view.scheme });
      await sleep(500);
      scan.axe[`${view.width}-${view.scheme}`] = await axe(AxeBuilder, page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await sleep(400);
    scan.clipped = await textSpacing(page);
    scan.keyboard = await keyboardWalk(page);
    await page.emulateMedia({ colorScheme: "light", forcedColors: "active" });
    await sleep(400);
    scan.forced = {
      axe: await axe(AxeBuilder, page),
      keyboard: await keyboardWalk(page, FORCED_PRESSES),
    };
    await page.emulateMedia({ colorScheme: "light", forcedColors: "none" });
    await page.setViewportSize({ width: 320, height: 640 });
    await sleep(500);
    scan.reflow = await reflow(page);
    await page.setViewportSize({ width: 720, height: 450 });
    await sleep(500);
    scan.zoom = await zoomProxy(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(400);
    scan.escape = await escapeCloses(page);
    await context.close();
    await sleep(PAUSE_MS);
    scan.motion = await motion(browser, url);
  } catch (error) {
    scan.error = String(/** @type {Error} */ (error).message ?? error)
      .split("\n")[0]
      .slice(0, 200);
  } finally {
    await context.close().catch(() => {});
  }
  await sleep(PAUSE_MS);
  return scan;
}
