// The judging half of devkit-a11y (bin/a11y.mjs): which pages to scan, and what the browser's measurements of them prove,
// as findings titled with the accessibility checklist item each one proves. Pure, so its test needs no browser.
//
//   L1 axe (WCAG 2.2 A and AA: error; best practice: warning)   L2 keyboard: skip link, focus visible, focus covered, trap
//   L3 reflow at 320 px and text spacing                         L4 animations still running under reduced motion
//   S2 page structure: lang, title, one h1, heading skips, landmarks   S3 image alt   S6 the /accessibility statement

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Tab presses on one element in a row before the walk calls it a trap; fewer is focus moving inside an iframe. */
export const TRAP_PRESSES = 10;

/**
 * Up to `max` sitemap pages of different types: about, contact and sign-in first, then detail and list pages alternately,
 * one detail page per section. Only the origin's own pages: anything with a file extension other than .html is an asset.
 * @param {string} origin @param {string[]} urls @param {number} max @returns {{ url: string, why: string }[]}
 */
export function pickPages(origin, urls, max) {
  const host = new URL(origin).host.replace(/^www\./, "");
  const seen = new Set(["/"]);
  const candidates = [];
  for (const raw of urls) {
    let url;
    try {
      url = new URL(raw, origin);
    } catch {
      continue;
    }
    if (url.host.replace(/^www\./, "") !== host || /\.(?!html?$)[a-z0-9]{1,5}$/i.test(url.pathname) || url.pathname.startsWith("/cdn-cgi/")) continue;
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (seen.has(path)) continue;
    seen.add(path);
    candidates.push({ url: `${origin}${url.pathname}`, path, segments: path.split("/").filter(Boolean) });
  }
  const chosen = new Map();
  const take = (candidate, why) => {
    if (candidate && !chosen.has(candidate) && chosen.size < max) chosen.set(candidate, why);
  };
  for (const [pattern, why] of [[/about/i, "about"], [/contact/i, "contact"], [/(^|\/)(sign-?in|log-?in|account|auth)(\/|$)/i, "sign-in"]]) {
    take(candidates.find((c) => pattern.test(c.path) && c.segments.length <= 2), why);
  }
  const lists = candidates.filter((c) => c.segments.length === 1 && !chosen.has(c));
  const sections = new Set();
  const details = candidates.filter((c) => c.segments.length >= 2 && !sections.has(c.segments[0]) && sections.add(c.segments[0]));
  for (let i = 0; i < Math.max(lists.length, details.length); i++) {
    take(details[i], "detail");
    take(lists[i], "list");
  }
  for (const c of candidates) take(c, c.segments.length === 1 ? "list" : "detail");
  return [...chosen].map(([c, why]) => ({ url: c.url, why }));
}

/** Whether a focused element looks different from itself unfocused: an outline that paints, or any other style changed. */
export function focusVisible(/** @type {Record<string, string>} */ focused, /** @type {Record<string, string> | undefined} */ unfocused) {
  const outline = focused.outline ?? "";
  const outlinePaints = !/^none/.test(outline) && !/ 0px /.test(`${outline} `) && !/rgba\(\d+, \d+, \d+, 0\)$/.test(outline);
  return outlinePaints || Object.keys(focused).some((key) => key !== "outline" && unfocused !== undefined && focused[key] !== unfocused[key]);
}

/**
 * @typedef {{ severity: "error" | "warning", item: string, url: string, detail: string }} Finding
 * @typedef {{ id: string, impact?: string, tags: string[], nodes: number, target: string }} AxeViolation
 * @typedef {object} PageScan
 * @property {string} url as loaded
 * @property {string} why home, 404, about, list, detail...
 * @property {number} [status]
 * @property {string} [error] why the page could not be scanned
 * @property {{ lang: string | null, title: string | null, h1: number, headings: { level: number, sel: string }[],
 *   landmarks: { main: number, banner: number, nav: number, contentinfo: number }, imgNoAlt: string[] }} [basics]
 * @property {Record<string, AxeViolation[] | { error: string }>} [axe] per view ("1440-light")
 * @property {object[]} [keyboard] one entry per Tab press: { body: true }, or the focused element's sel, text, same (the
 *   element the press before focused), focused and unfocused styles, covered ({ by, position }), offscreen, skipTargetsMain
 * @property {{ scrollWidth: number, clientWidth: number, widest?: { sel: string, right: number } | null }} [reflow]
 * @property {{ sel: string, dir: string }[]} [clipped] text clipped once WCAG 1.4.12 spacing is applied, and not before
 * @property {{ name: string, target: string, duration: number | string, iterations: number | string }[]} [motion]
 *   animations running 1.5 s after load with prefers-reduced-motion: reduce
 */

/**
 * Every finding the scans of one site prove.
 * @param {{ statement: { url: string, status: number }, pages: PageScan[] }} site
 * @returns {Finding[]}
 */
export function judgeSite({ statement, pages }) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (severity, item, url, detail) => findings.push({ severity, item, url, detail });
  const titles = new Map();
  for (const page of pages) {
    const { url } = page;
    if (page.error) {
      add("warning", "L1", url, `could not be scanned: ${page.error}`);
      continue;
    }
    judgeAxe(page, add);
    judgeKeyboard(page, add);
    if (page.reflow && page.reflow.scrollWidth > page.reflow.clientWidth) {
      const w = page.reflow.widest;
      add("error", "L3", url, `scrolls sideways at 320 px: scrollWidth ${page.reflow.scrollWidth}${w ? `, widest \`${w.sel}\` reaches ${w.right} px` : ""}`);
    }
    if (page.clipped?.length) add("error", "L3", url, `text clipped with WCAG 1.4.12 text spacing: ${list(page.clipped.map((c) => `\`${c.sel}\` (${c.dir})`))}`);
    const moving = (page.motion ?? []).filter((a) => a.iterations === "infinite" || a.duration === "auto" || Number(a.duration) > 50);
    if (moving.length) add("error", "L4", url, `animations still running with reduced motion: ${list(moving.map((a) => `${a.name} on \`${a.target}\``))}`);
    const b = page.basics;
    if (!b) continue;
    if (!b.lang) add("error", "S2", url, "no lang on <html>");
    if (!b.title) add("error", "S2", url, "no <title>");
    else if (page.why !== "404") titles.set(b.title, [...(titles.get(b.title) ?? []), url]);
    if (b.h1 !== 1) add("warning", "S2", url, `${b.h1} h1 elements, not one`);
    const skips = headingSkips(b.headings);
    if (skips.length) add("warning", "S2", url, `heading levels skipped: ${list(skips)}`);
    const l = b.landmarks;
    if (l.main !== 1 || !l.banner || !l.nav || !l.contentinfo) {
      add("warning", "S2", url, `landmarks: main ${l.main}, header ${l.banner}, nav ${l.nav}, footer ${l.contentinfo}; each page needs one main and a header, nav and footer`);
    }
    if (b.imgNoAlt.length) add("error", "S3", url, `images with no alt: ${list(b.imgNoAlt.map((sel) => `\`${sel}\``))}`);
  }
  for (const [title, urls] of titles) if (urls.length > 1) for (const url of urls.slice(1)) add("warning", "S2", url, `the title "${title}" is also ${urls[0]}'s`);
  if (statement.status !== 200) add("error", "S6", statement.url, `no accessibility statement: it answers ${statement.status || "nothing"}`);
  return findings;
}

/** One annotation per axe rule a page breaks, with every view (width and color scheme) it breaks in. */
function judgeAxe(/** @type {PageScan} */ page, add) {
  const rules = new Map();
  for (const [view, result] of Object.entries(page.axe ?? {})) {
    if (!Array.isArray(result)) {
      add("warning", "L1", page.url, `axe could not run at ${view}: ${result.error}`);
      continue;
    }
    for (const v of result) {
      const rule = rules.get(v.id) ?? { v, views: [], nodes: 0 };
      rule.views.push(view);
      rule.nodes = Math.max(rule.nodes, v.nodes);
      rules.set(v.id, rule);
    }
  }
  for (const [id, { v, views, nodes }] of rules) {
    const wcag = v.tags.some((tag) => WCAG_TAGS.includes(tag));
    add(wcag ? "error" : "warning", "L1", page.url, `axe ${id} (${v.impact ?? "no impact"}, ${wcag ? "WCAG" : "best practice"}) at ${views.join(", ")}: ${nodes} element${nodes === 1 ? "" : "s"}, first \`${v.target}\``);
  }
}

/** The Tab walk: a skip link to main first, a visible focus change at every stop, nothing fixed over it, and no trap. */
function judgeKeyboard(/** @type {PageScan} */ page, add) {
  const presses = page.keyboard;
  if (!presses) return;
  // A run of presses on one element is focus inside something the page cannot see into (an iframe, a closed shadow root);
  // those stops are not judged for focus, and a long enough run is a trap.
  const opaque = new Set();
  let run = 0;
  let trap = null;
  presses.forEach((stop, i) => {
    run = stop.same ? run + 1 : 0;
    if (stop.same) opaque.add(i).add(i - 1);
    if (run + 1 >= TRAP_PRESSES && !trap) trap = stop.sel;
  });
  const stops = presses.map((stop, i) => ({ ...stop, i })).filter((stop) => !stop.body);
  const first = stops[0];
  if (!(first && first.i === 0 && first.skipTargetsMain)) {
    add("error", "L2", page.url, `no skip link to main as the first Tab stop (first stop ${first ? `\`${first.sel}\` "${first.text}"` : "none: nothing takes focus"})`);
  }
  const unseen = stops.filter((stop) => !opaque.has(stop.i) && !stop.offscreen && !focusVisible(stop.focused, stop.unfocused));
  if (unseen.length) add("error", "L2", page.url, `no visible focus on ${unseen.length} of ${stops.length} stops: ${list(unseen.map((s) => `\`${s.sel}\``))}`);
  const covered = stops.filter((stop) => stop.covered);
  const under = covered.filter((stop) => stop.covered.position);
  if (under.length) add("error", "L2", page.url, `focus hidden under ${under[0].covered.position} \`${under[0].covered.by}\` on ${under.length} stops: ${list(under.map((s) => `\`${s.sel}\``))}`);
  if (covered.length > under.length) {
    const other = covered.filter((stop) => !stop.covered.position);
    add("warning", "L2", page.url, `focused element covered by another on ${other.length} stops: ${list(other.map((s) => `\`${s.sel}\` by \`${s.covered.by}\``))}`);
  }
  if (trap) add("error", "L2", page.url, `focus trap: ${TRAP_PRESSES} Tab presses stayed on \`${trap}\``);
}

/** Each place the heading level jumps by more than one, and a first heading below h2. */
export function headingSkips(/** @type {{ level: number, sel: string }[]} */ headings) {
  const skips = headings.length && headings[0].level > 2 ? [`starts at h${headings[0].level}`] : [];
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) skips.push(`h${headings[i - 1].level} to h${headings[i].level} at \`${headings[i].sel}\``);
  }
  return skips;
}

const list = (/** @type {string[]} */ items) => items.slice(0, 3).join(", ") + (items.length > 3 ? ` and ${items.length - 3} more` : "");

/** A finding as a GitHub annotation line, its detail on one line. */
export function annotation(/** @type {Finding} */ { severity, item, url, detail }) {
  return `::${severity} title=${item}::${url} ${detail.replace(/%/g, "%25").replace(/\s+/g, " ")}`;
}
