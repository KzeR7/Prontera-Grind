# CC0 Sanctuary art sources

These files are third-party CC0 assets, not Ragnarok or Digimon sprites. The
browser copies are local; no runtime request goes to a third-party site.

* `medieval_wood.webp` — [Medieval Wood](https://polyhaven.com/a/medieval_wood),
  Rob Tuytel, Poly Haven, CC0 1.0.
* `roof_09.webp` — [Roof 09](https://polyhaven.com/a/roof_09), Rob Tuytel,
  Poly Haven, CC0 1.0.
* `rough_pine_door.webp` — [Rough Pine Door](https://polyhaven.com/a/rough_pine_door),
  Dimitrios Savva, Poly Haven, CC0 1.0.
* `rubberduck-isometric-trees.png` — [Isometric trees](https://opengameart.org/content/isometric-trees-1),
  rubberduck, CC0 1.0. The game uses the fifth tree in the first row only.

The Poly Haven files are 256 px WebP diffuse-map derivatives of the 1K
originals, from the [CC0 mirror](https://github.com/NeuralDrifter/Retro_FPS_GCS-assets)
commit `6dba7aaefbba78fa1d9afecf2faa3e384b1ad69c`, under
`textures/Poly Haven/{Wood,Roof}`. They are not the full 8K source maps.
The tree sheet was obtained from the [Cursed Lands repository](https://github.com/cwikmj/cursed-lands-isometric-rpg)
commit `a1258dfdd8dcc2c42e651ed6e623d47708c2002d`, path
`assets/maps/trees.png`; its README identifies the linked rubberduck pack.

Run `bash tools/digimon/copy_cc0_materials.sh` and
`bash tools/digimon/build_cc0_tree.sh` to reproduce the delivery assets.
The crop/trim/resize/conversion step uses ImageMagick; the original sheet is
retained here for provenance. CC0: https://creativecommons.org/publicdomain/zero/1.0/
