# Rift Raid — real-browser acceptance artifacts

Produced by `tools/tests/raid_browser_acceptance.cjs`; the full write-up is
`docs/RIFT-RAID-VALIDATION.md` §3.1.

```bash
# Chromium is not shipped with this repo. In this environment it comes from the
# @sparticuz/chromium npm tarball because the Chrome CDN is unreachable.
npm install --prefix /tmp/br2 @sparticuz/chromium
node -e "require('/tmp/br2/node_modules/@sparticuz/chromium').inflate('/tmp/br2/chromium')"
LD_LIBRARY_PATH=/tmp/chlibs/lib PG_PLAY_BUDGET_MS=1020000 \
  node tools/tests/raid_browser_acceptance.cjs
```

The script exits non-zero on any failed assertion and prints a `passed, failed` summary. A complete
run takes about ten minutes of wall clock, because the solo fight is played at its real length
against the real clock — no fake clock is used anywhere.

Each run overwrites `reports/browser-acceptance/*.png` with full-size captures. Those are ignored by
git on purpose: they change on every run, and a dirty working tree stops
`tools/staging/update-and-stage.ps1`. The table below names the committed, compressed `*.jpg` copies
of the same screenshots, which are what the docs link to.

| File | What it shows |
| --- | --- |
| `solo-arena.jpg` | Mid-fight, desktop viewport: the Astral dungeon stage, the stage/objective HUD, the character on the platform. |
| `solo-result-desktop.jpg` | The results panel after the settlement, before any reload. |
| `solo-phone.jpg` | The raid panel at 390×844. |
| `solo-phone-running.jpg` | A solo run started from the phone viewport. |
| `coop-after-deadline.jpg` | The surviving co-op client after the run's deadline had passed. |

**What these do not show.** No video: Playwright records through an `ffmpeg` binary that this sandbox
does not have, and the download host is blocked. No 3D fidelity claim: this headless build has no GPU,
so the dungeon renderer is exercised for load and state flow, not for pixels. And nothing here is a
Cloudflare runtime measurement — the Pages/Workers runtime, DO placement and D1 latency still need
staging.
