/** The breach detail, or null when `executed` reaches `minimum` (a non-finite count is a breach). */
export function assertFloor(
  gate: string,
  name: string,
  executed: number,
  minimum: number,
  why?: string,
): string | null;

export interface Tally {
  /** Counts a check; prints and records it as failed when `condition` is false. Label first. */
  ok(label: string, condition: boolean, detail?: string): void;
  /** `ok` on a JSON comparison. */
  eq(label: string, actual: unknown, expected: unknown): void;
  /** Records a failure found outside `ok`, without counting a check. */
  fail(text: string): void;
  /** The whole-gate floor, failed as one more check. */
  floor(gate: string, name: string, minimum: number, why?: string, label?: string): string | null;
  readonly failed: string[];
  readonly checks: number;
  readonly failures: number;
}

export function createTally(style?: {
  separator?: string;
  blankLine?: boolean;
  printPass?: boolean;
  print?: boolean;
}): Tally;

/** Every file under `dir`, depth first in directory order, as absolute paths. */
export function walkFiles(
  dir: string,
  options?: { keep?: (name: string) => boolean; skipDir?: (name: string) => boolean },
): string[];

/** One value from `.dev.vars` under `root` (default the working directory), or null. */
export function readDevVar(name: string, options?: { root?: string }): string | null;

/** True when `importMetaUrl` (the caller's `import.meta.url`) is the script Node was started with, symlinks resolved. */
export function isMain(importMetaUrl: string): boolean;
