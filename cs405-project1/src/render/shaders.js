// WGSL shaders. All lighting/colour maths happens in LINEAR space; the canvas is a
// plain (non-sRGB) format, so every fragment shader encodes to sRGB at the end.
// The painting texture is uploaded as rgba8unorm-srgb, so sampling it returns
// linear values and the round trip is exact.

const common = /* wgsl */ `
struct Uniforms {
  mvp    : mat4x4f,   // P · V · M  (column-major, uploaded as is)
  model  : mat4x4f,   // M, for normals
  color  : vec4f,     // linear RGB
  params : vec4f,     // x = 1 → unlit
};
@group(0) @binding(0) var<uniform> u : Uniforms;

fn toSRGB(c : vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}
`;

export const meshWGSL = common + /* wgsl */ `
struct VOut { @builtin(position) pos : vec4f, @location(0) n : vec3f };

@vertex fn vs(@location(0) p : vec3f, @location(1) n : vec3f) -> VOut {
  var o : VOut;
  o.pos = u.mvp * vec4f(p, 1.0);
  o.n = (u.model * vec4f(n, 0.0)).xyz;
  return o;
}

@fragment fn fs(i : VOut) -> @location(0) vec4f {
  let N = normalize(i.n);
  let key  = max(dot(N, normalize(vec3f(-0.35, 0.8, 0.55))), 0.0);
  let fill = max(dot(N, normalize(vec3f(0.6, 0.2, 0.4))), 0.0);
  var light = 0.18 + 0.85 * key + 0.25 * fill;
  if (u.params.x > 0.5) { light = 1.0; }
  return vec4f(toSRGB(u.color.rgb * light), 1.0);
}
`;

export const paintingWGSL = common + /* wgsl */ `
@group(1) @binding(0) var samp : sampler;
@group(1) @binding(1) var tex : texture_2d<f32>;

struct VOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f };

@vertex fn vs(@location(0) p : vec3f, @location(1) uv : vec2f) -> VOut {
  var o : VOut;
  o.pos = u.mvp * vec4f(p, 1.0);
  o.uv = uv;
  return o;
}

@fragment fn fs(i : VOut) -> @location(0) vec4f {
  let c = textureSample(tex, samp, i.uv).rgb;   // already linear (sRGB texture)
  return vec4f(toSRGB(c * u.color.rgb), 1.0);
}
`;

// Lines and flat triangles: per-vertex colour, mvp = P · V (vertices are in world space).
export const flatWGSL = common + /* wgsl */ `
struct VOut { @builtin(position) pos : vec4f, @location(0) c : vec3f };

@vertex fn vs(@location(0) p : vec3f, @location(1) c : vec3f) -> VOut {
  var o : VOut;
  o.pos = u.mvp * vec4f(p, 1.0);
  o.c = c;
  return o;
}

@fragment fn fs(i : VOut) -> @location(0) vec4f {
  return vec4f(toSRGB(i.c), 1.0);
}
`;
