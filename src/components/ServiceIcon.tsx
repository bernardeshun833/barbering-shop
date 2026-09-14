const props = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

const Scissors = () => (
  <g {...props}>
    <circle cx="7" cy="18" r="2.6" />
    <circle cx="17" cy="18" r="2.6" />
    <path d="M8.8 16.2 17 5" />
    <path d="M15.2 16.2 7 5" />
  </g>
);

const ScissorsComb = () => (
  <g {...props}>
    <circle cx="6.5" cy="17.5" r="2.2" />
    <path d="M8 16 15.5 6.5" />
    <path d="M5 6.5 10 12.5" />
    <path d="M13.5 20.5h7v-3h-7z" />
    <path d="M15 17.5v-2M17 17.5v-2M19 17.5v-2" />
  </g>
);

// Moustache over a goatee — facial hair alone, with no face around it, which
// is what stops it reading as a mask at 28px.
const Beard = () => (
  <g {...props}>
    <path d="M4.5 8.4c2.2-2.1 5.4-2 7.5.6 2.1-2.6 5.3-2.7 7.5-.6" />
    <path d="M12 9c-1.4 1.6-4.6 2.4-7.5-.6" />
    <path d="M12 9c1.4 1.6 4.6 2.4 7.5-.6" />
    <path d="M8 13.2c0 4 1.8 6.6 4 6.6s4-2.6 4-6.6" />
  </g>
);

// A double-edge blade: the clearest shorthand for shaving at 28px.
const Razor = () => (
  <g {...props}>
    <rect x="3.5" y="7.5" width="17" height="9" rx="1.5" />
    <rect x="9" y="10.5" width="6" height="3" rx="1" />
    <path d="M3.5 10.5h2.2M3.5 13.5h2.2M18.3 10.5h2.2M18.3 13.5h2.2" />
  </g>
);

const Kid = () => (
  <g {...props}>
    <circle cx="12" cy="13" r="6.5" />
    <path d="M7 8c1.5-3 8-3 10 0" />
    <path d="M10 13h.01M14 13h.01" />
    <path d="M10.5 16.5c1 .8 2 .8 3 0" />
  </g>
);

const Clipper = () => (
  <g {...props}>
    <rect x="8" y="2.8" width="8" height="10.4" rx="1.5" />
    <path d="M8 13.2h8l1 3H7z" />
    <rect x="6.2" y="16.2" width="11.6" height="2.6" rx="0.8" />
    <path d="M8 18.8v1.8M10.4 18.8v1.8M12.8 18.8v1.8M15.2 18.8v1.8" />
    <path d="M10 6h4" />
  </g>
);

/**
 * Matched on the service name rather than stored per row, so adding a service
 * in the database needs no code change — an unrecognised one simply gets the
 * scissors. Order matters: "haircut + beard" must be tested before "haircut".
 */
const RULES: { match: RegExp; icon: () => JSX.Element }[] = [
  { match: /beard.*(cut|\+)|(\+|and).*beard|haircut.*beard/i, icon: ScissorsComb },
  { match: /beard|moustache/i, icon: Beard },
  { match: /shave|razor|hot towel/i, icon: Razor },
  { match: /kid|child|boy/i, icon: Kid },
  { match: /line.?up|edge|shape|clipper|fade/i, icon: Clipper },
  { match: /.*/, icon: Scissors }
];

export default function ServiceIcon({
  name,
  className = "h-7 w-7"
}: {
  name: string;
  className?: string;
}) {
  const Icon = RULES.find((r) => r.match.test(name))!.icon;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <Icon />
    </svg>
  );
}
