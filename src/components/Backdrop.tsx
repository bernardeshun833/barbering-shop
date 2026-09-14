import { useState } from "react";

/**
 * An optional brand photograph behind a section of the UI.
 *
 * The shop's own images live in public/ and are not in the repository, so this
 * hides itself if the file is not there rather than leaving a broken frame.
 * Drop the file in and it appears on the next build — no code change.
 *
 * The scrim is not decoration: photographs of a barbershop are busy and mostly
 * mid-tone, and white text on top of one is unreadable in daylight. Everything
 * above it stays legible because the image never gets brighter than this.
 */
/**
 * A standalone image block rather than a background. Returns nothing at all
 * when the file is absent, so a missing photo leaves no empty frame behind.
 */
export function PhotoPanel({
  src,
  className = "min-h-[14rem]"
}: {
  src: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 to-transparent" />
    </div>
  );
}

export default function Backdrop({
  src,
  className = "",
  scrim = "from-ink-900/60 via-ink-900/85 to-ink-900"
}: {
  src: string;
  className?: string;
  scrim?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      <div className={`absolute inset-0 bg-gradient-to-b ${scrim}`} />
    </div>
  );
}
