// Scene-graph node (Part B).
// Each node stores only its LOCAL transform (relative to its parent).
// Its WORLD matrix is computed by a depth-first traversal:
//     world(node) = world(parent) · local(node),   world(root) = local(root)
// so for a leaf at depth d:  world = L_root · L_1 · … · L_d.
//
// `meshMatrix` is applied only when drawing this node's own mesh (e.g. to stretch
// a unit cube into a table top). It is NOT passed down to children, so children
// are not squashed by their parent's shape.

import { identity, multiply } from '../math/mat4.js';

export class SceneNode {
  constructor(name, { local = identity(), mesh = null, meshMatrix = identity(), color = [1, 1, 1], string = false } = {}) {
    this.name = name;
    this.local = local;
    this.parent = null;
    this.children = [];
    this.world = identity();
    this.mesh = mesh;           // key into the renderer's mesh table, or null for a pure group
    this.meshMatrix = meshMatrix;
    this.color = color;         // linear RGB
    this.string = string;       // draw a "string" line to the parent (used by the hanging mobile)
    this.visible = true;
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  // Recompute world matrices for this subtree.
  updateWorld(parentWorld = null) {
    this.world = parentWorld ? multiply(parentWorld, this.local) : this.local.slice();
    for (const c of this.children) c.updateWorld(this.world);
  }

  traverse(fn, depth = 0) {
    fn(this, depth);
    for (const c of this.children) c.traverse(fn, depth + 1);
  }

  find(name) {
    let hit = null;
    this.traverse((n) => { if (!hit && n.name === name) hit = n; });
    return hit;
  }

  // Path from the root down to this node (root first).
  path() {
    const p = [];
    for (let n = this; n; n = n.parent) p.unshift(n);
    return p;
  }
}
