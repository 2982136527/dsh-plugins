/**
 * dsh-mobile — host half.
 *
 * Intentionally empty: every behavior of this plugin is browser-side
 * (mobile viewport tuning). The host half exists so the package is a valid
 * loader entry whose `dsh.client` declaration the client-modules scanner
 * composes into the web boot graph.
 */

export const name = 'dsh-mobile'

/** Mount the host half (no-op by design). */
export function apply() {
  // All behavior lives in lib/client.js.
}
