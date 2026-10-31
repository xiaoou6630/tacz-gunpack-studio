/**
 * Minimal tool definition helper. DSH's registry accepts this shape directly;
 * keeping it local avoids importing host packages from a link-installed bundle.
 *
 * @param {object} definition Tool name, description, JSON Schema parameters, output, and execute.
 * @returns {object} The same definition.
 */
export function defineTool(definition) {
  if (!definition || typeof definition !== "object") throw new TypeError("defineTool expects an object");
  if (typeof definition.name !== "string" || !definition.name) throw new TypeError("tool.name is required");
  if (typeof definition.execute !== "function") throw new TypeError("tool.execute must be a function");
  return definition;
}
