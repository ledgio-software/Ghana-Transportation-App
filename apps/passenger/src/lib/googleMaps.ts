/* eslint-disable @typescript-eslint/no-explicit-any */
/** Loads the Google Maps JavaScript API once (web only). */
let loading: Promise<any> | null = null;

export function loadGoogleMaps(key: string): Promise<any> {
  const g = (globalThis as any).google;
  if (g?.maps?.Map) return Promise.resolve(g.maps);
  loading ??= new Promise((resolve, reject) => {
    const callback = '__gtaMapsReady';
    (globalThis as any)[callback] = () => resolve((globalThis as any).google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
