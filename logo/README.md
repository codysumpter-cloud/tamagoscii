# Partner logos

Drop your partner / sponsor / "powered by" logos here as **SVG** or **PNG**
files, then register them in [`logos.json`](./logos.json).

## How to add a partner

1. **Put the file in this folder**
   ```
   logo/
   ├── boundless.svg
   ├── quicknode.svg
   └── logos.json
   ```

2. **Add an entry to `logos.json`**
   ```json
   [
     {
       "name": "Boundless",
       "file": "boundless.svg",
       "url": "https://beboundless.xyz",
       "tagline": "Verifiable compute"
     },
     {
       "name": "QuickNode",
       "file": "quicknode.svg",
       "url": "https://www.quicknode.com",
       "tagline": "XRPL RPC"
     }
   ]
   ```

3. **Refresh the app**. The logos appear in the "POWERED BY" strip
   at the bottom of the login screen, with a link to each partner.

## Tips

- **SVG is preferred** — it scales cleanly on retina screens and keeps the
  final bundle tiny.
- Transparent PNG also works if you don't have SVG.
- Keep each file under **20 KB** (SVGs should be << 5 KB).
- Logos display as a single row and are auto-sized to ~28px tall (40px on
  desktop) with a subtle grayscale filter that lifts on hover.
- For white logos on dark UI, no extra tinting is needed.
- The tagline field is optional; if present it appears as a small label
  next to the logo.

## Rights

Only add logos you have the right to display. Tamagoscii doesn't bundle any
third-party trademarks by default.
