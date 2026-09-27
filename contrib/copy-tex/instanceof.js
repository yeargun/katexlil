// `value instanceof constructor`, as upstream's copy-tex writes it. LilScript has no
// `instanceof` for host values yet; the compiler embeds this module into
// dist/contrib/copy-tex.mjs (lilscript.copy-tex.toml, host_modules = "embed"),
// so nothing loads it at run time.
export function isInstance(value, constructor) {
  return value instanceof constructor;
}
