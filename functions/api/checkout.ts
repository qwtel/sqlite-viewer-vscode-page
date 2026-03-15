/// <reference types="@cloudflare/workers-types/2023-07-01" />

import { Polar } from "@polar-sh/sdk";
import { badRequest } from '@worker-tools/response-creators';
import { corsMiddleware, corsOptions, Env } from './#shared';

const PRODUCT_MAP = {
  pro: 'PRO_PRODUCT_ID',
  be: 'BE_PRODUCT_ID',
  'pro-subscribe': 'PRO_SUBSCRIBE_PRODUCT_ID',
} as const;

export type CheckoutProduct = keyof typeof PRODUCT_MAP;

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

export const onRequestOptions = corsOptions;

async function createCheckoutAndGetUrl(
  context: { env: Env },
  product: CheckoutProduct,
  currency: string,
  locale?: string | null,
  embedOrigin?: string | null,
): Promise<string | null> {
  if (!context.env.POLAR_ACCESS_TOKEN) return null;
  const productId = context.env[PRODUCT_MAP[product]];
  if (!productId) return null;
  const polar = new Polar({
    accessToken: context.env.POLAR_ACCESS_TOKEN,
    server: context.env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production',
  });
  const polarLocale = getPolarLocale(locale);
  const checkout = await polar.checkouts.create({
    products: [productId],
    currency: currency.toLowerCase() as any,
    locale: polarLocale,
    ...(embedOrigin && { embedOrigin }),
  });
  return checkout.url ?? null;
}

export const onRequestGet: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  const url = new URL(context.request.url);
  const product = url.searchParams.get('product') as CheckoutProduct | null;
  const currency = url.searchParams.get('currency')?.trim().toLowerCase() ?? 'usd';
  const locale = url.searchParams.get('locale')?.trim() || undefined;
  if (!product || !PRODUCT_MAP[product]) {
    return new Response('Invalid product', { status: 400 });
  }
  const checkoutUrl = await createCheckoutAndGetUrl(context, product, currency, locale);
  if (!checkoutUrl) {
    return new Response('Checkout unavailable', { status: 502 });
  }
  return Response.redirect(checkoutUrl, 302);
}];

export const onRequestPost: PagesFunction<Env>[] = [corsMiddleware, async (context) => {
  if (!context.env.POLAR_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: 'Checkout not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  let body: { product?: string; currency?: string; embed_origin?: string; locale?: string };
  try {
    body = await context.request.json() as { product?: string; currency?: string; embed_origin?: string; locale?: string };
  } catch {
    return badRequest('Invalid JSON');
  }
  const product = body.product as CheckoutProduct | undefined;
  const currency = typeof body.currency === 'string' ? body.currency.trim().toLowerCase() : 'usd';
  const embedOrigin = typeof body.embed_origin === 'string' ? body.embed_origin.trim() || undefined : undefined;
  const locale = typeof body.locale === 'string' ? body.locale.trim() || undefined : undefined;
  if (!product || !PRODUCT_MAP[product]) {
    return badRequest('Invalid product');
  }
  try {
    const url = await createCheckoutAndGetUrl(context, product, currency, locale, embedOrigin);
    if (!url) {
      return new Response(JSON.stringify({ error: 'No checkout URL' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Checkout create failed', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Checkout failed' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}];
