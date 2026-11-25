/** The inputs of devkit's pr.yml and no-bloat.yml that say whether the check runs, on what install, and what runs first. */
const CHECK_INPUTS = {
  pr: [
    "node",
    "node-version-file",
    "package-manager",
    "install",
    "no-bloat",
    "no-bloat-prepare",
    "no-bloat-config",
  ],
  "no-bloat": ["node-version-file", "package-manager", "install", "prepare", "config"],
};

/** A job's `uses` that calls devkit's pr.yml or no-bloat.yml, at any pin. */
const CALLS = /^DrDustinEdwards\/devkit\/\.github\/workflows\/(pr|no-bloat)\.yml@/i;

/** A parsed value with its keys sorted, as JSON: two parses compare equal whatever order or style the YAML wrote. */
function canonical(/** @type {unknown} */ value) {
  /** @param {unknown} v @returns {unknown} */
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sort(/** @type {Record<string, unknown>} */ (v)[k])]),
          )
        : v;
  return JSON.stringify(sort(value)) ?? "undefined";
}

/**
 * The part of a parsed job that decides whether it runs the check: the job, with its `uses` as the workflow it calls (the
 * pin left out) and its `with` cut to the CHECK_INPUTS, each named in lower case, as GitHub reads input names. Null for
 * a job that calls neither workflow.
 * @param {unknown} job
 * @returns {{ job: Record<string, unknown>, workflow: "pr" | "no-bloat", inputs: Record<string, unknown>, twice: string[] } | null}
 */
function checkPart(job) {
  if (!job || typeof job !== "object") return null;
  const j = /** @type {Record<string, unknown>} */ (job);
  const m = typeof j.uses === "string" ? CALLS.exec(j.uses.trim()) : null;
  if (!m) return null;
  const workflow = /** @type {"pr" | "no-bloat"} */ (m[1].toLowerCase());
  /** @type {Record<string, unknown>} */
  const inputs = {};
  const twice = [];
  const given = j.with;
  if (given && typeof given === "object" && !Array.isArray(given))
    for (const [k, v] of Object.entries(given)) {
      const key = k.toLowerCase();
      if (!CHECK_INPUTS[workflow].includes(key)) continue;
      if (key in inputs) twice.push(key);
      inputs[key] = v;
    }
  // A `with` that is not a map is kept whole: GitHub refuses it, and so does the comparison.
  const rest = {
    ...j,
    uses: workflow,
    with: given === undefined || (given && typeof given === "object") ? null : given,
  };
  return { job: rest, workflow, inputs, twice };
}

/** The jobs `id` waits for in `jobs`, directly or through another. */
function needsOf(/** @type {Record<string, any>} */ jobs, /** @type {string} */ id) {
  /** @type {Set<string>} */
  const seen = new Set();
  const walk = (/** @type {string} */ j) => {
    const n = jobs[j]?.needs;
    for (const d of typeof n === "string" ? [n] : Array.isArray(n) ? n : [])
      if (typeof d === "string" && !seen.has(d)) {
        seen.add(d);
        walk(d);
      }
  };
  walk(id);
  return seen;
}

/**
 * What a change to a workflow does to the check itself, which no pull request may do. The workflow is parsed as YAML,
 * as GitHub reads it (a flow map, a quoted or upper-case key, an anchor, CRLF line ends are the same data), and for each
 * job that calls pr.yml or no-bloat.yml at the base it refuses: dropping the job; any change to the job but its pin and
 * the inputs that are not CHECK_INPUTS (its `if`, `needs`, `strategy`, the workflow it calls); a change to an input that
 * turns the check off or decides what runs before it (the install, the prepare step, the config, the Node); any change to
 * a job it waits for (`needs`, which a skipped job skips too); and any change outside `jobs` (`on`, whose filters stop the
 * workflow running at all, `concurrency`, `permissions`), except a `schedule` added to `on`, which only adds runs. A file that no longer parses is refused too. The run that judges
 * such a change is the change's own, with its inputs, so a check it turns off never runs to refuse it; so it is refused
 * here whenever it does run, pr.yml refuses the rest (`--inputs-from`), and Capsid's nightly watch reports any that
 * merged. Pure, given the parser.
 * @param {string} path @param {string} was @param {string} is @param {(text: string) => unknown} parseYaml
 */
export function workflowInputs(path, was, is, parseYaml) {
  const read = (/** @type {string} */ text) => {
    try {
      const doc = parseYaml(text);
      return /** @type {Record<string, any>} */ (doc && typeof doc === "object" ? doc : {});
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  };
  /** @type {string[]} */
  const out = [];
  const say = (/** @type {string} */ what) =>
    out.push(
      `${path} ${what}, which decides whether the no-bloat check runs and what runs before it. A pull request cannot change how it is itself checked: the owner makes that change past the check.`,
    );
  const a = read(was);
  if (a instanceof Error) {
    // A base that names devkit's workflows and does not parse cannot be compared; one that names neither ran no check.
    if (/DrDustinEdwards\/devkit\/\.github\/workflows\/(?:pr|no-bloat)\.ya?ml/i.test(was))
      say(`could not be read as YAML at the base (${a.message.split("\n")[0]})`);
    return out;
  }
  const jobsA = a.jobs && typeof a.jobs === "object" ? a.jobs : {};
  const callers = Object.keys(jobsA).filter((id) => checkPart(jobsA[id]));
  if (!callers.length) return out;
  const b = read(is);
  if (b instanceof Error) {
    say(`no longer parses as YAML (${b.message.split("\n")[0]})`);
    return out;
  }
  const jobsB = b.jobs && typeof b.jobs === "object" ? b.jobs : {};
  // A schedule added to `on`, and nothing else changed there, only adds runs: it stops none (the daily shared-code run on
  // the default branch, README "The shared checks").
  const addsOnlySchedule = (/** @type {any} */ was, /** @type {any} */ is) => {
    if (!is || typeof is !== "object" || Array.isArray(is) || !("schedule" in is)) return false;
    if (was && typeof was === "object" && "schedule" in was) return false;
    const { schedule: _, ...rest } = is;
    return canonical(was) === canonical(rest);
  };
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (
      key !== "jobs" &&
      canonical(a[key]) !== canonical(b[key]) &&
      !(key === "on" && addsOnlySchedule(a.on, b.on))
    )
      say(`changes its top-level "${key}"`);
  const show = (/** @type {unknown} */ v) =>
    JSON.stringify(v === undefined ? "(default)" : typeof v === "string" ? v : canonical(v));
  for (const id of callers) {
    const [then, now] = [checkPart(jobsA[id]), checkPart(jobsB[id])];
    if (!then) continue;
    if (!(id in jobsB)) say(`drops the job "${id}" that runs it`);
    else if (!now)
      say(`changes the job "${id}" so it no longer calls devkit's ${then.workflow}.yml`);
    else {
      if (now.twice.length) say(`names ${now.twice.join(", ")} twice in the job "${id}"`);
      for (const key of new Set([...Object.keys(then.job), ...Object.keys(now.job)]))
        if (canonical(then.job[key]) !== canonical(now.job[key]))
          say(
            key === "uses"
              ? `moves the job "${id}" from ${then.workflow}.yml to ${now.workflow}.yml`
              : key === "with"
                ? `changes the job "${id}"'s with from a map`
                : `changes the job "${id}"'s ${key} from ${show(then.job[key])} to ${show(now.job[key])}`,
          );
      for (const k of CHECK_INPUTS[then.workflow])
        if (canonical(then.inputs[k]) !== canonical(now.inputs[k]))
          say(`changes ${k} from ${show(then.inputs[k])} to ${show(now.inputs[k])}`);
    }
    for (const dep of new Set([...needsOf(jobsA, id), ...needsOf(jobsB, id)]))
      if (canonical(jobsA[dep]) !== canonical(jobsB[dep]))
        say(`changes the job "${dep}" that "${id}" waits for (needs)`);
  }
  return out;
}
