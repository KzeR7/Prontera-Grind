# 3D Sanctuary asset study — not the in-game gym

This is a **source evaluation**, not an implementation or a finished gym. Run
`python3 -m http.server 8792 --bind 0.0.0.0` in this directory; rotate the
sample with a pointer and zoom with the wheel. The building shown is a quick
assembly of real authored pieces, not the owner's open-courtyard design. It is
intentionally separate from the game. Rebuilding the gym still requires
custom assembly to match the reference, including the two wings, open centre,
roof/perimeter layout, navigation and visual testing. The trees shown are
actual 3D mesh models; some individual foliage elements are alpha-masked mesh
surfaces, rather than a single flat full-tree billboard. Placement, clipping,
performance on mobile and collision would need testing before in-game use.

## Sources and provenance

- `kit/`: seven models from Quaternius's **Medieval Village MegaKit**, free
  Standard version. [Creator listing and license](https://quaternius.itch.io/medieval-village-megakit)
  and [mirror](https://github.com/J-Ponzo/gltf-medieval-village-megakit/tree/21104b4045261c28fc312360841ed1a7b0ac8782)
  at commit `21104b4045261c28fc312360841ed1a7b0ac8782`, directory `glTF/`.
  The official marketing scene uses more than the free subset; it is not a
  screenshot of this sample. CC0 1.0.
- `nature/`: `CommonTree_1` and its bark/leaf maps from Quaternius's free
  Standard [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html),
  [mirror](https://github.com/alozionn/terrain-generator-godot-csharp/tree/43172f4259351fcabd5071fa6e801b7f2267b844/assets/nature)
  at commit `43172f4259351fcabd5071fa6e801b7f2267b844`, directory
  `assets/nature/`. CC0 1.0. Both packs' free editions have fewer assets than
  the full paid editions. `CC0-LICENSE.txt` contains the license text.
- `three.js`, `gltf.js`: Three.js r128 and its `GLTFLoader`, MIT license in
  `THREE-LICENSE.txt`; these are local to the study and not a game dependency.

All `.bin` mesh data are byte-for-byte from their pinned mirror. The glTF JSON
was adjusted for this lightweight r128 study: unused normal and roughness maps
were removed from materials, metalness set to zero, and the roof's original
UV1 is used as UV0 to match r128. Base-color images were downscaled to at most
512 px, except the already-small leaf image. These are not the full original
resolution or engine-specific shaders. Sample SHA-256 mesh hashes:

- `kit/Roof_RoundTiles_8x14.bin`: `2a9de46dee87ea46c6b1ff9d4da811817cc48b2c287c15db5edf13f9475591ea`
- `kit/Wall_Plaster_Straight.bin`: `986bf171c62e9019eea9aab709d19d07a3bd5021ff76ab749f57563f364858f3`
- `nature/CommonTree_1.bin`: `9dd689e84e1aa2f5b08db8def591254d582783c73737af54ba0d89b3e549c3ae`
