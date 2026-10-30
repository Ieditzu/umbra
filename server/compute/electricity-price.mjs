import { ComputeError } from "./pool.mjs";

const url = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_204?geo=RO&unit=KWH&currency=NAC&tax=I_TAX&nrg_cons=KWH2500-4999";

export function createElectricityPriceService(fetcher = fetch) {
  let cached, expires = 0, pending;
  return async () => {
    if (cached && Date.now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Array.isArray(data.id) || data.id.at(-1) !== "time" || !Array.isArray(data.size) || data.size.length !== data.id.length || data.size.slice(0, -1).some((size) => size !== 1)) throw Error();
        const periods = Object.entries(data.dimension.time.category.index).filter(([period, index]) => /^\d{4}-S[12]$/.test(period) && Number.isInteger(index)).sort(([a], [b]) => b.localeCompare(a));
        for (const [period, index] of periods) {
          const price = data.value[index];
          if (typeof price === "number" && Number.isFinite(price) && price > 0 && price <= 100) {
            cached = { price_ron_kwh: price, period, band: "2500-4999", source: "Eurostat" };
            expires = Date.now() + 24 * 60 * 60 * 1000;
            return cached;
          }
        }
        throw Error();
      } catch {
        throw new ComputeError("Prețul mediu nu este disponibil.", 503, "unavailable");
      }
    })();
    try { return await pending; } finally { pending = null; }
  };
}
