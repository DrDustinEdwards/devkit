import ts from "typescript";

export { ts };

/** The file as a syntax tree; .tsx/.jsx is TSX, .mjs/.js is JS, anything else TS. */
export function parseSource(fileName: string, text: string): ts.SourceFile;

/** Every read of one of `names` off an object: `x.N`, `x["N"]`, `{ N }`. */
export function propertyReads(
  sf: ts.SourceFile,
  names: ReadonlySet<string>,
): Array<{ name: string; line: number }>;

/** The member names of every `interface NAME` in the file, merged. */
export function interfaceMembers(
  sf: ts.SourceFile,
  interfaceName: string,
): { found: boolean; members: Set<string> };

/** The exported `action` of a route module, or null. */
export function findAction(sf: ts.SourceFile): ts.Node | null;

/** Every intent the action branches on, and whether that branch calls `predicate`. */
export function intentBranches(
  action: ts.Node,
  predicate: string,
): Array<{ intent: string; guarded: boolean; reason?: string }>;

/** The object literal a top-level const is initialized with, or null. */
export function objectConst(
  sf: ts.SourceFile,
  constName: string,
): ts.ObjectLiteralExpression | null;

/** The string elements of a top-level const array, or null. */
export function stringArrayConst(sf: ts.SourceFile, constName: string): string[] | null;

/** The initializer of `key` in an object literal, or null. */
export function propertyValue(obj: ts.ObjectLiteralExpression, key: string): ts.Expression | null;

/** True for a non-empty string literal. */
export function isLiteralString(expr: ts.Expression | null): boolean;

/** How a file reaches `binding` (env.X, env["X"], an alias): its mentions, `.delete(` calls and callees it is passed to. */
export function bindingUses(
  sf: ts.SourceFile,
  binding: string,
): { mentions: number; deletes: string[]; passedTo: string[] };
