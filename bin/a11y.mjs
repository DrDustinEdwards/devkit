#!/usr/bin/env node
// devkit-a11y: the live accessibility check (area 9). It loads a site's home page, a 404 and up to --max-pages sitemap
// pages of different types in Chromium and measures each: axe-core (WCAG 2.2 A and AA plus best practice) at 1440 and
// 390 px in light and dark, a 40-press Tab walk, reflow at 320 px, WCAG 1.4.12 text spacing, animations under reduced
// motion, Escape on the menus and dialogs the walk reaches, axe and focus again in forced colors, a 720 px proxy for 200%
// zoom, and the page's structure; then the site's /accessibility statement. bin/a11y-judge.mjs turns the measurements
// into findings, each titled with the checklist item it proves (L1 to L4, S2, S3, S6).
//
//   devkit-a11y --origin https://example.com [--from https://preview.example.workers.dev] [--max-pages 8]
//
// --from loads the pages from where the site is served now; the sitemap's URLs on --origin are read there too. Each
// finding is a GitHub annotation; exit 0 with no errors, 1 with errors, 2 when it could not run (no browser, or the site
// did not answer). Read-only: it never signs in and never submits a form.
//
// It needs `playwright` and `@axe-core/playwright`, which this package does not install (it has no dependencies): they
// are found from the working directory's package first, then beside devkit, then NODE_PATH. Chromium comes from
// `npx playwright install --with-deps chromium`, as live.yml does.

import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { WCAG_TAGS, annotation, judgeSite, pickPages } from "./a11y-judge.mjs";

const VIEWS = [
  { width: 1440, height: 900, scheme: "light" },
  { width: 1440, height: 900, scheme: "dark" },
  { width: 390, height: 844, scheme: "light" },
  { width: 390, height: 844, scheme: "dark" },
];
const TAB_PRESSES = 40;
const FORCED_PRESSES = 20;
const ESCAPE_CONTROLS = 3;
const PAUSE_MS = 700;
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A short selector for an element, defined in every page the walk opens. */
const SELECTOR = `window.__sel = (el) => {
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
const STYLE = `window.__style = (el) => {
  const cs = getComputedStyle(el);
  return { outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, shadow: cs.boxShadow, bg: cs.backgroundColor,
    border: cs.borderColor + " " + cs.borderWidth, decoration: cs.textDecorationLine + " " + cs.textDecorationThickness, color: cs.color };
};`;

const SPACING_CSS = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

function load(/** @type {string} */ name) {
  for (const base of [join(process.cwd(), "package.json"), import.meta.url]) {
    try {
      return createRequire(base)(name);
    } catch (error) {
      if (/** @type {any} */ (error).code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  return null;
}

async function fetchText(/** @type {string} */ url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    return { status: response.status, text: response.ok ? await response.text() : "" };
  } catch (error) {
    return { status: 0, text: "", error: /** @type {Error} */ (error).message };
  }
}

const locs = (/** @type {string} */ xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

/** The sitemap's URLs (a sitemap index followed to its first five children), moved from origin to base. */
async function sitemapUrls(/** @type {string} */ origin, /** @type {string} */ base) {
  const move = (/** @type {string} */ url) => (url.startsWith(origin) ? base + url.slice(origin.length) : url);
  const { text } = await fetchText(`${base}/sitemap.xml`);
  if (!/<sitemapindex/i.test(text)) return locs(text).map(move);
  const urls = [];
  for (const child of locs(text).slice(0, 5)) urls.push(...locs((await fetchText(move(child))).text).map(move));
  return urls;
}

async function settle(page, ms) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await sleep(ms);
}

function basics(page) {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter((h) => h.getClientRects().length || h.closest("[hidden]") === null);
    const outside = (sel) => [...document.querySelectorAll(sel)].filter((el) => !el.parentElement.closest("article,aside,main,nav,section")).length;
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
      imgNoAlt: [...document.querySelectorAll("img:not([alt]), input[type=image]:not([alt])")].map((img) => window.__sel(img)),
    };
  });
}

async function axe(AxeBuilder, page) {
  try {
    const { violations } = await new AxeBuilder({ page }).withTags([...WCAG_TAGS, "best-practice"]).analyze();
    return violations.map((v) => ({ id: v.id, impact: v.impact, tags: v.tags, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(" ") ?? "" }));
  } catch (error) {
    return { error: String(error).slice(0, 200) };
  }
}

/** Every Tab press from the top of the page: what took focus, how it looked, and what covered it. */
async function keyboardWalk(page, count = TAB_PRESSES) {
  await page.mouse.click(1, 1).catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-devkit-tab]")) el.removeAttribute("data-devkit-tab");
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
  });
  const presses = [];
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    await sleep(120);
    presses.push(
      await page.evaluate((key) => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) return { body: true };
        const same = el.getAttribute("data-devkit-tab") === String(key - 1);
        el.setAttribute("data-devkit-tab", String(key));
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const offscreen = r.width === 0 || r.height === 0 || cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight;
        let covered = null;
        if (!offscreen) {
          const hit = document.elementFromPoint(cx, cy);
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            let position = null;
            for (let n = hit; n && n !== document.body && !position; n = n.parentElement) {
              const p = getComputedStyle(n).position;
              if (p === "fixed" || p === "sticky") position = p;
            }
            covered = { by: window.__sel(hit), position };
          }
        }
        let skipTargetsMain = false;
        const href = el.getAttribute("href") || "";
        if (el.localName === "a" && href.length > 1 && href.startsWith("#")) {
          const target = document.getElementById(decodeURIComponent(href.slice(1)));
          const main = document.querySelector("main, [role=main]");
          skipTargetsMain = Boolean(target && main && (target === main || main.contains(target) || target.contains(main) || target.nextElementSibling === main));
        }
        // A button that opens something (a menu, a dialog, the header sheet): the Escape test comes back to it.
        if (el.matches("button, [role=button]") && ["aria-expanded", "aria-haspopup", "popovertarget"].some((a) => el.hasAttribute(a))) el.setAttribute("data-devkit-opener", "");
        const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40);
        return { key, sel: window.__sel(el), text, same, focused: window.__style(el), covered, offscreen, skipTargetsMain };
      }, i),
    );
  }
  await page.evaluate(() => document.activeElement?.blur?.());
  await sleep(150);
  const unfocused = new Map(await page.evaluate(() => [...document.querySelectorAll("[data-devkit-tab]")].map((el) => [Number(el.getAttribute("data-devkit-tab")), window.__style(el)])));
  // An element focused more than once carries its last press's key; its unfocused style is the same for every press.
  const bySel = new Map();
  for (const press of presses) if (!press.body && unfocused.has(press.key)) bySel.set(press.sel, unfocused.get(press.key));
  return presses.map((press) => (press.body ? press : { ...press, unfocused: bySel.get(press.sel) }));
}

function reflow(page) {
  return page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = Math.min(innerWidth, document.documentElement.clientWidth);
    if (scrollWidth <= clientWidth) return { scrollWidth, clientWidth };
    const inScroller = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(n).overflowX)) return true;
      return false;
    };
    // The deepest element outside any scroller whose box or content reaches furthest right.
    let widest = null;
    let depth = -1;
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      const right = Math.max(r.right, r.left + el.scrollWidth);
      if (r.width === 0 || right < scrollWidth - 2 || inScroller(el) || getComputedStyle(el).visibility === "hidden") continue;
      let d = 0;
      for (let n = el; n; n = n.parentElement) d++;
      if (d > depth) [widest, depth] = [{ sel: window.__sel(el), right: Math.round(right) }, d];
    }
    return { scrollWidth, clientWidth, widest };
  });
}

/** The 720 px viewport that stands in for 200% zoom of a 1440 px window: sideways scroll, and a way to the navigation. */
function zoomProxy(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const navLinks = [...document.querySelectorAll("nav a[href], [role=navigation] a[href]")].filter(visible).length;
    const toggle = [...document.querySelectorAll("button[aria-expanded], button[aria-controls], [popovertarget], summary")].find((el) => visible(el) && !el.disabled && el.tabIndex >= 0);
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, navLinks, toggle: toggle ? window.__sel(toggle) : null };
  });
}

/** Up to ESCAPE_CONTROLS openers the walk reached: Enter opens it, Escape must close it and put focus back on it. */
async function escapeCloses(page) {
  const results = [];
  const url = page.url();
  for (const opener of (await page.$$("[data-devkit-opener]")).slice(0, ESCAPE_CONTROLS)) {
    const state = () =>
      opener.evaluate((el) => ({
        expanded: el.getAttribute("aria-expanded") === "true",
        layers: document.querySelectorAll("dialog[open], :popover-open").length + [...document.querySelectorAll("[aria-modal=true]")].filter((m) => m.getClientRects().length).length,
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
async function textSpacing(page) {
  const clipped = () =>
    page.evaluate(() => {
      const hides = (v) => v === "hidden" || v === "clip";
      const out = [];
      for (const el of document.body.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if (!hides(cs.overflowX) && !hides(cs.overflowY)) continue;
        if (el.clientWidth <= 2 || el.clientHeight <= 2 || !(el.innerText || "").trim()) continue;
        const vertical = hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
        const horizontal = hides(cs.overflowX) && el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== "ellipsis";
        if (vertical || horizontal) out.push({ sel: window.__sel(el), dir: vertical ? "vertical" : "horizontal" });
      }
      return out;
    });
  const before = new Set((await clipped()).map((c) => c.sel));
  const style = await page.addStyleTag({ content: SPACING_CSS });
  await sleep(300);
  const after = await clipped();
  await style.evaluate((node) => node.remove());
  return after.filter((c) => !before.has(c.sel));
}

async function motion(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(SELECTOR);
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    await settle(page, 1500);
    return await page.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running").map((a) => {
        const timing = a.effect?.getTiming?.() ?? {};
        return { name: a.animationName || a.transitionProperty || a.constructor.name, target: window.__sel(a.effect?.target), duration: timing.duration, iterations: timing.iterations === Infinity ? "infinite" : timing.iterations };
      }),
    );
  } finally {
    await context.close();
  }
}

/** Every measurement of one page, in the shape judgeSite reads. */
async function scanPage(browser, AxeBuilder, { url, why }) {
  const scan = { url, why };
  // bypassCSP: a style-src 'self' policy would refuse the injected text spacing, as it refuses the bookmarklet.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", bypassCSP: true });
  await context.addInitScript(SELECTOR + STYLE);
  try {
    const page = await context.newPage();
    scan.status = (await page.goto(url, { waitUntil: "load", timeout: 45_000 }))?.status();
    await settle(page, 800);
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
    scan.forced = { axe: await axe(AxeBuilder, page), keyboard: await keyboardWalk(page, FORCED_PRESSES) };
    await page.emulateMedia({ colorScheme: "light", forcedColors: "none" });
    await page.setViewportSize({ width: 320, height: 640 });
    await sleep(500);
    scan.reflow = await reflow(page);
    await page.setViewportSize({ width: 720, height: 450 });
    await sleep(500);
    scan.zoom = await zoomProxy(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(400);
    scan.escape = await escapeCloses(page).catch(() => undefined);
    await context.close();
    await sleep(PAUSE_MS);
    scan.motion = await motion(browser, url);
  } catch (error) {
    scan.error = String(/** @type {Error} */ (error).message ?? error).split("\n")[0].slice(0, 200);
  } finally {
    await context.close().catch(() => {});
  }
  await sleep(PAUSE_MS);
  return scan;
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: "string" }, from: { type: "string" }, "max-pages": { type: "string", default: "8" } } });
  if (!values.origin) {
    console.error("usage: devkit-a11y --origin https://example.com [--from https://preview.example] [--max-pages 8]");
    return 2;
  }
  const origin = values.origin.replace(/\/$/, "");
  const base = values.from?.replace(/\/$/, "") ?? origin;
  const playwright = load("playwright");
  const axeModule = load("@axe-core/playwright");
  if (!playwright || !axeModule) {
    console.error("devkit-a11y: needs playwright and @axe-core/playwright installed where it runs (npm i -D playwright @axe-core/playwright)");
    return 2;
  }
  const AxeBuilder = axeModule.default ?? axeModule.AxeBuilder ?? axeModule;
  const home = await fetchText(`${base}/`);
  if (home.status === 0 || home.status >= 500) {
    console.error(`devkit-a11y: ${base} did not answer: ${home.error ?? home.status}`);
    return 2;
  }
  const max = Number(values["max-pages"]);
  let picks = pickPages(base, await sitemapUrls(origin, base), max);
  if (picks.length < 3) {
    // A sitemap of one or two pages: the home page's own links fill it out.
    const links = [...home.text.matchAll(/href="([^"#]+)"/g)].map((m) => m[1]);
    picks = pickPages(base, [...picks.map((p) => p.url), ...links], max);
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    console.error(`devkit-a11y: Chromium did not start (npx playwright install --with-deps chromium): ${String(error).split("\n")[0]}`);
    return 2;
  }
  const pages = [];
  try {
    for (const target of [{ url: `${base}/`, why: "home" }, { url: `${base}/no-such-page-devkit-a11y`, why: "404" }, ...picks]) {
      console.error(`devkit-a11y: ${target.url}`);
      pages.push(await scanPage(browser, AxeBuilder, target));
    }
  } finally {
    await browser.close();
  }
  if (pages[0].error) {
    console.error(`devkit-a11y: the home page could not be scanned: ${pages[0].error}`);
    return 2;
  }
  const statement = { url: `${base}/accessibility`, status: (await fetchText(`${base}/accessibility`)).status };
  const findings = judgeSite({ statement, pages });
  for (const finding of findings) console.log(annotation(finding));
  const errors = findings.filter((f) => f.severity === "error").length;
  const items = Object.entries(Object.groupBy(findings, (f) => f.item)).map(([item, list]) => `${item} ${list.length}`).join(", ");
  console.log(`devkit-a11y: ${pages.length} pages on ${base}; ${errors} errors, ${findings.length - errors} warnings${items ? ` (${items})` : ""}.`);
  return errors > 0 ? 1 : 0;
}

process.exitCode = await main().catch((error) => {
  console.error(`devkit-a11y: ${error?.stack ?? error}`);
  return 2;
});
