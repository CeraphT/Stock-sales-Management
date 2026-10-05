/** The last route the user was on before opening Support — attached to the
 * request as context. Updated by the Shell on every navigation (Support itself
 * excluded). A plain module variable is enough: it's read once on submit. */
let lastScreen: string | null = null;

export function setLastScreen(path: string): void {
  if (path !== "/support") lastScreen = path;
}

export function getLastScreen(): string | null {
  return lastScreen;
}
