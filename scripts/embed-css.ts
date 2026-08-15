import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser, { type Node as ValueNode } from 'postcss-value-parser';

export const EMBED_CSS_PATH = 'dist/landing-page-embed.css';
export const EMBED_ROOT_CLASS = 'remote-content-root';
export const EMBED_REM_PROPERTY = '--remote-content-rem';

const viewportCondition = /^\(\s*(?:min|max)-(?:width|height|aspect-ratio)\s*:/i;

function embeddedSelector(selector: string) {
  return selectorParser((selectors) => {
    selectors.walkPseudos((pseudo) => {
      if (pseudo.value === ':root') pseudo.replaceWith(selectorParser.pseudo({ value: ':host' }));
    });
    selectors.walkTags((tag) => {
      if (tag.value === 'html' || tag.value === 'body') {
        tag.replaceWith(selectorParser.className({ value: EMBED_ROOT_CLASS }));
      }
    });
  }).processSync(selector);
}

function embeddedValue(value: string) {
  const parsed = valueParser(value);
  parsed.walk((node: ValueNode) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'url') return false;
    if (node.type !== 'word') return;

    const rem = node.value.match(/^(-?(?:\d+\.?\d*|\.\d+))rem$/i);
    if (rem) {
      node.value = `calc(${rem[1]} * var(${EMBED_REM_PROPERTY}))`;
      return;
    }

    const viewport = node.value.match(/^(-?(?:\d+\.?\d*|\.\d+))(?:d|s|l)?v(w|h|min|max)$/i);
    if (viewport) {
      const [, amount, axis] = viewport;
      const unit = axis.toLowerCase() === 'w'
        ? 'cqw'
        : axis.toLowerCase() === 'h'
          ? 'cqh'
          : axis.toLowerCase() === 'min'
            ? 'cqmin'
            : 'cqmax';
      node.value = `${amount}${unit}`;
    }
  });
  return parsed.toString();
}

function mediaAlternatives(params: string) {
  const groups: ValueNode[][] = [[]];
  for (const node of valueParser(params).nodes) {
    if (node.type === 'word' && node.value.toLowerCase() === 'or'
      || node.type === 'div' && node.value === ',') {
      groups.push([]);
    } else {
      groups.at(-1)!.push(node);
    }
  }
  return groups.map((nodes) => valueParser.stringify(nodes).trim()).filter(Boolean);
}

/**
 * Produces the CSS representation consumed inside the extension's Shadow DOM.
 * It operates on the normal compiled landing-page CSS, so authors maintain one
 * page and one stylesheet graph.
 */
export function createEmbeddedCss(css: string) {
  const root = postcss.parse(css);

  root.walkRules((rule) => {
    rule.selector = embeddedSelector(rule.selector);
  });
  root.walkDecls((declaration) => {
    declaration.value = embeddedValue(declaration.value);
  });
  root.walkAtRules('media', (media) => {
    const alternatives = mediaAlternatives(media.params);
    if (!alternatives.some((condition) => viewportCondition.test(condition))) return;

    const replacements = alternatives.map((condition) => {
      const rule = postcss.atRule({
        name: viewportCondition.test(condition) ? 'container' : 'media',
        params: viewportCondition.test(condition) ? `remote-content ${condition}` : condition,
      });
      rule.append(media.nodes?.map((node) => node.clone()) ?? []);
      return rule;
    });
    media.replaceWith(...replacements);
  });

  return root.toString();
}
