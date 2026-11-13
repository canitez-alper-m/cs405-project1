// Cameras (Part C): an orbiting main camera and a fixed inspection camera.

import { lookAt, lookAtBasis, perspective, orthographic, invertRigid, transformPoint, transformDir } from '../math/mat4.js';
import { add } from '../math/vec3.js';

const DEG = Math.PI / 180;

export class OrbitCamera {
  constructor() { this.reset(); }

  reset() {
    this.target = [0, 2.9, 1.0];
    this.yaw = 0.32;          // around world y, 0 = in front of the painting (+z)
    this.pitch = 0.14;        // elevation; ±90° is allowed on purpose (degenerate lookAt case)
    this.dist = 13;
    this.fovDeg = 50;
    this.near = 0.5;
    this.far = 25;
    this.ortho = false;
    this.up = [0, 1, 0];
  }

  eye() {
    const c = Math.cos(this.pitch);
    return add(this.target, [this.dist * c * Math.sin(this.yaw), this.dist * Math.sin(this.pitch), this.dist * c * Math.cos(this.yaw)]);
  }

  basis() { return lookAtBasis(this.eye(), this.target, this.up); }
  view() { return lookAt(this.eye(), this.target, this.up); }

  // Half extents of the orthographic box: chosen so the target plane looks the
  // same size as in perspective, which makes switching between the two smooth.
  orthoHalfHeight() { return this.dist * Math.tan(this.fovDeg * DEG / 2); }

  proj(aspect) {
    if (!this.ortho) return perspective(this.fovDeg * DEG, aspect, this.near, this.far);
    const h = this.orthoHalfHeight();
    return orthographic(-h * aspect, h * aspect, -h, h, this.near, this.far);
  }

  // The 8 frustum corners in world space: build them in camera space, then map
  // with the camera-to-world matrix, which is the rigid inverse of V.
  frustumCorners(aspect) {
    const camToWorld = invertRigid(this.view());
    const rect = (d) => {
      const h = this.ortho ? this.orthoHalfHeight() : d * Math.tan(this.fovDeg * DEG / 2), w = h * aspect;
      return [[-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d]].map((p) => transformPoint(camToWorld, p));
    };
    return { near: rect(this.near), far: rect(this.far), eye: this.eye(), camToWorld };
  }

  // World-space ray through a point given in NDC (x, y ∈ [−1, 1]).
  ray(ndcX, ndcY, aspect) {
    const camToWorld = invertRigid(this.view());
    if (this.ortho) {
      const h = this.orthoHalfHeight();
      return { o: transformPoint(camToWorld, [ndcX * h * aspect, ndcY * h, 0]), d: transformDir(camToWorld, [0, 0, -1]) };
    }
    const k = Math.tan(this.fovDeg * DEG / 2);
    return { o: this.eye(), d: transformDir(camToWorld, [ndcX * k * aspect, ndcY * k, -1]) };
  }
}

// Fixed camera looking at the whole set from above and to the side.
export class InspectionCamera {
  constructor() {
    this.eyePos = [-38, 24, 30];
    this.target = [0, 2, 1];
    this.fovDeg = 45;
    this.near = 1;
    this.far = 150;
  }
  eye() { return this.eyePos; }
  view() { return lookAt(this.eyePos, this.target, [0, 1, 0]); }
  proj(aspect) { return perspective(this.fovDeg * DEG, aspect, this.near, this.far); }
}
