/** Dispatched by the header's help button so it can open the panel without prop-drilling
 * through MainLayout — GlobalHelp is mounted once at the app root, outside the layout. */
export const OPEN_HELP_EVENT = 'eformation:open-help'

export function openGlobalHelp() {
  window.dispatchEvent(new Event(OPEN_HELP_EVENT))
}
