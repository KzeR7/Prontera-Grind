# Art and production specification

## Visual target

Original PC RO is the reference for readability and material richness. Upgrade the craft through richer painted forms and controlled animation while retaining compatibility with native sprites. This is not a plan to simulate an entire modern rendering engine or copy every original skill silhouette.

Every attack needs a recognizable main shape, a localized contact, then a readable decay. Solid objects have dark roots, midtone bodies and small bright edges. Fire has a light core, colored body and darker smoke. Magic may be luminous but should have distinct internal structure. Use few purposeful accents rather than uniform rings and sparks on everything.

## Material recipes

| Material | Body and texture | Contact and decay |
| --- | --- | --- |
| Grimtooth | Warm gray/ivory cutting ridge, charcoal weathered root, restrained violet crevices; irregular hooked silhouettes | Cracked ground, concentrated pale bite/contact, directional chips, heavy dust settling low |
| Steel/arrow | Cool dark body, narrow painted highlight, tapered asymmetric streak; arrowhead remains legible | Local angular spark and short fragments; minimal glow |
| Fire | Pale yellow core, saturated orange body, red/dark folds; irregular flame lobes | Short hot bloom, ejecta, separate gray/brown soot that expands and loses density |
| Ice | Dark cyan interior, pale facets and sharp uneven edges | Hard fracture into distinct shards, then fine frost; avoid soft blue bubble |
| Lightning | Broken irregular branches, narrow bright core, restrained blue-violet halo | Fast flickering contact cluster, then brief residual arcs; avoid steady neon tube |
| Earth/heavy physical | Opaque rough slabs, darker sides, dust with varied density | Upward/displaced mass, localized debris and low settling dust |
| Holy | Warm cream body and gold structure, engraved motifs, focused white accents | Defined beam/sigil contact; avoid persistent white cover over target |
| Shadow/gravity | Deep indigo body, spectral edges, broken fragments | Directed movement; inward pressure for gravity, not generic outward explosions |
| Buff/heal | Restrained readable emblem/material tied to skill identity | Quieter than attacks, no false damage contact; short clear assembly and fade |

These are proposed palettes/materials. The owner approved the small-tooth maw shape, not a final tooth palette; demonstrate the palette in the first pilot.

## Asset production

1. Draw a still material/silhouette study at 4x intended display scale; test downsampled to actual target size immediately.
2. Author a consistent component and keyframe set. Use a digital painting/raster workflow or generated concept/component art with deliberate cleanup and animation. Keep random seeds/prompts where applicable. Procedural code remains suitable for packing, transforms and secondary particles.
3. Export RGBA PNG sources with clean transparent edges. Keep editable layered sources and provenance. Do not recolor supplied character sprites.
4. Give each frame explicit duration, crop rectangle, pivot, padding, material/blend, depth pass and variant. Preserve pivot through tight trimming. Do not stretch the same frame across all skills.
5. Pack deterministic, extruded/padded atlas cells with max 2048px edges. Choose WebP lossless or PNG based on alpha/detail testing; measure actual bytes and decoded memory. Atlas dimensions and frame counts in the asset register are proposed, not already created.
6. Keep source art under a dedicated tooling/source directory and only packed runtime assets under `assets/`. Extend the existing generator or add a small packer when warranted. Keep tools and references out of published `dist/`.

## Brief template for future artwork generation

Use this with the relevant registered asset; read the image-generation skill first if using that tool:

> Original fantasy RPG skill-effect component for Prontera Grind, designed beside crisp native 2D sprites on an isometric battlefield. [asset subject and view]. Strong readable silhouette at [intended size], painted material with dark/midtone/light structure, asymmetric natural detail, controlled highlights. [palette and phases]. Transparent RGBA background with no environment, lettering, UI, character or checkerboard. Maintain consistent camera, light direction, pivot and form across selected keyframes. No plastic gloss, broad neon outline, uniform radial star or large foggy halo.

Generation is only a production aid. Reject inconsistent anatomy/forms across frames, baked terrain, unstable lighting, fake transparency and details that disappear at native scale. A pretty generated image is not a ready sprite sheet.

## Proposed frame metadata contract

For implementation, define `id`, `version`, `atlas`, `textureSize`, `sourceHash`, `colorMode` (`preserve`/explicit variant), `frames` (rect/pivot/durationMs), `layers` (asset/startMs/depthPass/blend/opacity/scale), and `limits` (resident bytes/cache count). Validate bounds, frame duration positivity, alpha padding and referenced IDs. This proposal does not install a runtime loader or fix a final manifest format prematurely.

Separate attachment footprint (ground), body scale (teeth/projectile), contact readability minimum, and decorative particle density. A tiny monster must not make every hit invisible; a boss must not cause the entire screen to bloom.
