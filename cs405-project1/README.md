# CS405 Project 1 — Transformations, Projection & Curves from Paintings

**Painting:** Şeker Ahmed Paşa, *Kavunlu Natürmort*, from Sakıp Sabancı Müzesi collection.

A single WebGPU application. The painting hangs on the wall as a textured quad; a table with objects stands in front of it (Part A), a hanging mobile moves above it (Part B), an orbiting camera and a fixed inspection camera look at the scene (Part C), and the outline of the melon is traced with editable curves, with a seed that rides along the curve (Part D).

All matrix and curve maths is written by hand in `src/math/`. No Three.js, gl-matrix or any other maths or scene library is used, and no UI library either.

## Running

```bash
npm install
npm run dev        # then open the printed http://localhost:5173 URL
npm test           # unit tests for the maths (node:test, no extra packages)
npm run build      # optional production build into dist/
```

Requires a browser with WebGPU: current Chrome or Edge, Safari 26+, or Firefox 141+ (Windows; other platforms may need WebGPU enabled in settings).

## Controls

**Mouse (main camera view)**

| Action | Effect |
| --- | --- |
| Drag on empty space | Orbit the main camera around its target |
| Mouse wheel | Zoom (camera distance) |
| Drag a curve point | Move it in the plane of the painting. Diamonds are knots (they carry their handles with them). Squares are Bézier handles (the opposite handle mirrors so the joint stays C¹). |
| Double-click the painting | Add a new knot at the end of the curve (one more C¹ segment) |

The inspection camera is fixed and does not react to the mouse.

**Panel: Views, reset & debug (Part E)**
- *Main camera / Inspection / Split*: switch which camera(s) are shown. Split shows both side by side.
- *Reset scene*: restores the camera, the curve, the object controls and the toggles.
- *Save PNG of 3D view*: downloads a screenshot of the canvas.
- *Node axes*: draws the local x (red), y (green) and z (blue) axes of every scene-graph node.
- *Frustum*: draws the main camera's frustum and its u/v/w axes in the inspection view.
- *Grid* and *Strings*: show or hide the floor grid and the mobile's strings.

**A · Transformations**
- *M = T·R·S / M = S·R·T*: the composition order of the red cube. Both matrices are always shown numerically; the active one is highlighted.
- *Ghost of other order*: a blue wireframe cube placed with the other order, so the two can be compared directly.
- Sliders for translation x/y/z, rotation angle, rotation axis (x/y/z) and uniform scale.

**B · Scene graph**
- *Animate mobile*: rotates the two bars of the hanging mobile. When it is off, θ1 and θ2 can be set by hand.
- The panel prints the tree with every node's world position, and the world matrix of the leaf `cherry` together with its chain of local matrices and a check that the chain product equals the traversal result.

**C · Camera & projection**
- *Perspective / Orthographic*: switch projection at run time.
- *Look straight down*: puts the camera directly above the target, so `up` is parallel to the view direction. The HUD then reports that the fallback up vector is in use.
- Sliders for azimuth, elevation, distance, fov, near and far. Eye, target, the camera basis, V and P are printed on screen.

**D · Curves over the painting**
- *Bézier (C¹ piecewise) / Catmull–Rom*: which curve family is drawn and followed. Catmull–Rom passes through the knots.
- *parameter t*: global curve parameter; the de Casteljau construction is drawn for the segment containing t.
- *Animate rider*: moves the seed along the curve, turned to follow the tangent.
- *de Casteljau* and *Control polygon* toggles, and *Remove last segment*.
- *Export JSON*: downloads `curve.json` with all control points in normalised painting coordinates (u right, v up, origin at the bottom-left corner). The file in this repository is the export of the default trace.

The HUD in the top-left corner shows the frame time, CPU time per frame, vertices submitted per frame, draw calls, and the camera's eye, target, fov, near and far.

## Code structure

```
src/
  math/    mat4.js (matrices, lookAt, perspective, orthographic), vec3.js, curves.js (Bézier, de Casteljau, C¹, Catmull–Rom)
  scene/   node.js (scene-graph node), scene.js (the scene tree), camera.js (orbit + inspection cameras),
           curveModel.js (the editable curve), meshes.js (procedural cube, sphere, pointer, painting quad)
  render/  renderer.js (WebGPU device, pipelines, buffers, render pass), shaders.js (WGSL), debugDraw.js (lines and markers)
  ui/      buildPanel.js, controls.js, input.js, style.css
  main.js  state, frame loop, and the glue between the modules
test/      math.test.js
public/    kavunlu.jpg
curve.json exported curve
report.pdf the report
```

Conventions: matrices are column-major (element (r, c) at index `c*4 + r`), vectors are column vectors, and `M = A·B` applies B first. Every object uses `M = T·R·S`. Clip-space depth follows WebGPU (z ∈ [0, 1]).

`?offscreen` in the URL renders into an offscreen texture instead of the canvas. It exists only for automated screenshots in headless browsers that cannot display a WebGPU canvas; normal use does not need it.
