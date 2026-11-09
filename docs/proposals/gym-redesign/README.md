# Sanctuary gym redesign

Draft PR #187 now includes the in-game integration, alongside this editable
three.js r128 study. Latest owner revision: continuous roofs on both side
returns and the rear/center wings, a roofed center veranda, finished internal
side walls, and an entrance sign raised by 2.1 world units. The training-yard
props and painted court retain the reviewed design.

![Overview](screens/01-overview.png)

## Build and review

From the repository root:

```sh
node tools/make_social_gym.mjs
node tools/make_social_gym.mjs --check
node docs/proposals/gym-redesign/geometry-regression.cjs
node tools/tests/social_art_redesign_sim.js
python -m http.server 8792
```

Open `/docs/proposals/gym-redesign/`. Views: `?view=over|entry|power|guard|agility|focus|top`,
with `&labels=0` and `&mobile=1`. Runtime art is generated into
`assets/social-gym-redesign.js`; edit the study source and regenerate together.
The game integration retains its original builder as an asset-load fallback.

## Construction

- Mitered, shared roof contours join all five sides without disconnected slabs.
- Both roof pitches have a continuous skin, lapped courses, ridge caps, fascia
  and supporting rafters. Closed end gables and rear walls give the shell depth.
- Timber frames, recessed glazing, stone sills and braces finish both faces of
  the side returns.
- The entrance board's lower edge is 4.82 units high. Posts, crossbeam, braces
  and suspension hardware were raised with it.
- The veranda has turned posts, knee braces, balusters and supported canopies.
- Four distinct training bays retain their apparatus, banner masts, painted
  contact shading and small props.

## Runtime contracts

The original courtyard-facing wall segments, 14-unit gate opening, gym stations,
session rules and rewards stay fixed. The newly enclosed rooms behind the walls
have a shared browser/Worker collision footprint. The rules fingerprint includes
the five shell sections, so stale Worker rules are detectable. Deploy the matching
Social Worker with the client when this is approved.

No runtime binary assets were added. Roof, timber and plaster use the repository's
existing Sanctuary textures. Vertex-color lighting adds no shadow-map pass.

## Verification

The earlier lost-index batching bug is covered by `geometry-regression.cjs`.
Production-builder tests raycast all five roof sections and the center canopy,
check sign clearance, route to all four gym stations and all eight fishing seats,
and exercise the pond bridge and animation buffers.

Current gym batch count: **45,392 triangles** (floor/decal meshes additional).
This is a geometry count, not a frame-time claim. Current actual-game screenshots
and full-gate results are in [the combined art review](../social-hub-art/README.md).
Visual acceptance remains with the owner; the PR stays draft.
