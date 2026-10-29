// The dev toolbar's browser half (dev-toolbar.mjs serves it at /@devkit/toolbar.js in `vite dev` only; nothing of it
// reaches a built site). Three apps, as Astro's dev toolbar has:
// - Inspect: outlines every island (data-island, islands.mjs) with its name, when it starts, its props and whether it
//   has started.
// - Audit: accessibility, by axe-core (the engine the family's browser tests already run, so dev and CI agree), and
//   performance, by Astro's rules: an image with no srcset, lazy above the fold, eager below it, a large GIF, and an
//   island slow to start.
// - Settings: where the bar sits, and hiding it until the next load.
//
// The app set, the audit's performance rules, the highlights and the settings are Astro's
// (packages/astro/src/runtime/client/dev-toolbar, Astro 7.4), under its MIT license:
//
//   Copyright (c) 2021 Fred K. Schott
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
//   Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
//   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const SETTINGS_KEY = "devkit:dev-toolbar";
const PLACEMENTS = ["bottom-left", "bottom-center", "bottom-right"];
const EXTERNAL = /^(?:[a-z+]+:)?\/\//i;

function readSettings() {
  try {
    return { placement: "bottom-center", ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return { placement: "bottom-center" };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private windows refuse storage; the setting lasts until the page reloads.
  }
}

/** How far down the document an element starts, as Astro's loading rules measure it. */
function documentTop(el) {
  let y = 0;
  for (let at = el; at; at = at.offsetParent) y += at.offsetTop;
  return y;
}

async function bytesOf(src) {
  return (await (await fetch(src)).blob()).size;
}

// Astro's performance rules, for a site whose images come from site-runtime's ./image.
const PERF_RULES = [
  {
    code: "perf-responsive-image",
    title: "Serve this image in sizes",
    message: "This image has no srcset. A large one could come from site-runtime's ./image, in AVIF and WebP at the sizes the page needs.",
    selector: "img:not([srcset])",
    async match(el) {
      const src = el.getAttribute("src");
      if (!src || src.startsWith("data:") || el.closest("picture source[srcset]")) return false;
      if (src.endsWith(".svg")) return false;
      // Under 20 KB a srcset gains nothing; remote images are not fetched, as in Astro.
      return EXTERNAL.test(src) || (await bytesOf(src)) >= 20480;
    },
  },
  {
    code: "perf-use-loading-lazy",
    title: "Lazy-load this image",
    message: (el) => `This ${el.localName} is below the fold and could be lazy-loaded.`,
    selector: 'img:not([loading]), img[loading="eager"], iframe:not([loading]), iframe[loading="eager"]',
    match: (el) => documentTop(el) >= window.innerHeight && !el.src.startsWith("data:"),
  },
  {
    code: "perf-use-loading-eager",
    title: "Load this image at once",
    message: (el) => `This ${el.localName} is above the fold and lazy, which delays it; it could load eagerly.`,
    selector: 'img[loading="lazy"], iframe[loading="lazy"]',
    match: (el) => documentTop(el) < window.innerHeight && !el.src.startsWith("data:"),
  },
  {
    code: "perf-use-videos",
    title: "Use a video for this animation",
    message: "This GIF is over 100 KB; a video of it would be a fraction of the size.",
    selector: 'img[src$=".gif"]',
    match: async (el) => !EXTERNAL.test(el.getAttribute("src") ?? "") && (await bytesOf(el.getAttribute("src"))) >= 102400,
  },
  {
    code: "perf-slow-island",
    title: "This island took long to start",
    message: (el) => `"${el.dataset.island}" took ${el.dataset.islandMs} ms from loading its module to running it. Something may be blocking the main thread.`,
    selector: "[data-island][data-island-ms]",
    match: (el) => Number(el.dataset.islandMs) > 500,
  },
];

const text = (value, el) => (typeof value === "function" ? value(el) : value);

async function perfFindings() {
  const found = [];
  for (const rule of PERF_RULES) {
    for (const el of document.querySelectorAll(rule.selector)) {
      if (el.closest("devkit-dev-toolbar")) continue;
      try {
        if (await rule.match(el)) found.push({ el, code: rule.code, title: rule.title, message: text(rule.message, el) });
      } catch (error) {
        console.warn(`dev toolbar: rule ${rule.code} failed`, error);
      }
    }
  }
  return found;
}

async function a11yFindings() {
  if (!window.axe) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/@devkit/axe.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      });
    } catch {
      return { missing: true, found: [] };
    }
  }
  const results = await window.axe.run(document, { exclude: [["devkit-dev-toolbar"]], resultTypes: ["violations"] });
  const found = [];
  for (const v of results.violations) {
    for (const node of v.nodes) {
      // A target inside a shadow root is an array of selectors; axe's exclude misses the toolbar's own, so skip them.
      if (node.target.some((t) => Array.isArray(t))) continue;
      const el = document.querySelector(node.target.join(" "));
      if (el) found.push({ el, code: `a11y-${v.id}`, title: v.help, message: node.failureSummary ?? v.description, link: v.helpUrl });
    }
  }
  return { missing: false, found };
}

const STYLE = `
:host { all: initial; position: fixed; z-index: 2147483647; inset: 0; pointer-events: none; font: 13px/1.4 system-ui, sans-serif; color: #f4f4f6; }
.bar { position: absolute; bottom: 12px; display: flex; gap: 2px; padding: 4px; background: #17151c; border: 1px solid #3c3846; border-radius: 10px; pointer-events: auto; box-shadow: 0 6px 24px #0006; }
.bar[data-at="bottom-left"] { left: 12px; } .bar[data-at="bottom-right"] { right: 12px; } .bar[data-at="bottom-center"] { left: 50%; translate: -50% 0; }
button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 6px; color: inherit; }
button:hover, button[aria-pressed="true"] { background: #2d2936; } button:focus-visible { outline: 2px solid #c09eff; outline-offset: 1px; }
.count { margin-left: 6px; padding: 0 6px; border-radius: 9px; background: #b33; font-size: 11px; }
.panel { position: absolute; bottom: 64px; left: 50%; translate: -50% 0; width: min(560px, calc(100vw - 32px)); max-height: 50vh; overflow: auto; padding: 12px 14px; background: #17151c; border: 1px solid #3c3846; border-radius: 10px; pointer-events: auto; }
.panel h2 { margin: 0 0 8px; font-size: 14px; } .panel ol { margin: 0; padding-left: 18px; } .panel li { margin: 0 0 8px; }
.panel li b { display: block; } .panel code { font: 12px ui-monospace, monospace; color: #d8c7ff; } .panel a { color: #c6b1f2; }
.hl { position: absolute; border: 2px solid #c09eff; background: #c09eff22; border-radius: 4px; pointer-events: none; }
.hl[data-kind="a11y"] { border-color: #ff6b6b; background: #ff6b6b1f; } .hl[data-kind="perf"] { border-color: #f0b429; background: #f0b4291f; }
.hl span { position: absolute; top: -20px; left: -2px; padding: 1px 6px; background: #17151c; border-radius: 4px; font-size: 11px; white-space: nowrap; }
select { font: inherit; }
`;

class DevToolbar extends HTMLElement {
  connectedCallback() {
    this.settings = readSettings();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLE}</style><div class="hls"></div><div class="panel" hidden></div>
      <div class="bar" role="toolbar" aria-label="Dev toolbar" data-at="${this.settings.placement}">
        <button data-app="inspect" aria-pressed="false">Inspect</button>
        <button data-app="audit" aria-pressed="false">Audit<span class="count" hidden></span></button>
        <button data-app="settings" aria-pressed="false">Settings</button>
      </div>`;
    this.panel = this.root.querySelector(".panel");
    this.hls = this.root.querySelector(".hls");
    for (const b of this.root.querySelectorAll("[data-app]")) b.addEventListener("click", () => this.toggle(b.dataset.app));
    this.addEventListener("keydown", (e) => e.key === "Escape" && this.toggle(null));
    addEventListener("resize", () => this.place());
    addEventListener("scroll", () => this.place(), { passive: true });
    // The audit runs once on load so its count shows without a click, as Astro's does.
    setTimeout(() => this.audit(false), 1000);
  }

  toggle(app) {
    const open = this.open === app ? null : app;
    this.open = open;
    for (const b of this.root.querySelectorAll("[data-app]")) b.setAttribute("aria-pressed", String(b.dataset.app === open));
    this.panel.hidden = !open;
    this.highlights = [];
    this.place();
    if (open === "inspect") this.inspect();
    if (open === "audit") this.audit(true);
    if (open === "settings") this.showSettings();
  }

  /** Draws each highlight over its element, in document coordinates turned to the viewport's. */
  place() {
    this.hls.replaceChildren(
      ...(this.highlights ?? []).map(({ el, label, kind }) => {
        const r = el.getBoundingClientRect();
        const box = document.createElement("div");
        box.className = "hl";
        box.dataset.kind = kind;
        Object.assign(box.style, { top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` });
        const tag = document.createElement("span");
        tag.textContent = label;
        // At the top of the viewport the label goes inside the box, where it can be read.
        if (r.top < 20) tag.style.top = "0";
        box.append(tag);
        return box;
      }),
    );
  }

  inspect() {
    const islands = [...document.querySelectorAll("[data-island]")];
    this.highlights = islands.map((el) => ({ el, label: `${el.dataset.island} · ${el.dataset.client ?? "load"}`, kind: "island" }));
    this.place();
    this.panel.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = islands.length ? `${islands.length} island${islands.length === 1 ? "" : "s"} on this page` : "No islands on this page";
    const list = document.createElement("ol");
    for (const el of islands) {
      const li = document.createElement("li");
      const name = document.createElement("b");
      name.textContent = `${el.dataset.island} (${el.dataset.client ?? "load"}) ${"islandReady" in el.dataset ? "started" : "not started yet"}`;
      const props = document.createElement("code");
      props.textContent = el.dataset.props ?? "{}";
      li.append(name, props);
      li.addEventListener("mouseenter", () => el.scrollIntoView({ block: "nearest" }));
      list.append(li);
    }
    this.panel.append(h, list);
  }

  async audit(show) {
    const [a11y, perf] = await Promise.all([a11yFindings(), perfFindings()]);
    const found = [...a11y.found.map((f) => ({ ...f, kind: "a11y" })), ...perf.map((f) => ({ ...f, kind: "perf" }))];
    const count = this.root.querySelector(".count");
    count.hidden = found.length === 0;
    count.textContent = String(found.length);
    if (!show || this.open !== "audit") return;
    this.highlights = found.map((f) => ({ el: f.el, label: f.title, kind: f.kind }));
    this.place();
    this.panel.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = found.length ? `${found.length} to look at` : "Nothing to fix on this page";
    const list = document.createElement("ol");
    for (const f of found) {
      const li = document.createElement("li");
      const title = document.createElement("b");
      title.textContent = `${f.kind === "a11y" ? "Accessibility" : "Performance"}: ${f.title}`;
      const msg = document.createElement("span");
      msg.textContent = ` ${f.message} `;
      li.append(title, msg);
      if (f.link) {
        const a = document.createElement("a");
        a.href = f.link;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = "Why";
        li.append(a);
      }
      li.addEventListener("mouseenter", () => f.el.scrollIntoView({ block: "nearest" }));
      list.append(li);
    }
    this.panel.append(h, list);
    if (a11y.missing) {
      const note = document.createElement("p");
      note.textContent = "Accessibility is not checked: install axe-core in this site (npm i -D axe-core) so /@devkit/axe.js can serve it.";
      this.panel.append(note);
    }
  }

  showSettings() {
    this.panel.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = "Settings";
    const label = document.createElement("label");
    label.textContent = "Place the bar ";
    const select = document.createElement("select");
    for (const p of PLACEMENTS) select.append(new Option(p.replace("-", " "), p, false, p === this.settings.placement));
    select.addEventListener("change", () => {
      this.settings.placement = select.value;
      saveSettings(this.settings);
      this.root.querySelector(".bar").dataset.at = select.value;
    });
    label.append(select);
    const hide = document.createElement("button");
    hide.textContent = "Hide until the page reloads";
    hide.addEventListener("click", () => this.remove());
    this.panel.append(h, label, document.createElement("br"), hide);
  }
}

if (!customElements.get("devkit-dev-toolbar")) {
  customElements.define("devkit-dev-toolbar", DevToolbar);
  document.body.append(document.createElement("devkit-dev-toolbar"));
}
