/**
 * Crown over crossed scissors, drawn rather than imported so the shop's mark
 * ships inside the bundle and renders on a tablet that has never been online.
 *
 * To use the real artwork instead, drop it at public/logo.svg and swap the
 * <LogoMark> body for an <img src="logo.svg" />; nothing else here changes.
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
 * The full lockup. `stacked` is the tall version for the lock screen; the
 * inline version sits in the header beside the tabs.
 */
export default function Brand({
  stacked = false,
  className = ""
}: {
  stacked?: boolean;
  className?: string;
}) {
  if (stacked) {
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
      <LogoMark className="h-9 w-9 text-gold-300" />
      <span className="wordmark text-2xl leading-none">Effé</span>
    </div>
  );
}
