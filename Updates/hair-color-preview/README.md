# Hair, color and stance studio

Open `/Updates/hair-color-preview/` using `python3 tools/preview_server.py 8000` from the repository root.

- 20 reproducibly selected male and 20 female hairstyles, native palette IDs 0–8.
- All 19 classes and allowed weapon families; **idle, walking and attack**, each front/side/rear.
- 81,000 selectable combinations. The sample plan caches 1,524 looks; this delivery also includes 12 extra starter views.
- Ordinary native idle/walk can stow weapons. Attack uses the authored weapon-specific action.
- Visual prototype only; no live gameplay/save/deployment changes.

Read [INTEGRATION-HANDOFF.md](INTEGRATION-HANDOFF.md) for IDs, source links, methods and the live integration plan. Read [PERFORMANCE-AND-HOSTING.md](PERFORMANCE-AND-HOSTING.md) for measured costs and how to keep Cloudflare hosting within the free plan.

The compact HTML download includes starter looks for all three stances and gallery thumbnails; other choices need internet. To restore the full local sample studio, extract the source ZIP **and all three art ZIPs** into one repository root. The separate binary bundle is a packing proof only.

`audit.json` pins native image URLs/hashes, frame/timing/bounds checks and weapon visibility. `validation-summary.json`, `asset-costs.json` and `browser-benchmark.json` distinguish observed results from projections.
