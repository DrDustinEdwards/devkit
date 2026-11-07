/** Every repository's chunked mutation run; see chunked.mjs. `STRYKER_CHUNK` picks one chunk; `rest` is everything no chunk names. */
export function chunkedStryker(
  options: {
    all: string[];
    chunks: Record<string, string[]>;
    exclude?: string[];
    vitestConfig?: string;
    timeoutMS?: number;
  },
  env?: NodeJS.ProcessEnv,
): Record<string, unknown>;
