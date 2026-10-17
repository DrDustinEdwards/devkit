import type { Shape } from "./types.js";

// Nine branches in classify: if, else if, for, ?: in the loop, &&, ??, case "circle" (the default adds none), catch, and the
// return's ?:. So its complexity is 10.
export function classify(xs: number[], shape?: Shape): string {
  let out = "";
  if (xs.length === 0) out = "empty";
  else if (xs.length === 1) out = "one";
  for (const x of xs) out += x > 0 ? "+" : "-";
  const ok = xs.length > 2 && out !== "";
  const name = shape?.name ?? "none";
  switch (name) {
    case "circle":
      out += "o";
      break;
    default:
      out += "?";
  }
  try {
    JSON.parse(out);
  } catch {
    out += "!";
  }
  // The nested function's branch is its own, not the outer one's.
  const inner = (y: number) => (y > 1 ? "big" : "small");
  return ok ? out + inner(xs.length) : out;
}

export class Box {
  constructor(private readonly size: number) {}

  get big(): boolean {
    return this.size > 10;
  }

  grow(): number {
    return this.size + 1;
  }
}

export const lazy = async () => import("./a.js");
