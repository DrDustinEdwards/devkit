import { SOURCE, excused } from "./config.mjs";
import { blankComments } from "./copies.mjs";
/** @import { Finding, Tree, Config } from "./config.mjs" */

const TEST = /(^|\/)(test|tests|e2e|__tests__|test-integration)\/|\.(test|spec)\.[mc]?[jt]sx?$/;
const FETCH_SWAP = String.raw`(?:globalThis\.fetch\s*=|stubGlobal\(\s*["'\x60]fetch["'\x60]\s*,|defineProperty\(\s*globalThis\s*,\s*["'\x60]fetch["'\x60]\s*,\s*\{\s*value\s*:|spyOn\(\s*globalThis\s*,\s*["'\x60]fetch["'\x60]\s*\)\s*\.mock\w*\()`;
const DELETE_ALL = String.raw`DELETE FROM\s+["'\x60]?[\w$]+["'\x60]?(?=\s*(?:["'\x60;),]|$))`;

/** Test fakes of a repository's own where devkit has one: every pattern in `find` matches the test file. */
const FAKES = [
  // GitHub's contents or git data routes answered behind a fetch stub.
  {
    find: [
      /\/repos\/[^\s"'`]*\/(?:git\/(?:refs?|trees|commits|blobs)|contents)\b/,
      new RegExp(FETCH_SWAP),
    ],
    use: "devkit ./github stubGitHub",
    say: "a GitHub API fake of its own",
  },
  // An RSA key pair made here and a key set served from it: an Access issuer of its own.
  {
    find: [
      /generateKey\(\s*\{\s*name\s*:\s*["'`]RSASSA-PKCS1-v1_5|generateKeyPair(?:Sync)?\(\s*["'`](?:RS256|rsa)["'`]/,
      /cdn-cgi\/access\/certs|\bjwks\b|["']?keys["']?\s*:\s*\[\s*(?:\{\s*\.\.\.)?\s*\w*[jJ]wk\b/,
    ],
    use: "devkit ./access stubAccess",
    say: "an Access fake of its own (a key pair it signs with and the key set it serves)",
  },
  // A fetch whose whole body throws an error naming the URL.
  {
    find: [
      new RegExp(
        `${FETCH_SWAP}\\s*(?:vi\\.fn\\(\\s*)?(?:async\\s*)?(?:function\\s*)?\\(?[^)]*\\)?\\s*(?::\\s*[\\w<>]+\\s*)?(?:=>)?\\s*\\{?\\s*(?:throw\\s+new\\s+\\w*Error\\(\\s*|(?:return\\s+)?Promise\\.reject\\(\\s*(?:new\\s+\\w*Error\\(\\s*)?)\\x60[^\\x60]*\\$\\{`,
      ),
    ],
    use: "devkit ./network refuseNetwork",
    say: "a fetch that refuses the network, written here",
  },
  // Tables cleared by hand: three DELETE FROMs with no WHERE close together, or one in a loop.
  {
    find: [
      new RegExp(
        `${DELETE_ALL}[^]{0,400}?${DELETE_ALL}[^]{0,400}?${DELETE_ALL}|\\bfor\\s*\\(\\s*(?:const|let)\\s+\\w+\\s+of\\s+[^)]+\\)[^]{0,160}?DELETE FROM\\s+["'\\x60]?\\$\\{|\\]\\s*\\.(?:map|forEach)\\([^]{0,160}?DELETE FROM\\s+["'\\x60]?\\$\\{`,
        "im",
      ),
    ],
    use: "devkit ./d1 resetDb",
    say: "a hand list of tables to clear, which drifts the day a migration adds one",
  },
];

/**
 * Test files holding a fake devkit already ships. Only this check reads tests.
 * @param {Tree} tree @param {Config} config @param {string} [self]
 * @returns {Finding[]}
 */
export function checkFakes(tree, config, self) {
  /** @type {Finding[]} */
  const found = [];
  if (self === "devkit") return found;
  for (const file of tree.files.filter(
    (f) =>
      SOURCE.test(f) &&
      TEST.test(f) &&
      !/(^|\/)(node_modules|dist|build|coverage|fixtures)\//.test(f),
  )) {
    const code = blankComments(tree.read(file));
    for (const { find, use, say } of FAKES) {
      const m = find[0].exec(code);
      if (!m || !find.every((f) => f.test(code)) || excused(config, "copies", file)) continue;
      found.push({
        check: "fakes",
        file,
        line: code.slice(0, m.index).split("\n").length,
        message: `${say}: use ${use}, or say why in .shared.json "copies"`,
      });
    }
  }
  return found;
}
