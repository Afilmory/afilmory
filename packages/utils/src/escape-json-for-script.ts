/** Escape serialized JSON before embedding it in an HTML script element. */
export function escapeJsonForScript(json: string): string {
  // HTML parses script terminators before JavaScript parses string literals.
  // Escaping every '<' also prevents script-like HTML comments changing parser state.
  return json.replaceAll('<', '\\u003c')
}
