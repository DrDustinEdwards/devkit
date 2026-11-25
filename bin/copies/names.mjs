import { exportNames } from "../shared/core.mjs";
import { PACKAGES, distinctive } from "../shared/copies.mjs";

/** The shared packages' repositories: a name one of them exports is devkit-shared's copies check to judge, by its catalog. */
const PACKAGE_REPOS = new Set(PACKAGES.map((p) => p.repo));

/** The exports React Router reads from a route module by name: every app has them, by design. */
const ROUTE_EXPORTS = new Set([
  "clientLoader",
  "clientAction",
  "shouldRevalidate",
  "HydrateFallback",
  "ErrorBoundary",
]);

/**
 * What defines nothing of its own: a re-export (`export { x } from "..."`; `export { x }` of an import is importedNames),
 * and a Drizzle table, which mirrors in each app's schema the SQL a shared package ships (site-api's media and store
 * tables), so the same table name in two apps is the shared schema, not a second job.
 */
const NOT_OWN =
  /export\s*(?:type\s*)?\{[^}]*\}\s*from\s*["'][^"']+["']|export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*(?:sqliteTable|pgTable|mysqlTable)\s*\(/g;

/** The names a module imports: what `export { x }` then passes on, which defines nothing. */
const importedNames = (/** @type {string} */ text) =>
  new Set(
    [...text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from/g)].flatMap(
      (m) => m[1].match(/[\w$]+/g) ?? [],
    ),
  );

/**
 * Distinctive names (devkit-shared's rule) that two or more repositories each define and export, none of them a shared
 * package: the same job written twice under one name, which jscpd misses when the code differs. With `packages`, the
 * other way round: names two or more shared packages each export, which is overlap between the packages themselves (the
 * same job in site-api and Prelum, say), the one place a name check over the sites cannot see. Pure.
 * @param {{ repo: string, path: string, text: string }[]} files code files
 * @param {boolean} [packages] read the shared packages' repositories instead of the others
 */
export function sharedNames(files, packages = false) {
  /** @type {Map<string, Map<string, string>>} name -> repo -> its first path */
  const defined = new Map();
  for (const { repo, path, text } of files) {
    if (PACKAGE_REPOS.has(repo) !== packages) continue;
    const imported = importedNames(text);
    for (const name of exportNames(text.replace(NOT_OWN, ""))) {
      if (!distinctive(name) || ROUTE_EXPORTS.has(name) || imported.has(name)) continue;
      const repos = defined.get(name) ?? new Map();
      if (!repos.has(repo)) repos.set(repo, path);
      defined.set(name, repos);
    }
  }
  return [...defined]
    .filter(([, repos]) => repos.size > 1)
    .map(([name, repos]) => ({
      name,
      places: [...repos]
        .map(([repo, path]) => ({ repo, path }))
        .sort((a, b) => a.repo.localeCompare(b.repo)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
