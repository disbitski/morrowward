export const VANGUARD_VTI_PRODUCT_URL =
  "https://advisors.vanguard.com/investments/products/vti/vanguard-total-stock-market-etf";

export const VANGUARD_BND_PRODUCT_URL =
  "https://advisors.vanguard.com/investments/products/bnd/vanguard-total-bond-market-etf";

const VANGUARD_PRODUCT_URLS_BY_LEGACY_PATH = new Map([
  [
    "/investment-products/etfs/profile/vti",
    VANGUARD_VTI_PRODUCT_URL,
  ],
  [
    "/investment-products/etfs/profile/bnd",
    VANGUARD_BND_PRODUCT_URL,
  ],
]);

/**
 * Vanguard retired these individual-investor ETF routes without redirecting
 * them. Keep old, already-published citations useful by mapping only the two
 * known product paths to Vanguard's current public product pages.
 */
export function canonicalizeVanguardProductUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "investor.vanguard.com") return value;
    return VANGUARD_PRODUCT_URLS_BY_LEGACY_PATH.get(
      url.pathname.replace(/\/+$/u, "").toLowerCase(),
    ) ?? value;
  } catch {
    return value;
  }
}
