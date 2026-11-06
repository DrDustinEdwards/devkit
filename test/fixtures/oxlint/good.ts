async function save(): Promise<string> {
  return "sample";
}

export async function handled(): Promise<void> {
  await save();
  save().catch(() => {});
  void save();
}

export function useCount(): number {
  return useCount();
}
