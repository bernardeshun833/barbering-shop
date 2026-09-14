/**
 * Minimal stand-ins for the Deno globals the edge functions use, so `tsc` can
 * typecheck them alongside the rest of the codebase.
 *
 * The functions run on Deno in production and are never bundled by Vite; this
 * file exists purely so a mistake in the nightly job is caught by `npm run
 * lint` rather than at 21:30 in Kumasi.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
