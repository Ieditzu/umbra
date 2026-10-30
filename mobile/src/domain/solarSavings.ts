/** Assumes the full estimated output is consumed at the entered retail price. */
export function solarSavings(energyKwh: number, price: string): number | null {
  if (!price.trim()) return null;
  const value = Number(price.trim().replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100 || !Number.isFinite(energyKwh) || energyKwh < 0) return null;
  return energyKwh * value;
}
