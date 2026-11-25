# Verifying a change before the pull request

The shared part of every repo's `.claude/skills/verify/SKILL.md`. A repo's skill holds what is its own: how to boot it, the flows and selectors, the specs that cover each area and what a local run cannot show. This page holds the rest.

Tests prove what someone thought to test. Verifying proves the change itself: run the real app, use the changed flow as its user would, and look at the result.

## The driver

Write the script in the session's scratchpad, never in the repo. Name each step the way a person would say it, act through roles and labels, and assert what the person should see afterward. Start from these helpers (Playwright shown; Puppeteer is the same with its own `page`):

```js
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const log = [];
async function step(name, fn) {
  try {
    await fn();
    log.push(`ok   ${name}`);
  } catch (e) {
    log.push(`FAIL ${name}: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: "fail.png", fullPage: true });
    throw e;
  }
}
// ...steps, then: await page.screenshot({ path: "after.png", fullPage: true });
// in a finally block:
//   console.log(log.join("\n"));
//   console.log("console errors:", errors.length ? errors : "none");
//   await browser.close();
```

Run it from the scratchpad so `fail.png` and `after.png` land there. Drive the whole flow, not just the page load: open the dialog, submit the form, see the result change, reload and see it hold. If the change is responsive or themed, repeat the end state at 390 px wide and in dark mode (`page.setViewportSize`, `page.emulateMedia({ colorScheme: "dark" })`); for motion add `reducedMotion: "reduce"`. If it must work without script, run once more with JavaScript off (`browser.newContext({ javaScriptEnabled: false })`).

In a cloud session Chromium is preinstalled. If launch fails with "Executable doesn't exist" because the repo's Playwright build does not match it, set `PW_CHROMIUM=/opt/pw-browsers/chromium` and pass it as `executablePath`. Puppeteer reads `PUPPETEER_EXECUTABLE_PATH`. Never run `playwright install`.

Servers: confirm the port is free before you start one, and confirm the page title names this app, because a 200 from a port you did not start may be another repo's server. Stop yours by its process id or its port (`--strictPort`), never `pkill` by name.

## Rules

- A failed step is a finding about the change. Fix the code, then run the same script again. Never add a sleep, a retry or a looser selector to make it pass.
- If a step fails sometimes, find out why before going on; a flaky check teaches the next thread to re-run instead of fix.
- Never edit an existing test or spec to make it agree with new behavior unless the change is meant to alter that behavior, and say so in the pull request.
- Leave nothing behind: stop the server, and keep scripts and screenshots in the scratchpad. Nothing from verifying is committed.

## The report

Put this in the reply and the pull request body:

- First line: verified, partly verified (and what was not), or failed.
- Each step's ok or FAIL line, verbatim, and the console errors line.
- The end-state screenshot, attached (Dustin cannot open a scratchpad path).
- The summary line of each spec or test run.
- Anything a local run cannot show, named as not verified, with the live check that follows the merge (the repo's skill says which).
