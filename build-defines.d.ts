// The constants a build writes into the code it bundles, for the type check only (tsconfig.json); never shipped.

/** Each island's content-hashed URL, which siteScript writes into a built /site.js (vite/site-script.mjs, vite/islands.mjs). */
declare const __DEVKIT_ISLANDS__: Record<string, string> | undefined;

/** The helpers bin/a11y.mjs injects into every page it measures (SELECTOR and STYLE), for the type check only. */
interface Window {
  __sel(el: Element | null | undefined): string;
  __style(el: Element): Record<string, string>;
}

interface Window {
  /** axe-core, which the dev toolbar loads from /@devkit/axe.js when the site installs it. */
  axe?: {
    run(
      context: Document,
      options: object,
    ): Promise<{
      violations: {
        id: string;
        help: string;
        description: string;
        helpUrl: string;
        nodes: { target: unknown[]; failureSummary?: string }[];
      }[];
    }>;
  };
}
