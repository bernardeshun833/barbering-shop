import { useState } from "react";

/**
 * Walks a list of candidate files, moving to the next when one fails to load,
 * and reports exhaustion so the caller can fall back to drawn artwork. SVG is
 * tried before PNG; a PNG renamed to .svg would be served with the wrong
 * content type and silently refuse to render, so both are listed properly.
 */
function useImageCandidates(sources: string[]) {
  const [index, setIndex] = useState(0);
  return {
    src: sources[index],
    exhausted: index >= sources.length,
    onError: () => setIndex((i) => i + 1)
  };
}

/**
 * Crown over crossed scissors, drawn so the app has a mark before the shop's
 * artwork arrives. Replaced automatically by public/logo-mark.svg when that
 * file exists — see public/brand/README.md.
 */
export function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* crown */}
      <path d="M14 13.5 L17.5 17 L24 10.5 L30.5 17 L34 13.5 L32.5 21 L15.5 21 Z" />
      {/* blades */}
      <path d="M17 25.5 L33 40" />
      <path d="M31 25.5 L15 40" />
      {/* finger holes */}
      <circle cx="16.5" cy="28" r="3.1" />
      <circle cx="31.5" cy="28" r="3.1" />
    </svg>
  );
}

/**
 * The full lockup.
 *
 * Prefers the shop's own artwork and falls back to the drawn mark plus the
 * device's serif, so the app is never without a brand and never shows a
 * broken image. `stacked` is the tall version for the lock screen; the inline
 * version sits in the header beside the tabs.
 */
export default function Brand({
  stacked = false,
  className = ""
}: {
  stacked?: boolean;
  className?: string;
}) {
  const lockup = useImageCandidates(["logo.svg", "logo.png"]);
  const mark = useImageCandidates(["logo-mark.svg", "logo-mark.png"]);

  if (stacked) {
    // The lockup file carries mark, wordmark and strapline together, so when
    // it loads it stands alone rather than being captioned twice.
    if (!lockup.exhausted) {
      return (
        <div className={`flex flex-col items-center ${className}`}>
          <img
            src={lockup.src}
            alt="Effé Barbering Shop"
            className="h-44 w-auto max-w-[80%] object-contain"
            onError={lockup.onError}
          />
        </div>
      );
    }

    return (
      <div className={`flex flex-col items-center ${className}`}>
        <LogoMark className="h-20 w-20 text-gold-300" />
        <p className="wordmark text-5xl leading-none">Effé</p>
        <p className="mt-2 text-[0.65rem] uppercase tracking-[0.35em] text-cream/55">
          Barbering Shop
        </p>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {mark.exhausted ? (
        <LogoMark className="h-9 w-9 text-gold-300" />
      ) : (
        <img src={mark.src} alt="" className="h-9 w-9 object-contain" onError={mark.onError} />
      )}
      <span className="wordmark text-2xl leading-none">Effé</span>
    </div>
  );
}
