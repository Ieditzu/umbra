/** Cooperative slices keep React Native responsive and make cancellation effective. */
export function task(signal: AbortSignal, budgetMs = 18000) {
  // Elapsed computation budgets must survive wall-clock/NTP changes.
  const now = () => globalThis.performance?.now() ?? Date.now();
  const deadline = now() + budgetMs;
  let slice = now();
  function check() {
    if (signal.aborted) throw new Error("Calculul a fost oprit.");
    if (now() > deadline)
      throw new Error(
        "Calculul local a durat prea mult. Alege o zonă mai mică.",
      );
  }
  return {
    check,
    async checkpoint() {
      check();
      if (now() - slice >= 6) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        check();
        slice = now();
      }
    },
  };
}
export type Task = ReturnType<typeof task>;
