export class CalculationError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code = "unavailable", status = 503) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export async function requestCalculation(
  base: string,
  path: string,
  payload: unknown,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 22000,
): Promise<unknown> {
  if (!base)
    throw new CalculationError(
      "Serverul de calcul nu este configurat. Pornește aplicația cu npm start pe PC.",
    );
  if (signal.aborted)
    throw new CalculationError("Calculul a fost oprit.", "cancelled", 499);
  const pending = new AbortController();
  let timedOut = false;
  const cancel = () => pending.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    pending.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: pending.signal,
    });
    const length = Number(response.headers.get("content-length"));
    if (length > 8_000_000)
      throw new CalculationError("Răspunsul serverului este prea mare.");
    const text = await response.text();
    if (signal.aborted)
      throw new CalculationError("Calculul a fost oprit.", "cancelled", 499);
    if (text.length > 8_000_000)
      throw new CalculationError("Răspunsul serverului este prea mare.");
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new CalculationError("Răspuns invalid de la server.");
    }
    if (!response.ok)
      throw new CalculationError(
        typeof value?.detail === "string"
          ? value.detail
          : "Calculul nu este disponibil.",
        typeof value?.code === "string" ? value.code : "unavailable",
        response.status,
      );
    return value;
  } catch (error) {
    if (signal.aborted)
      throw new CalculationError("Calculul a fost oprit.", "cancelled", 499);
    if (timedOut)
      throw new CalculationError(
        "Serverul de calcul răspunde prea greu. Reîncearcă.",
        "timeout",
      );
    if (error instanceof CalculationError) throw error;
    throw new CalculationError(
      "Serverul de calcul nu răspunde. Verifică dacă npm start rulează pe PC și conexiunea la rețea.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
