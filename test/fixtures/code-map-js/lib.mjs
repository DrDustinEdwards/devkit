import { twice } from "./util/twice.mjs";

export function grade(n) {
  if (n > 10) return "big";
  return twice(n) > 10 ? "middling" : "small";
}
