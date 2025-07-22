export type Awaitable<T> = T | Promise<T>;

export async function asyncReplace(str: string, regex: RegExp, asyncFn: (x: RegExpMatchArray) => Awaitable<string|null|undefined>) {
  const matches = [...str.matchAll(regex)];

  const replacements = await Promise.all(
    matches.map(async match => {
      const replacement = await asyncFn(match);
      return { match, replacement };
    })
  );

  let result = str;
  replacements.reverse().forEach(({ match, replacement }) => {
    result = result.slice(0, match.index) + (replacement ?? match[0]) + result.slice(match.index + match[0].length);
  });

  return result;
}

export function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '';
  strings.forEach((string, i) => {
    str += string + (values[i] ?? '');
  });
  return str.trimEnd();
}