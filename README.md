# Custom Stream Quality for TestCord

An independently written replacement for TestCord's Custom Stream Quality plugin. This repository contains MIT licensed source. TestCord itself has a separate GPL license.

The plugin has separate controls for encoded quality and advertised stream parameters. For example, it can request a 1080p, 60 FPS encode while advertising 8K, 360 FPS in stream parameters. Discord may still show actual or negotiated quality to viewers. The badge display needs a viewer check on each Discord update.

## Install

1. Back up `src/testcordplugins/StreamQuality` in a TestCord checkout.
2. Replace that directory's `index.tsx` with `src/index.ts` from this repository and copy `src/quality.ts` beside it. Rename `index.ts` to `index.tsx`.
3. Build TestCord with `pnpm build`. Keep the existing plugin name so settings are preserved.
4. Restart Discord when it is safe, then check the stream badge from a second account.

The plugin applies updated stream parameters when settings change. HDR capture changes apply to new screen shares.

## Check

From a TestCord checkout with dependencies installed, run:

```sh
node --import tsx --test path/to/CustomStreamQuality-UserPlugin/tests/quality.test.ts
```

The tests cover the stream parameter hook, quality controls, disabled toggles, and 8K/360 advertisement with 1080p/60 encoding settings. They do not prove what a remote Discord client renders.

## Origin and license

This replacement implements the same user facing idea and preserves TestCord's setting keys. It does not include code from TestCord's GPL licensed plugin. It is a new repository because a GitHub fork of the GPL source could not be relicensed under MIT.
