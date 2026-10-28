/**
 * After a new version is deployed, a page that was already open (often the iPhone home-screen
 * app) still runs the old code and asks for screen files that no longer exist. Reload once to
 * pick up the new version instead of showing a broken screen. Native apps load all code at
 * start, so this is web only (staleBuild.ts is empty).
 */

const KEY = 'stale-build-reload-at';
const MIN_GAP_MS = 60_000;

function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    // A failure right after reloading is a real outage, not an old page; do not loop.
    if (Date.now() - last < MIN_GAP_MS) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Without sessionStorage we cannot guard against loops, so do not reload.
    return;
  }
  window.location.reload();
}

const isOldBundleError = (message: string) =>
  /Loading module .* failed|Requiring unknown module|Unexpected token '<'/.test(message);

if (typeof window !== 'undefined') {
  // A screen file that fails to load (404 after a deploy). Script errors do not bubble, so listen while capturing.
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLScriptElement | null;
      if (target?.tagName === 'SCRIPT' && target.src.includes('/_expo/static/')) reloadOnce();
      else if (isOldBundleError(event.message ?? '')) reloadOnce();
    },
    true,
  );
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { name?: string; message?: string } | undefined;
    if (reason?.name === 'AsyncRequireError' || isOldBundleError(reason?.message ?? '')) reloadOnce();
  });
}

export {};
