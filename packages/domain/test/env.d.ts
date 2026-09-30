// Minimal ambient types for tests. The domain tsconfig loads no Node or DOM types on purpose
// (src must stay pure), so tests declare the few runtime APIs they use.

declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}

interface ImportMeta {
  readonly url: string;
}

declare class URL {
  constructor(url: string, base?: string | URL);
  readonly href: string;
  readonly pathname: string;
}

declare const performance: { now(): number };
