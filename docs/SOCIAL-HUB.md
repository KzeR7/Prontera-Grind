# World chat and Fountain Plaza

The bottom-left chat replaces the short field feed. World, Whisper and Log
are available from the field; entering Maps → Social Hub adds Local. On desktop (1120px and wider), its bottom aligns with the centered navigation bar.
Its width is capped to the space on the left, so resizing never shifts or covers
the navigation. Narrower screens stack chat above the bar. Market, Log, Wardrobe and Settings are in More (one Market entry).
The minimize line and resize grips are drawn inside the chat border, with no detached button or protruding handle. Click the header line to collapse/expand; its Enter/Space keys work too. Drag the top-right corner grip, the full right inner edge, or the top inner edge (or use arrow keys on `#socialResize`); preferred dimensions persist across device resizing and reloads down to a compact `220×120` floor, with the message scrollbar and Send button spaced clear of the right-edge resize strip. Chat grows to the centered navigation on desktop and to the available screen edge on narrower views.
Enter focuses/sends, Escape leaves typing. Names offer Whisper/Mute. Log retains
the existing category filters and history. Muted IDs are stored per account.

The plaza holds 20 authenticated players; additional arrivals get another numbered
plaza. World spans plazas and fields. Local messages/emotions go only to current
members of that plaza; no Local replay is sent to newcomers. Local lines clear on
leaving/rejoining. Whispers are delivered only to sender and online recipient.
World has a volatile 100-message backlog, and clients retain at most 400 lines.
This is not permanent chat storage or offline mail.

Click/tap to walk; drag to rotate and tilt; wheel/pinch to zoom from a close character view to a plaza overview. Right/Shift-drag or two fingers pan. Camera exposes rotation, tilt, distance, follow and directional pan controls; Reset view restores the defaults. Your character is framed in the upper center. Names appear below the feet, with an equipped Hunt title underneath. Appearance, title and refinement updates preserve your position. Insert or `/sit` toggles sitting; walking stands up. Click one of twelve benches to reserve it, walk to it and sit. Reservations are per plaza and clear on standing, walking or disconnecting. A larger castle,
flanking houses, two market stalls and four bounded corner gardens surround the expanded avenues.
Twelve native slatted park benches form four groups along the fountain promenade; trees stay inside
the gardens, clear of paths. The shared layout defines building/garden collision.
One compact toolbar holds the plaza population, Sit, Camera, Reset view, help and Return to field.
Walking/camera hints are in its help control; Emoji remains beside Send in chat. The Emoji button beside Send opens 32 original RO animations with slash commands
shown on each button. A smaller animation appears with the sender in Local, and a
six-second animation appears overhead with its original transparent pixels and no outer box. Spoken text keeps its speech box. World and private messages never bubble.

## Farming and state

Social is a separate renderer and transient network state. It never replaces `S`,
`pl`, `mob`, `mobs`, the selected field, combat clocks or save ownership. The real
farming simulation, loot, EXP, deaths and auto-advance keep running, while hidden
3D field WebGL/canvas rendering pauses behind `#socialHub` and resumes immediately
on return (open window previews still update live). Returning to
the field reveals its current state, including any automatic stage progression.
Movement, sitting and social presence are not saved into farming coordinates.
Map BGM uses Theme of Prontera while visiting and restores the current farming
map on exit; manual track choice and volume preferences remain available. Weapon
refinement glows reuse the native weapon/arm effect hooks in standing, walking and
sitting poses. Character downloads retry automatically, retaining the standing
sprite while sitting assets load; reentry uses fresh player labels and sprites.
Arrivals spread across free entry positions so players do not spawn on top of one another.
When visiting from a local/offline character or before the multiplayer room handshake finishes,
the plaza renders your character locally with full click-to-walk, bench sitting, Sit/Insert toggle
and live wardrobe/refinement updates, then seamlessly hands presence over once a room snapshot arrives.
On throwaway `tools/dev_server.js --gm-all` preview hosts (including cross-site iframe previews that
drop third-party cookies or omit `x-forwarded-proto` on WebSocket upgrades), same-host `Origin`
checks accept `http`/`https` host matches, `Set-Cookie` uses `SameSite=None; Partitioned` over HTTPS,
and `X-Preview-Session` / `preview_session` preserves authenticated cloud + plaza sessions without
affecting production Pages cookie-only ingress.

The server computes walking paths/speed and room capacity. Sender IDs/names come
from the existing session, never a client payload. Input is bounded and displayed
as text. Messages and emotions share a three-second cooldown across channels, enforced by
the client and server; movement, chair selection and sitting are bounded to ten
commands per second. Connections reauthenticate
through Pages every five minutes. Another tab replaces the account's old socket;
the replaced tab stays disconnected until reload. Disconnects remove presence.

## Runtime and production configuration

- `functions/api/social.js`: same-origin authenticated WebSocket ingress.
- `workers/social/`: private Cloudflare Durable Object and transport-independent room.
- `assets/social-rules.js`: shared collision, pathfinding and speed.
- `assets/social{,-scene}.js` and `assets/social.css`: chat and native plaza view.
- `assets/social/`: local sitting components, emotions and town models.

**Production prerequisite:** deploy the new Worker before publishing Pages with
its `SOCIAL` binding. The Worker has no public workers.dev endpoint. Only Pages
passes authenticated identity to its Durable Object. No additional D1 migration
or secrets are needed. From an authorized Cloudflare deployment environment:

```sh
npx wrangler deploy --config workers/social/wrangler.toml
# Then publish the usual assembled Pages site with the root wrangler.toml binding.
```

No production deployment is performed by the feature tests. A missing binding
leaves the game playable and shows chat as unavailable. World backlog is lost
when the Durable Object restarts; clients reconnect and rejoin. This first service
uses one coordinating Durable Object for the world and numbered plazas, intended
for the current small community rather than an unbounded global population.

## Local preview and checks

Use Node 24 and the existing test dependencies; add `ws` for the local WebSocket
adapter and Wrangler for Cloudflare runtime checks. This repository has no package
manifest, so retain existing packages when installing optional dependencies:

```sh
npm install --no-save --package-lock=false jsdom three@0.128.0 ws wrangler playwright-core
bash tools/build_site.sh
node tools/dev_server.js --gm-all
```

Open http://localhost:8788/ and register disposable preview accounts. The server
uses the actual API handlers plus the same room core as production, with local
SQLite. Sign in explicitly after each reload, as required by the existing game.

```sh
node tools/tests/social_sim.js
node tools/tests/social_ui_sim.js
node tools/tests/social_scene_sim.js
node tools/tests/social_api_sim.mjs
npx wrangler deploy --dry-run --config workers/social/wrangler.toml --outdir /tmp/social-worker-build
node tools/tests/social_worker_sim.mjs
node tools/check_social_browser.cjs
```

The browser check uses standalone software WebGL through the optional
`@sparticuz/chromium` package and two disposable accounts. It checks real native
standing/sitting pixels, all 32 emotion choices, transparent overhead animations,
close zoom/tilt/rotation/reset, names/titles below the feet, bench clicks/arrival,
chat pointer/keyboard resizing and integrated minimizing, centered desktop dock
alignment, phone bounds, refinement glows, music, channel delivery and reentry.
Shared Preview can verify DOM/Canvas controls with the documented renderer stub
when its Chromium cannot create WebGL; that does not certify rendered pixels.
It uses synthetic weak enemies for a bounded farming assertion; it is not a
balance or physical-phone performance test. `social_sim.js` checks 21 simultaneous
room clients and isolation/overflow; it is not a 20-browser FPS benchmark.

See [native source reproduction](../tools/social/README.md). Existing wardrobe,
UI/map, ownership, combat, API and publishing suites remain applicable.
