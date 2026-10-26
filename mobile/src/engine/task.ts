/** Cooperative slices keep React Native responsive and make cancellation effective. */
export function task(signal: AbortSignal, budgetMs = 18000) {
  const deadline = Date.now() + budgetMs;
  let slice = Date.now();
  function check() {
    if (signal.aborted) throw new Error("Calculul a fost oprit.");
    if (Date.now() > deadline)
      throw new Error(
        "Calculul local a durat prea mult. Alege o zonă mai mică.",
      );
  }
  return {
    check,
    async checkpoint() {
      check();
      if (Date.now() - slice >= 6) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        check();
        slice = Date.now();
      }
    },
  };
}
export type Task = ReturnType<typeof task>;
