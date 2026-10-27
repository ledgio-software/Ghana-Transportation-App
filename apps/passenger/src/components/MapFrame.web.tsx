/** A Google map shown inside the web app (iPhone). The Android version is MapFrame.tsx. */
export function MapFrame({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      loading="lazy"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ width: '100%', height: 320, border: '1px solid #C8C8C8', borderRadius: 10 }}
    />
  );
}
