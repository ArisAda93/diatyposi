// Module hook used by scripts/content-review.mjs: resolves the `~/` alias and extensionless
// relative imports to the TypeScript sources (Node strips the types itself).
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = fileURLToPath(new URL('../src/', import.meta.url));

registerHooks({
  resolve(specifier, context, nextResolve) {
    let spec = specifier;
    if (spec.startsWith('~/')) spec = pathToFileURL(src + spec.slice(2)).href;
    if ((spec.startsWith('file:') || spec.startsWith('.')) && !/\.[a-z]+$/i.test(spec)) {
      const base = spec.startsWith('.') ? new URL(spec, context.parentURL) : new URL(spec);
      if (existsSync(fileURLToPath(base) + '.ts')) spec = base.href + '.ts';
    }
    return nextResolve(spec, context);
  },
});
