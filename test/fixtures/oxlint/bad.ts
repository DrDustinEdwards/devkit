import { secret } from "./secret";

async function save(): Promise<string> {
  return secret;
}

save();

export function useCount(on: boolean): number {
  if (on) useCount(false);
  return 0;
}
