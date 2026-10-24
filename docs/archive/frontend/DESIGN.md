# Umbra interface

The public site, customer dashboard, research studio and exported evidence reports share a black, mineral-white and turquoise palette. Geist is bundled locally. Display typography is larger on the public site; the workspaces use quieter, compact controls.

- Base: `#080909`; surface: `#0f1110`; elevated surface: `#171a18`.
- Text: `#eff2ee`; secondary text: `#969f99`; borders: `#262c28`.
- Evidence and primary controls: `#68ead2`.
- Controls use a 5px radius; panels use 6–8px. No atmospheric effects in dashboard workflows.

## Interactive corner

`src/components/CornerShowcase.tsx` owns accessible playback, scrub and viewpoint controls. `CornerWorld.tsx` is lazy-loaded and renders real Three.js geometry through React Three Fiber. A fixed camera, occluding concrete building and walking subject produce cast shadows. Perspective, camera and overhead views use the same scene.

This is an illustrative scene, not a real analysis or performance claim. On the landing page it autoplays once from the beginning after the 3D model is ready and visible. Reduced-motion preferences keep it paused; the compact authentication showcase also starts paused. Playback pauses when offscreen or the tab becomes hidden and uses on-demand rendering when idle. Pause, replay and scrub remain available. The text sequence remains useful if WebGL is unavailable.

The person is a locally bundled CC0 Quaternius skinned human mesh with a skeletal walking clip. `WalkingHuman.tsx` normalizes its height, smooths its surface normals, and samples the walk from the shared sequence playhead, so scrubbing and pausing preserve the correct pose and shadow. Asset provenance and the license are in `public/models/`.

## React Bits

BlurText and SpotlightCard were retrieved from the official React Bits registry through the shadcn MCP. Their vendored source is in `src/components/react-bits`, with the original license preserved. BlurText is adapted to work inside semantic headings and honor reduced motion. SpotlightCard is restricted to the two marketing capability panels, with ambient movement, grain and click flares disabled.

The root `components.json` registers `@react-bits` for future MCP lookups. The registry is `https://reactbits.dev/r/{name}.json`.

## Checks

Run the frontend build, TypeScript lint and format check. Review the public pages, dashboard forms/results/billing, and `/research.html` against the local research API. Check desktop and mobile layouts, the three 3D viewpoints, play/pause/scrub, keyboard navigation, reduced motion, and the WebGL fallback. Backend accounts, jobs, credits and payment behavior are unchanged by this redesign.
