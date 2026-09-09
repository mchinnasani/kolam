// Node's native TS runner needs explicit extensions; source uses bundler resolution.
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error;
    return nextResolve(`${specifier}.ts`, context);
  }
}
