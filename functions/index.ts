/// <reference types="@cloudflare/workers-types/2023-07-01" />

import languageParser from 'accept-language-parser';
import { Polar } from "@polar-sh/sdk";

import { Env } from "./api/#shared"
import { CountryInfo, PPP } from './api/#data';

export const LANGS: ('en'|'de'|'fr'|'pt-br'|'ja'|'es'|'ko')[] = ['en', 'de', 'fr', 'pt-br', 'ja', 'es', 'ko'];

const DevCountryOverride = '';

const PercentToTier = Object.freeze({ 0: 0, 20: 1, 40: 2, 60: 3 });

const lightDark = (x?: string|null) => x === 'light' ? 'light' : x === 'dark' ? 'dark' : undefined;

const ns = 'sqlite-viewer-vscode-page.8';
const ttlDay = 60 * 60 * 24;

const discountHtml = (price: number, discountPercent: number) => html`
  <del class="pricing-table-price-currency h2 o-50" title="USD">$</del><del class="pricing-table-price-amount h1 o-50">${price}</del>
  <span class="pricing-table-price-currency h2" title="USD">$</span><span class="pricing-table-price-amount h1">${formatPrice(price * (1 - discountPercent/100))}</span>
  <small class="text-xxs">+&nbsp;VAT</small>
`;

const discountHintHtml = (discountPercent: number, country: string, flag: string) => html`
  <span class="price-hint text-xxs nowrap">${discountPercent}% off for all visitors from ${country} ${flag}</span>
`;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const DEV = context.env.DEV;

  let [numPurchases, avatarUrls] = await Promise.all([
    context.env.KV.get<number>(`${ns}.numPurchases`, 'json'),
    context.env.KV.get<string[]>(`${ns}.avatarUrls`, 'json'),
  ]);

  if (numPurchases == null || avatarUrls == null) {
    [numPurchases, avatarUrls] = await getRecentProductPurchases(context.env).catch((err) => {
      console.error(err);
      return [null, null];
    });
    if (numPurchases != null && avatarUrls != null) {
      context.waitUntil((async () => {
        await Promise.all([
          context.env.KV.put(`${ns}.numPurchases`, JSON.stringify(numPurchases), { expirationTtl: ttlDay }),
          context.env.KV.put(`${ns}.avatarUrls`, JSON.stringify(avatarUrls), { expirationTtl: ttlDay }),
        ]);
      })());
    }
  } 

  const url = new URL(context.request.url);
  const { searchParams } = url;

  let isDedicatedLangPage = false;
  if (!DEV) {
    if (LANGS.some(lang => url.pathname.startsWith(`/${lang}`))) {
      isDedicatedLangPage = true;
    } else {
      const langHeader = searchParams.get('lang') || context.request.headers.get('Accept-Language') || '';
      const lang = languageParser.pick(LANGS, langHeader) ?? 'en';
      url.pathname = `/${lang}${url.pathname}`;
    }
  }

  const response = await context.env.ASSETS.fetch(url);

  const PROHrefByTier = context.env.PRO_HREFS.trim().split('\n');
  const BEHrefByTier = context.env.BE_HREFS.trim().split('\n');
  console.assert(PROHrefByTier.length === 4 && BEHrefByTier.length === 4, 'Invalid PRO_HREFS or BE_HREFS');

  const country = ((DEV && DevCountryOverride) || context.request.headers.get('CF-IPcountry') || 'US') as keyof typeof PPP;
  const discountPercent = PPP[country] ?? 0;
  const discountTier = PercentToTier[discountPercent];
  const hasDiscount = discountPercent > 0;

  const colorScheme = lightDark(searchParams.get('color-scheme'))
  const vscode = searchParams.has('css-vars')

  let rewriter = new HTMLRewriter()
    .on('a[href^="#purchase"], a[href^="#subscribe"]', {
      element(el) {
        const href = el.getAttribute('href')!;
        let newHref = '';
        switch (href) {
          case '#purchase':
            newHref = PROHrefByTier[discountTier];
            break;
          case '#purchase-be':
            newHref = BEHrefByTier[discountTier];
            break;
          case '#subscribe':
            newHref = context.env.PRO_SUBSCRIBE_HREF;
            break;
        }
        el.setAttribute('href', newHref);
      },
    })
    .on('.purchased-n-times', {
      element(el) {
        const content = el.getAttribute('content');
        if (content && numPurchases) {
          el.setInnerContent(content.replace('{n}', numPurchases.toString()), { html: true });
        }
      }
    })
    .on('.avatar-stack', {
      element(el) {
        const selectedAvatars = [...avatarUrls ?? []].sort(() => Math.random() - 0.5).slice(0, 5);
        el.setInnerContent(selectedAvatars.map(url => html`<img class="avatar-stack-item" src="${url}">`).join(''), { html: true });
      }
    })

  if (hasDiscount) {
    rewriter = rewriter
      .on('.i18n-hide, .pricing-toggle-container, .monthly-price, .fall-sale-banner', {
        element(el) {
          el.remove();
        }
      })
  }

  if (!vscode) {
    rewriter = rewriter
      .on('meta[name="color-scheme"]', { element(el) { el.setAttribute('content', colorScheme || 'dark light') } })
      .on('body', {
        element(el) {
          el.append(html`<script defer src="https://cdn.jsdelivr.net/npm/@polar-sh/checkout@0.1/dist/embed.global.js" data-auto-init></script>`, { html: true });
        }
      })
  }

  if (colorScheme) {
    const prefersColorScheme = new RegExp(`\\(prefers-color-scheme:\\s*${colorScheme}\\)`);
    rewriter = rewriter.on('source[media*="prefers-color-scheme"]', {
      element(source) {
        const media = source.getAttribute('media')!;
        if (!media.match(prefersColorScheme)) source.remove();
        else source.removeAttribute('media');
      }
    });
  }

  if (discountPercent) {
    rewriter = rewriter
      .on(".pricing-table-price", {
        element(element) {
          const price = Number(element.getAttribute('data-price') ?? 0);
          if (!price || Number.isNaN(price)) return;
          element.setInnerContent(discountHtml(price, discountPercent), { html: true });
        },
      })
      .on(".price-hint", { 
        element(el) { 
          const [countryName, flag] = CountryInfo[country]; 
          if (el.getAttribute('class')?.includes('monthly-price')) return;
          el.replace(discountHintHtml(discountPercent, countryName, flag), { html: true })
        } 
      })
  }

  let transformedResponse;
  if (DEV && response.status === 200) {
    const buf = await rewriter.transform(response).arrayBuffer();
    transformedResponse = new Response(buf, { headers: response.headers, status: response.status });
  } else {
    transformedResponse = rewriter.transform(response);
  }

  if (response.status === 200) {
    if (!isDedicatedLangPage) transformedResponse.headers.append('Vary', 'Accept-Language');
    transformedResponse.headers.append('Vary', 'CF-IPCountry');
    transformedResponse.headers.set('Cache-Control', 'public, max-age=600') 
  }
  return transformedResponse;
}

const formatPrice = (price: number) => {
  if (Math.floor(price) === price) return price.toString();
  const [a, b] = price.toFixed(2).split('.');
  return html`<span>${a}</span><span class="h2">.${b}</span>`;
}

function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '', i = 0;
  for (const string of strings) str += string + (values[i++] || '');
  return str.trim();
}

async function* genNonEmptyAvatarUrls(avatarUrls: string[]): AsyncGenerator<string, void, unknown> {
  for (const url of avatarUrls) {
    if (!url) {
      continue;
    }

    try {
      const urlObj = new URL(url);
      urlObj.searchParams.set('d', '404');
      const testUrl = urlObj.toString();
      
      const response = await fetch(testUrl, { method: 'HEAD' });

      if (response.status !== 404) {
        yield url;
      }
    } catch (error) {
      continue;
    }
  }
}

async function getRecentProductPurchases(env: Env): Promise<[count: number, avatarUrls: string[]]> {
  const polar = new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN ?? "",
    server: env.DEV ? "sandbox" : "production",
  });

  const productId = [env.PRO_PRODUCT_ID, env.BE_PRODUCT_ID];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30.5);
  const cutoffDate = thirtyDaysAgo

  const result = await polar.orders.list({
    productId,
    page: 1,
    limit: 100,
    sorting: ['-created_at'],
  });

  let purchaseCount = 0;
  let avatarUrls: string[] = [];

  outer: for await (const page of result) {
    for (const order of page.result.items) {
      if (!env.DEV && order.createdAt < cutoffDate) break outer;
      purchaseCount++;
      avatarUrls.push(order.customer.avatarUrl);
    }
  }

  const validAvatarUrls: string[] = [];
  const avatarGenerator = genNonEmptyAvatarUrls(avatarUrls);
  
  for await (const validUrl of avatarGenerator) {
    validAvatarUrls.push(validUrl);
    if (validAvatarUrls.length >= 40) break;
  }

  return [purchaseCount, validAvatarUrls];
}
