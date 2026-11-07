// The one escape for text printed into a GitHub workflow command (`::error::`, `::warning::`, `::notice::`). A file name,
// a remote /health value, a tool's stderr or a baseline key can carry a newline, and a line starting `::` would then be a
// command of the attacker's choosing (`::set-output`, `::stop-commands::`). `%`, CR and LF are what the runner decodes.

/** `text` safe to print after `::<command> <props>::`. */
export function escapeAnnotation(/** @type {unknown} */ text) {
  return String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** `text` safe in a command's `title=` property, where `:` and `,` also end the value. */
export function escapeProperty(/** @type {unknown} */ text) {
  return escapeAnnotation(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
