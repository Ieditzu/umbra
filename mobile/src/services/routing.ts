import { parseComparison } from "../domain/routes.ts";
import type { RouteComparison, RouteRequest } from "../domain/routes.ts";
import { normalizeApiUrl } from "../domain/settings.ts";

export async function compareRoutes(
  baseUrl: string,
  payload: RouteRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<RouteComparison> {
  const url = normalizeApiUrl(baseUrl);
  if (!url)
    throw new Error(
      "Serviciul de calcul nu este conectat încă. Poți alege punctele și ora; traseele și umbrele necesită motorul de calcul.",
    );
  const response = await fetcher(`${url}/v1/routes/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    if (response.status === 422)
      throw new Error(
        "Traseul nu poate fi calculat pentru punctele sau ora alese. Verifică zona acoperită de server.",
      );
    throw new Error(
      `Serviciul de trasee nu este disponibil (${response.status}). Încearcă din nou.`,
    );
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > 5_000_000)
    throw new Error("Răspunsul serviciului este prea mare.");
  return parseComparison(await response.json(), payload);
}
