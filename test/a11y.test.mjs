// devkit-a11y's judging, on measurements a browser would have taken: what each one proves, at which severity, under which
// checklist item, and which pages it picks to scan.

import assert from "node:assert/strict";
import test from "node:test";

import { judgeSite, pickPages } from "../bin/a11y-judge.mjs";

const style = (outline = "none 0px rgb(0, 0, 0)", bg = "rgba(0, 0, 0, 0)") => ({ outline, shadow: "none", bg, border: "", decoration: "", color: "" });
const stop = (key, sel, extra = {}) => ({ key, sel, text: sel, same: false, focused: style("solid 2px rgb(0, 0, 255)"), unfocused: style(), covered: null, offscreen: false, skipTargetsMain: false, ...extra });
const basics = (extra = {}) => ({
  lang: "en",
  title: "Home",
  h1: 1,
  headings: [{ level: 1, sel: "h1" }, { level: 2, sel: "h2" }],
  landmarks: { main: 1, banner: 1, nav: 1, contentinfo: 1 },
  imgNoAlt: [],
  ...extra,
});
const contrast = { id: "color-contrast", impact: "serious", tags: ["wcag2aa", "wcag143"], nodes: 2, target: ".btn" };
const region = { id: "region", impact: "moderate", tags: ["best-practice"], nodes: 1, target: ".tracks" };

test("each measurement is judged under its checklist item, WCAG as errors and best practice as warnings", () => {
  const clean = {
    url: "https://a.example.com/",
    why: "home",
    basics: basics(),
    axe: { "1440-light": [], "390-dark": [] },
    keyboard: [stop(0, "a.skip", { skipTargetsMain: true }), stop(1, "a.home")],
    reflow: { scrollWidth: 320, clientWidth: 320 },
    clipped: [],
    motion: [{ name: "fade", target: "p", duration: 0, iterations: 1 }],
  };
  const broken = {
    url: "https://a.example.com/about",
    why: "about",
    basics: basics({ lang: null, h1: 2, headings: [{ level: 1, sel: "h1" }, { level: 3, sel: "h3.card" }], landmarks: { main: 1, banner: 0, nav: 1, contentinfo: 1 }, imgNoAlt: ["img.logo"] }),
    axe: { "1440-light": [contrast, region], "390-dark": [{ ...contrast, nodes: 5 }] },
    keyboard: [
      { body: true },
      stop(1, "a.logo", { covered: { by: "header.sticky", position: "sticky" } }),
      // A button that only changes color when focused shows focus; an input that changes nothing does not.
      stop(2, "button.menu", { focused: style(undefined, "rgb(9, 9, 9)") }),
      stop(3, "input#q", { focused: style() }),
      // Focus inside an iframe: the walk sees the same host element press after press, so it is not judged for focus,
      // and ten presses on it are a trap.
      ...Array.from({ length: 10 }, (_, i) => stop(4 + i, "iframe.turnstile", { focused: style(), same: i > 0 })),
    ],
    reflow: { scrollWidth: 402, clientWidth: 320, widest: { sel: "a.chip", right: 402 } },
    clipped: [{ sel: "p.clamp", dir: "vertical" }],
    motion: [{ name: "spin", target: "svg", duration: 800, iterations: "infinite" }],
  };
  const findings = judgeSite({ statement: { url: "https://a.example.com/accessibility", status: 404 }, pages: [clean, { ...broken, basics: { ...broken.basics, title: "Home" } }] });
  assert.deepEqual(findings.filter((f) => f.url === clean.url), []);
  const got = findings.map((f) => `${f.severity} ${f.item} ${f.detail.split(/[:(]/)[0].trim()}`);
  assert.deepEqual(got, [
    "error L1 axe color-contrast",
    "warning L1 axe region",
    "error L2 no skip link to main as the first Tab stop",
    "error L2 no visible focus on 1 of 13 stops",
    "error L2 focus hidden under sticky `header.sticky` on 1 stops",
    "error L2 focus trap",
    "error L3 scrolls sideways at 320 px",
    "error L3 text clipped with WCAG 1.4.12 text spacing",
    "error L4 animations still running with reduced motion",
    "error S2 no lang on <html>",
    "warning S2 2 h1 elements, not one",
    "warning S2 heading levels skipped",
    "warning S2 landmarks",
    "error S3 images with no alt",
    'warning S2 the title "Home" is also https',
    "error S6 no accessibility statement",
  ]);
  assert.match(findings[0].detail, /at 1440-light, 390-dark: 5 elements, first `\.btn`/);
  assert.match(findings[3].detail, /`input#q`$/);
});

test("pages are picked by type from the sitemap, never an asset", () => {
  const urls = ["/", "/assets/entry-Bx3k.js", "/feed.xml", "/about", "/writing", "/writing/one", "/writing/two", "/books", "/books/a", "/old.html"].map(
    (path) => `https://www.a.example.com${path}`,
  );
  assert.deepEqual(pickPages("https://a.example.com", urls, 5), [
    { url: "https://a.example.com/about", why: "about" },
    { url: "https://a.example.com/writing/one", why: "detail" },
    { url: "https://a.example.com/writing", why: "list" },
    { url: "https://a.example.com/books/a", why: "detail" },
    { url: "https://a.example.com/books", why: "list" },
  ]);
});
