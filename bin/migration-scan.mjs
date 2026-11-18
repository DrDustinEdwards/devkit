// The migration reader: what a D1 migration file does, with its comments, string literals and quoted names blanked. Pure
// (no node imports), so a Worker can import it as well as the devkit-migrations CLI: Capsid's gate policy reads a
// migration through this, so the two can never disagree about one file.

/** @type {[RegExp, string][]} */
const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\b/i, "drops a table"],
  [/\bALTER\s+TABLE\s+[^;]*?\bDROP\b/i, "drops a column"],
  [/\bALTER\s+TABLE\s+[^;]*?\bRENAME\b/i, "renames a table or column"],
  [/\bDROP\s+(?:INDEX|VIEW|TRIGGER)\b/i, "drops an index, view or trigger"],
  [/(?:^|;|\bDO)\s*UPDATE\b[^;]*?\bSET\b/i, "updates rows"],
  [/\bINSERT\s+OR\s+REPLACE\b|\bREPLACE\s+INTO\b/i, "replaces rows"],
  [/\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bPRAGMA\s+writable_schema\b/i, "edits the schema table directly"],
];

/**
 * The SQL with its comments, string literals and quoted identifiers blanked (an apostrophe inside "a'b", `a'b` or [a'b] is
 * part of the name, not the start of a string), and whether a `-- contract: <reason>` line comment starts a line. A marker
 * inside a block comment or a string is neither.
 * @param {string} sql
 * @returns {{ code: string, marked: boolean }}
 */
function scan(sql) {
  let code = "";
  let marked = false;
  let lineStart = true;
  for (let i = 0; i < sql.length;) {
    const c = sql[i];
    const close = c === "'" || c === '"' || c === "`" ? c : c === "[" ? "]" : "";
    if (close) {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === close) {
          if (close !== "]" && sql[j + 1] === close) j += 2;
          else break;
        } else j++;
      }
      code += " _ ";
      i = j + 1;
      lineStart = false;
    } else if (c === "-" && sql[i + 1] === "-") {
      let j = sql.indexOf("\n", i);
      if (j < 0) j = sql.length;
      if (lineStart && /^--\s*contract:\s*\S/i.test(sql.slice(i, j))) marked = true;
      code += " ";
      i = j;
    } else if (c === "/" && sql[i + 1] === "*") {
      const j = sql.indexOf("*/", i + 2);
      code += " ";
      i = j < 0 ? sql.length : j + 2;
      lineStart = false;
    } else {
      code += c;
      if (c === "\n") lineStart = true;
      else if (!/\s/.test(c)) lineStart = false;
      i++;
    }
  }
  // A trigger's body runs when a row changes, not when the migration does: it is not read.
  code = code.replace(
    /\bCREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b[\s\S]*?\bBEGIN\b[\s\S]*?\bEND\s*;/gi,
    " ",
  );
  return { code, marked };
}

const findings = (/** @type {string} */ code) =>
  DESTRUCTIVE.filter(([pattern]) => pattern.test(code)).map(([, what]) => what);

/**
 * What a migration does beyond adding, read with its comments and string literals blanked; empty when it only adds or
 * carries a `-- contract: <reason>` line.
 * @param {string} sql
 * @returns {string[]}
 */
export function contractions(sql) {
  const { code, marked } = scan(sql);
  return marked ? [] : findings(code);
}

/**
 * Why a pending migration must be applied by a person rather than by the deploy; empty when it only adds. Stricter than
 * `contractions`: a `-- contract:` line makes a migration reviewable, not safe to run unattended.
 * @param {string} sql
 * @returns {string[]}
 */
export function handOnly(sql) {
  const { code, marked } = scan(sql);
  return [...(marked ? ["says `-- contract:`"] : []), ...findings(code)];
}

/**
 * The statements of a migration, in the same blanked form `scan` reads (a string or quoted name is `_`), so a `;` inside
 * a string never splits one and a comment never hides one. Empty statements are dropped.
 * @param {string} sql
 * @returns {string[]}
 */
export function statements(sql) {
  return scan(sql)
    .code.split(";")
    .map((statement) => statement.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
