import { Polar } from "@polar-sh/sdk";

import type { Env } from "./#shared";

const Ns = 'sqlite-viewer-vscode-page.8';
const TtlDay = 60 * 60 * 24;

export function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '', i = 0;
  for (const string of strings) str += string + (values[i++] || '');
  return str.trim();
}

const EurCountries = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES'
]);

export function pickCurrencyByCountry(country: string) {
  if (country === 'GB') return 'GBP';
  if (country === 'CA') return 'CAD';
  if (country === 'AU') return 'AUD';
  if (country === 'JP') return 'JPY';
  if (country === 'CH' || country === 'LI') return 'CHF';
  if (country === 'SE') return 'SEK';
  if (country === 'IN') return 'INR';
  if (country === 'BR') return 'BRL';
  if (country === 'MX') return 'MXN';
  if (country === 'KR') return 'KRW';
  if (country === 'SG') return 'SGD';
  if (EurCountries.has(country)) return 'EUR';
  return 'USD';
}

export type ProductKey = 'pro' | 'be' | 'prosub';

export type LocalizedPrice = {
  currencyCode: string,
  currencySymbol: string,
  amountHtml: string,
  priceAmount: number,
  hasPreferredCurrency?: boolean,
}

export const LocaleByPageLang = Object.freeze({
  'en': 'en-US',
  'de': 'de-DE',
  'fr': 'fr-FR',
  'pt-br': 'pt-BR',
  'ja': 'ja-JP',
  'es': 'es-ES',
  'ko': 'ko-KR',
});

export type PolarCurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'CHF' | 'SEK' | 'INR' | 'BRL' | 'MXN';

export const formatPriceLocalized = (priceAmount: number, currencyCode: string, locale: string, preferredCurrency?: string) => {
  const numberFormat = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
  });

  const fractionDigits = numberFormat.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10 ** fractionDigits;
  const parts = numberFormat.formatToParts(priceAmount / divisor);
  const currencySymbol = disambiguateCurrencySymbol(
    parts.find((part) => part.type === 'currency')?.value ?? currencyCode,
    currencyCode,
  );

  const amountInt = parts
    .filter((part) => part.type === 'integer' || part.type === 'group')
    .map((part) => part.value)
    .join('');
  const amountFrac = parts.find((part) => part.type === 'fraction')?.value;
  const amountDecimal = parts.find((part) => part.type === 'decimal')?.value ?? '';
  const amountHtml = amountFrac
    ? amountFrac === '00'
      ? html`${amountInt}`
      : html`<span>${amountInt}</span><span class="h2">${amountDecimal}${amountFrac}</span>`
    : html`${amountInt}`;

  const hasPreferredCurrency = currencyCode === preferredCurrency;
  return { currencyCode, currencySymbol, amountHtml, priceAmount, hasPreferredCurrency };
}

const disambiguateCurrencySymbol = (symbol: string, currencyCode: string) => {
  if (symbol !== '$' || currencyCode === 'USD') return symbol;
  if (currencyCode.length === 3 && currencyCode.endsWith('D')) return `${currencyCode[0]}$`;
  return currencyCode;
}

const getProductPrices = async (polar: Polar, productId: string) => {
  const product = await polar.products.get({ id: productId });
  const pricesByCurrency = new Map<string, number>();
  for (const price of product.prices) {
    if (price.isArchived) continue;
    if (price.amountType !== 'fixed') continue;
    if (typeof price.priceAmount !== 'number') continue;
    if (typeof price.priceCurrency !== 'string') continue;
    pricesByCurrency.set(price.priceCurrency.toUpperCase(), price.priceAmount);
  }
  return pricesByCurrency;
}

const getProductPricesCached = async (env: Env, polar: Polar, productId: string, billingCycle: 'one-time'|'monthly', { DEV }: { DEV?: string } = {}) => {
  const cacheKey = `${Ns}.prices.${billingCycle}.${productId}`;
  const cached = DEV ? null : await env.KV.get<Record<string, number>>(cacheKey, 'json');
  DEV && console.log('cached', cached, { productId, billingCycle, DEV });

  if (cached != null && typeof cached === 'object') {
    return new Map(Object.entries(cached));
  }

  const pricesByCurrency = await getProductPrices(polar, productId);
  DEV && console.log('pricesByCurrency', pricesByCurrency, { productId, billingCycle, DEV });

  if (pricesByCurrency.size) {
    const serializable = Object.fromEntries(pricesByCurrency.entries());
    if (!DEV) await env.KV.put(cacheKey, JSON.stringify(serializable), { expirationTtl: TtlDay });
  }
  return pricesByCurrency;
}

const pickLocalizedPrice = (pricesByCurrency: Map<string, number>, preferredCurrency: string, locale: string): LocalizedPrice | null => {
  const selectedCurrency = pricesByCurrency.has(preferredCurrency)
    ? preferredCurrency
    : pricesByCurrency.has('USD')
      ? 'USD'
      : pricesByCurrency.keys().next().value;
  if (!selectedCurrency) return null;
  const selectedAmountRaw = pricesByCurrency.get(selectedCurrency);
  let selectedAmount = selectedAmountRaw;
  // if (selectedCurrency === 'JPY' && selectedAmountRaw != null) {
  //   selectedAmount = Math.round(selectedAmountRaw * (1 + JapanDisplayTaxRate));
  // }
  if (selectedAmount == null) return null;
  return formatPriceLocalized(selectedAmount, selectedCurrency, locale, preferredCurrency);
}

export type PricingData = {
  preferredCurrency: string;
  hasAnyLocalCurrency: boolean;
  local: { [K in ProductKey]: LocalizedPrice|null };
  usd: { [K in ProductKey]: LocalizedPrice|null };
};

export const getLocalizedPrices = async (env: Env, country: string, locale: string): Promise<PricingData | null> => {
  if (!env.POLAR_ACCESS_TOKEN || !env.PRO_PRODUCT_ID || !env.BE_PRODUCT_ID) return null;
  const polar = new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN ?? "",
    server: env.POLAR_SERVER === "sandbox" ? "sandbox" : "production",
  });
  const preferredCurrency = pickCurrencyByCountry(country);
  const [proPrices, bePrices, proSubscribePrices] = await Promise.all([
    getProductPricesCached(env, polar, env.PRO_PRODUCT_ID, 'one-time', env),
    getProductPricesCached(env, polar, env.BE_PRODUCT_ID, 'one-time', env),
    getProductPricesCached(env, polar, env.PRO_SUBSCRIBE_PRODUCT_ID, 'monthly', env),
  ]);
  const proLocal = pickLocalizedPrice(proPrices, preferredCurrency, locale);
  const beLocal = pickLocalizedPrice(bePrices, preferredCurrency, locale);
  const proSubLocal = pickLocalizedPrice(proSubscribePrices, preferredCurrency, locale);

  const proUsd = pickLocalizedPrice(proPrices, 'USD', locale);
  const beUsd = pickLocalizedPrice(bePrices, 'USD', locale);
  const proSubUsd = pickLocalizedPrice(proSubscribePrices, 'USD', locale);

  const local = { pro: proLocal, be: beLocal, prosub: proSubLocal };
  const usd = { pro: proUsd, be: beUsd, prosub: proSubUsd };
  return {
    preferredCurrency,
    hasAnyLocalCurrency: preferredCurrency !== 'USD' && Object.values(local).some((e) => e?.hasPreferredCurrency),
    local,
    usd,
  };
}
