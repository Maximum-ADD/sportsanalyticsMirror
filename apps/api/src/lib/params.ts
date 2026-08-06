// Route params are typed string | string[] in Express 5 to account for
// repeated path segments; none of our routes have those, so this narrows safely.
export function getPathParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
