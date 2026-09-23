import { useEffect, useState } from 'react';
import type { Pluggable } from 'unified';

type MathPlugins = {
  remarkMath: Pluggable;
  rehypeKatex: Pluggable;
};

/**
 * KaTeX, its remark/rehype plugins and its stylesheet, fetched the first time a
 * message actually contains math.
 *
 * KaTeX alone is 588 KB and its stylesheet was imported globally from main.tsx,
 * so every user paid for both to read messages that, in the overwhelming majority
 * of sessions, contain no formula at all. Markdown already decided per message
 * whether the plugins should run; this defers the download to that same decision.
 *
 * The loaded module is cached at module scope, so the second formula on the page
 * renders synchronously and later messages never flicker.
 */
let loaded: MathPlugins | null = null;
let loading: Promise<MathPlugins> | null = null;

function loadMathPlugins(): Promise<MathPlugins> {
  if (!loading) {
    loading = Promise.all([
      import('remark-math'),
      import('rehype-katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([remark, rehype]) => {
      loaded = { remarkMath: remark.default, rehypeKatex: rehype.default };
      return loaded;
    });
  }
  return loading;
}

export function useMathPlugins(enabled: boolean): MathPlugins | null {
  const [plugins, setPlugins] = useState<MathPlugins | null>(loaded);

  useEffect(() => {
    if (!enabled || plugins) return;
    let active = true;
    void loadMathPlugins().then(next => {
      if (active) setPlugins(next);
    });
    return () => {
      active = false;
    };
  }, [enabled, plugins]);

  // Until they land the message renders without math, which is the same thing it
  // did before the plugins existed: the delimiters show as written.
  return enabled ? plugins : null;
}
