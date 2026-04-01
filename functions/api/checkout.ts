/// <reference types="@cloudflare/workers-types/2023-07-01" />

import type { PresentmentCurrency } from "@polar-sh/sdk/models/components/presentmentcurrency.js";
import type { CountryAlpha2Input } from "@polar-sh/sdk/models/components/organizationcreate.js";

import { Polar } from "@polar-sh/sdk";
import { badRequest, badGateway } from '@worker-tools/response-creators';
import { getPppDiscountTier } from './#data';
import { getLocalizedPrices, LocaleByPageLang, type ProductKey } from './#pricing';
import { corsMiddleware, corsOptions, Env } from './#shared';

import { DevCountryOverride } from "..";

const PRODUCT_MAP = {
  pro: 'PRO_PRODUCT_ID',
  be: 'BE_PRODUCT_ID',
  prosub: 'PRO_SUBSCRIBE_PRODUCT_ID',
} as const;

export type CheckoutProduct = keyof typeof PRODUCT_MAP | 'all';

export type CheckoutCurrency = 'local' | 'usd';

/** Page lang (path) -> Polar checkout locale. https://polar.sh/docs/features/checkout/localization */
const POLAR_LOCALE_BY_PAGE_LANG: Record<string, string> = {
  en: 'en',
  de: 'de',
  fr: 'fr',
  'pt-br': 'pt',
  es: 'es',
  ja: 'en',
  ko: 'en',
};

function getPolarLocale(pageLang: string | null | undefined): string {
  if (!pageLang) return 'en';
  return POLAR_LOCALE_BY_PAGE_LANG[pageLang.toLowerCase()] ?? 'en';
}

function parseCheckoutCurrency(raw: string | undefined | null): CheckoutCurrency {
  const v = raw?.trim().toLowerCase();
  if (v === 'local' || v === 'usd') return v;
  return 'usd';
}

async function resolvePresentmentCurrency(
  env: Env,
  request: Request,
  product: CheckoutProduct,
  mode: CheckoutCurrency,
  pageLang: string | null | undefined,
): Promise<string> {
  if (mode === 'usd') return 'usd';
  const DEV = env.DEV;
  const country = ((DEV && DevCountryOverride) || request.headers.get('CF-IPcountry') || 'US').toUpperCase();
  const langKey = (pageLang?.trim() || 'en').toLowerCase();
  const bcp47 = LocaleByPageLang[langKey as keyof typeof LocaleByPageLang] ?? 'en-US';
  const pricing = await getLocalizedPrices(env, country, bcp47);
  if (!pricing) return 'usd';
  const productKey = (product === 'all' ? 'pro' : product) as ProductKey;
  const local = pricing.local[productKey];
  return local?.hasPreferredCurrency ? pricing.preferredCurrency.toLowerCase() : 'usd';
}

export const onRequestOptions = corsOptions;

async function createCheckoutAndGetUrl(
  context: { env: Env; request: Request },
  product: CheckoutProduct|null,
  currency: CheckoutCurrency,
  locale?: string | null,
  embedOrigin?: string | null,
): Promise<string | null> {
  const DEV = context.env.DEV;

  if (!context.env.POLAR_ACCESS_TOKEN) return null;
  const productIds: string[] = [];
  if (!product || product === 'all') {
    if (context.env.PRO_PRODUCT_ID) productIds.push(context.env.PRO_PRODUCT_ID);
    if (context.env.BE_PRODUCT_ID) productIds.push(context.env.BE_PRODUCT_ID);
    if (context.env.PRO_SUBSCRIBE_PRODUCT_ID) productIds.push(context.env.PRO_SUBSCRIBE_PRODUCT_ID);
  } else {
    const productId = context.env[PRODUCT_MAP[product as keyof typeof PRODUCT_MAP]];
    if (!productId) return null;
    productIds.push(productId);
  }
  if (!productIds.length) return null;
  const country = ((DEV && DevCountryOverride) || context.request.headers.get('CF-IPcountry') || 'US').toUpperCase() as CountryAlpha2Input;
  const tier = getPppDiscountTier(country);
  const discountId = tier >= 1 ? context.env[`PPP_DISCOUNT_ID_TIER_${tier}` as keyof Env] as string|undefined : undefined;
  const polar = new Polar({
    accessToken: context.env.POLAR_ACCESS_TOKEN,
    server: context.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production',
  });
  const polarLocale = getPolarLocale(locale);
  const presentment = await resolvePresentmentCurrency(context.env, context.request, product ?? 'all', currency, locale);
  const checkout = await polar.checkouts.create({
    products: productIds,
    currency: presentment.toLowerCase() as PresentmentCurrency,
    locale: polarLocale,
    customerBillingAddress: { country },
    ...(embedOrigin && { embedOrigin }),
    ...(discountId && { discountId, allowDiscountCodes: false }),
  });
  return checkout.url ?? null;
}

export const onRequestGet: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  const url = new URL(context.request.url);
  const productParam = url.searchParams.get('product');
  const product = (productParam ?? 'all') as CheckoutProduct;
  const currencyParsed = parseCheckoutCurrency(url.searchParams.get('currency'));
  const locale = url.searchParams.get('locale')?.trim();
  if (productParam && productParam !== 'all' && !PRODUCT_MAP[productParam as keyof typeof PRODUCT_MAP]) {
    return badRequest('Invalid product');
  }
  const checkoutUrl = await createCheckoutAndGetUrl(context, product, currencyParsed, locale);
  if (!checkoutUrl) {
    return badGateway('Checkout unavailable');
  }
  return Response.redirect(checkoutUrl, 302);
}];

export const onRequestPost: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  if (!context.env.POLAR_ACCESS_TOKEN) {
    return Response.json({ error: 'Checkout not configured' }, { status: 503 });
  }
  let body: { product?: string; currency?: string; embed_origin?: string; locale?: string };
  try {
    body = await context.request.json() as { product?: string; currency?: string; embed_origin?: string; locale?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const productParam = body.product;
  const product = (productParam ?? 'all') as CheckoutProduct;
  const currencyParsed = parseCheckoutCurrency(typeof body.currency === 'string' ? body.currency : undefined);
  const embedOrigin = typeof body.embed_origin === 'string' ? body.embed_origin.trim() : undefined;
  const locale = typeof body.locale === 'string' ? body.locale.trim() : undefined;
  if (productParam && productParam !== 'all' && !PRODUCT_MAP[productParam as keyof typeof PRODUCT_MAP]) {
    return Response.json({ error: 'Invalid product' }, { status: 400 });
  }
  try {
    const url = await createCheckoutAndGetUrl(context, product, currencyParsed, locale, embedOrigin);
    if (!url) {
      return Response.json({ error: 'No checkout URL' }, { status: 502 });
    }
    return Response.json({ url });
  } catch (err) {
    console.error('Checkout create failed', err);
    return Response.json({ error: err instanceof Error ? err.message : 'Checkout failed' } as any, { status: 502 });
  }
}];
