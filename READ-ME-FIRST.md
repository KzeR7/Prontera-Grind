# Prontera Grind — read me first

> **Agents: read [AGENTS.md](AGENTS.md) first.** It is the shared rulebook and it
> links to the current guide for each system. This file is only a map of where
> things are; it is deliberately short because it used to be 1,400 lines of build
> notes that no longer described the game.

A browser Ragnarok-flavoured idle/grind game. The player makes an account, picks a
field, and the character farms: Base/Job EXP, Zeny, gear, cards, pets, then
Nightmare, Ascension fields, Endless Echo and the fourth jobs.

## Where the game lives

- `index.html` — most of the game: HTML, CSS and JavaScript inline, Three.js from a
  CDN, no bundler and no root `package.json`. `const BUILD` in its script block is
  the tag on the login card; bump it for player-visible changes only, and keep its
  three mirrors in step (`Updates/cards-gear-audit/affix-ranges.html`,
  `Updates/cards-gear-audit/equipment-cards-tuning.html`,
  `tools/cloudflare-deploy-steps.md`).
- `assets/` — the separate modules and generated data: wardrobe, pets, skill icons,
  Overdrive/Afterglow skill FX, `boss-fx.js`, native fields, Ascension scenery,
  mobs, audio, the shop, social, and the generated `*_data.js` packs.
- `functions/` + `migrations/` — Cloudflare Pages Functions and D1 SQL for cloud
  accounts, saves, leaderboard, GM tools and the Cash Shop.
- `workers/social` — the world-chat / plaza Durable Object.
- `gm.html` — the GM console (a client of `/api/gm/*`; it holds no authority itself).

[Code map](docs/CODE-MAP.md) turns a task into the symbols and tests to look at.
Do not guess a system's location from this file.

## Run it, test it, publish it

All of it is in [Development and testing](docs/TESTING.md) — read that instead of
copying commands from an old note. In short:

```sh
bash tools/build_site.sh && node tools/dev_server.js    # game + accounts + GM, http://localhost:8788/
python3 tools/preview_server.py 8000                    # game + the dev/art pages, http://localhost:8000/
```

The host's publish directory is **`dist/`**, never the repo root — the root also
holds tools, art sources and audit pages, and `tools/tests/publish_sim.js` fails if
anything dev-side reaches `dist/`. Production `main` deploys itself from the Pages
project; that is the owner's pipeline, not an agent permission. Do not push or
merge `main`, deploy, or apply a remote migration unless the current task says so.

## Playing it on a preview (and GM)

The GM password is deliberately not written down here. For a disposable preview use
`node tools/dev_server.js --gm-all` (and never change the shared GM password for a
test), or open `/gmsetup` on the static preview to set a browser-local GM password.
`node tools/make_gm_hash.js --check "…"` says whether a password is the live one.

## Art and the dev pages

- [Tools — start here](TOOLS-START-HERE.md) — every dev page and generator, what it
  answers, and which ones are history. Open them through the preview server, not as
  `file://`; the class art is animated APNG and the pages decode it themselves.
- `Updates/Sprite/` — the canonical class-sprite backup; refresh it with
  `python3 tools/make_sprite_viewer.py`.
- `Updates/ApngAnimation/` — how the class skins animate and the method to follow
  before touching the hero's art.
- Asset rules (crop/preserve, never invent or recolour) are in
  [AGENTS.md](AGENTS.md) and each pipeline's own README.

## History

- [Update log](docs/UPDATE-LOG.md) — what each build changed. Append-only.
- [Decisions](docs/DECISIONS.md) — the owner's settled choices and why.
- [Archived notes](docs/history/AGENT-NOTES.md) and
  [the archived read-me](docs/history/READ-ME-FIRST-archive.md) — the old build
  notes (v56–v91) and per-build prose, kept verbatim for reference. Historical, not
  a specification.
- [Archived ASPD/movement research](docs/history/aspd-research-2026-10-13/README.md)
  — a 2026-10-13 snapshot from another fork. Nothing in it is a current brief.

**Do not resurrect `UPDATE-BOOTSTRAP.py`.** It shipped a compressed 2026-10-02 (v7)
build of `index.html` and `tools/`, its patches stopped applying by v26, and running
it would restore that old build over the current game. It was deleted in v27 and
lives in git history. The recovery path is git, not a script.
