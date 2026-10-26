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
    const fetchResponse = async (): Promise<Response> => {
      for (let attempt = 0; attempt < 2; attempt++) {
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
          if (response.status !== 503 || attempt === 1) return response;
          await response.text();
        } catch (error) {
          if (attempt === 1 || pending.signal.aborted) throw error;
        }
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(retryTimer);
            pending.signal.removeEventListener("abort", abort);
            reject(new Error("aborted"));
          };
          const retryTimer = setTimeout(() => {
            pending.signal.removeEventListener("abort", abort);
            resolve();
          }, 600);
          pending.signal.addEventListener("abort", abort, { once: true });
          if (pending.signal.aborted) abort();
        });
      }
      throw new Error("Server unavailable");
    };
    const response = await fetchResponse();
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
    if (error instanceof CalculationError) {
      if (
        error.status === 422 &&
        error.message.includes("Câmpuri de cerere necunoscute")
      )
        throw new CalculationError(
          "Repornește serverul de pe PC: Ctrl+C apoi npm start.",
          "restart_required",
          409,
        );
      throw error;
    }
    throw new CalculationError(
      "Serverul de calcul nu răspunde. Verifică dacă npm start rulează pe PC și conexiunea la rețea.",
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
