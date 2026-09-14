# Shop images

Drop the shop's own photographs into `public/` with these exact names and they
appear on the next build. Each one is optional: the app hides the slot entirely
if the file is missing, so nothing looks broken while they are being produced.

| File | Where it appears | Suggested size |
| --- | --- | --- |
| `public/backdrop.jpg` | Behind the lock screen, top ~26rem | 1200 × 1600 portrait |
| `public/header.jpg` | Thin strip behind the Effé header | 1200 × 300 landscape |
| `public/today.jpg` | Panel under the day's entries | 1200 × 900 |
| `public/logo.svg` | Replaces the drawn mark (see src/components/Brand.tsx) | vector |

Notes:

- Dark, warm images work best — the UI puts a dark scrim over each one so
  text stays readable in daylight, and a bright photo fights that.
- Keep each under ~300KB. The tablet caches them for offline use, and every
  extra megabyte is a slower first load on a bad connection in Kumasi.
- These files are the shop's own assets. Do not drop in stock photography that
  has not been licensed for the purpose.
