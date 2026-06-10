// Node ESM resolve hook: the engine uses Vite-style extensionless relative imports
// (e.g. `import ... from "./ModelIndex"`). Node's ESM resolver requires explicit extensions,
// so on a bare-specifier miss we retry with a ".js" suffix. Registered by scripts/headless.mjs
// before the engine is dynamically imported.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$|\.json$/i.test(specifier)) {
      return nextResolve(specifier + ".js", context);
    }
    throw err;
  }
}
