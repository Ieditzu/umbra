# Walking human

`walking-human.glb` is a rigged, skinned human mesh by **Quaternius**, released under **CC0 1.0**. It includes a skeletal walk cycle rather than procedural stick-figure limbs.

Source: the original `assets/human.glb` preserved by [UMRAM, Bilkent University](https://github.com/UMRAM-Bilkent/supine-human-model/tree/728f23ab5eb9d6cb2c8fb39acb3440bd81db0d3e). This is the original animated model, not their static supine derivative. [Quaternius](https://quaternius.com/) is the original author.

Umbra retains the body mesh, skeleton and walk animation; removes unused animations and textures; and applies a neutral clay material to match the scene. The source is normalized to 1.75 metres at runtime. See `CC0-LICENSE.txt` for the supplied license.

To reproduce the bundled asset, download `assets/human.glb` from the pinned source revision, then run:

```bash
python scripts/prepare_showcase_human.py /path/to/human.glb frontend/public/models/walking-human.glb
```
