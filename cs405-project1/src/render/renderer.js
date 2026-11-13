// WebGPU renderer: device setup, buffers, pipelines and one render pass per frame.
// It knows nothing about the scene; main.js hands it a list of views, each with
// its own viewport, view-projection matrix, mesh draws, lines and flat triangles.

import { meshWGSL, paintingWGSL, flatWGSL } from './shaders.js';
import * as meshes from '../scene/meshes.js';
import { multiply } from '../math/mat4.js';

const SLOT = 256;          // dynamic uniform offsets must be multiples of 256 bytes
const MAX_SLOTS = 2048;
const SAMPLES = 4;         // MSAA

export class Renderer {
  static async create(canvas, paintingUrl) {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter found.');
    const device = await adapter.requestDevice();
    const r = new Renderer(canvas, device, adapter);
    await r.init(paintingUrl);
    return r;
  }

  constructor(canvas, device, adapter) {
    this.canvas = canvas;
    this.device = device;
    this.adapter = adapter;            // keep a reference so the GPU instance stays alive
    this.adapterInfo = adapter.info || {};
    // `?offscreen` in the URL renders into an ordinary texture instead of the canvas.
    // Only used for automated screenshots in headless browsers that cannot show a WebGPU canvas.
    this.offscreen = new URLSearchParams(location.search).has('offscreen');
    this.format = this.offscreen ? 'rgba8unorm' : navigator.gpu.getPreferredCanvasFormat();
    if (!this.offscreen) {
      this.context = canvas.getContext('webgpu');
      this.context.configure({ device, format: this.format, alphaMode: 'opaque' });
    }
    this.captureResolve = null;
    this.size = [0, 0];
  }

  async init(paintingUrl) {
    const d = this.device;

    // ---- uniform buffer with one 256-byte slot per draw
    this.uniformData = new Float32Array(MAX_SLOTS * SLOT / 4);
    this.uniformBuffer = d.createBuffer({ size: MAX_SLOTS * SLOT, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const uLayout = d.createBindGroupLayout({ entries: [{
      binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 160 },
    }] });
    this.uBind = d.createBindGroup({ layout: uLayout, entries: [{ binding: 0, resource: { buffer: this.uniformBuffer, size: 160 } }] });

    // ---- painting texture (sRGB) + sampler
    const blob = await (await fetch(paintingUrl)).blob();
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
    const tex = d.createTexture({
      size: [bmp.width, bmp.height], format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    d.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [bmp.width, bmp.height]);
    const tLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    ] });
    this.tBind = d.createBindGroup({ layout: tLayout, entries: [
      { binding: 0, resource: d.createSampler({ magFilter: 'linear', minFilter: 'linear' }) },
      { binding: 1, resource: tex.createView() },
    ] });

    // ---- static meshes
    this.meshes = {};
    const upload = (key, data, stride) => {
      const buf = d.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(buf, 0, data);
      this.meshes[key] = { buf, count: data.length / (stride / 4) };
    };
    upload('cube', meshes.cube(), 24);
    upload('sphere', meshes.sphere(), 24);
    upload('pointer', meshes.pointer(), 24);
    upload('painting', meshes.paintingQuad(), 20);

    // ---- pipelines
    const layout = (...bgl) => d.createPipelineLayout({ bindGroupLayouts: bgl });
    const make = (code, attrs, stride, topology, pl) => {
      const module = d.createShaderModule({ code });
      return d.createRenderPipeline({
        layout: pl,
        vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: stride, attributes: attrs }] },
        fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
        primitive: { topology, cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
        multisample: { count: SAMPLES },
      });
    };
    const pn = [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }];
    const puv = [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x2' }];
    this.pipeMesh = make(meshWGSL, pn, 24, 'triangle-list', layout(uLayout));
    this.pipePainting = make(paintingWGSL, puv, 20, 'triangle-list', layout(uLayout, tLayout));
    this.pipeTris = make(flatWGSL, pn, 24, 'triangle-list', layout(uLayout));
    this.pipeLines = make(flatWGSL, pn, 24, 'line-list', layout(uLayout));

    this.dyn = { lines: null, tris: null };
  }

  // (Re)create the MSAA colour and depth targets when the canvas size changes.
  ensureTargets() {
    const w = this.canvas.width, h = this.canvas.height;
    if (w === this.size[0] && h === this.size[1]) return;
    this.size = [w, h];
    this.msaaTex?.destroy(); this.depthTex?.destroy();
    this.msaaTex = this.device.createTexture({ size: [w, h], sampleCount: SAMPLES, format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    this.depthTex = this.device.createTexture({ size: [w, h], sampleCount: SAMPLES, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  // Texture we can copy from (screenshots / offscreen mode).
  ownTarget() {
    const [w, h] = this.size;
    if (!this.ownTex || this.ownTex.width !== w || this.ownTex.height !== h) {
      this.ownTex?.destroy();
      this.ownTex = this.device.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    }
    return this.ownTex;
  }

  // Grow-only dynamic vertex buffer.
  dynBuffer(key, floats) {
    const bytes = Math.max(1024, floats.length * 4);
    if (!this.dyn[key] || this.dyn[key].size < bytes) {
      this.dyn[key]?.destroy();
      this.dyn[key] = this.device.createBuffer({ size: bytes * 2, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (floats.length) this.device.queue.writeBuffer(this.dyn[key], 0, floats);
    return this.dyn[key];
  }

  /**
   * views: [{ viewport: [x, y, w, h], VP, draws: [{ mesh, model, color, unlit }], lines: number[], tris: number[] }]
   * lines/tris are interleaved [x, y, z, r, g, b] in world space.
   * Returns { vertices, drawCalls } submitted this frame.
   */
  render(views, clear = [0.07, 0.065, 0.06]) {
    this.ensureTargets();
    const d = this.device, U = this.uniformData;
    let slot = 0;
    const writeSlot = (mvp, model, color, unlit) => {
      const o = slot * SLOT / 4;
      U.set(mvp, o); U.set(model, o + 16);
      U[o + 32] = color[0]; U[o + 33] = color[1]; U[o + 34] = color[2]; U[o + 35] = 1;
      U[o + 36] = unlit ? 1 : 0;
      return slot++ * SLOT;
    };

    // Pack per-view lines/tris into two shared buffers.
    const lineAll = [], triAll = [];
    const plans = views.map((v) => {
      const plan = { v, draws: [], lineFirst: lineAll.length / 6, lineCount: v.lines.length / 6, triFirst: triAll.length / 6, triCount: v.tris.length / 6 };
      for (let i = 0; i < v.lines.length; i++) lineAll.push(v.lines[i]);
      for (let i = 0; i < v.tris.length; i++) triAll.push(v.tris[i]);
      for (const dr of v.draws) {
        if (slot >= MAX_SLOTS - views.length) break;
        plan.draws.push({ dr, off: writeSlot(multiply(v.VP, dr.model), dr.model, dr.color || [1, 1, 1], dr.unlit) });
      }
      plan.flatOff = writeSlot(v.VP, [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], [1, 1, 1], true);
      return plan;
    });
    d.queue.writeBuffer(this.uniformBuffer, 0, U.buffer, 0, slot * SLOT);
    const lineBuf = this.dynBuffer('lines', new Float32Array(lineAll));
    const triBuf = this.dynBuffer('tris', new Float32Array(triAll));

    const enc = d.createCommandEncoder();
    // When a screenshot is requested, resolve into an ordinary texture we can copy from.
    const capturing = !!this.captureResolve;
    const frameTex = capturing || this.offscreen ? this.ownTarget() : this.context.getCurrentTexture();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: this.msaaTex.createView(), resolveTarget: frameTex.createView(),
        clearValue: { r: clear[0], g: clear[1], b: clear[2], a: 1 }, loadOp: 'clear', storeOp: 'discard',
      }],
      depthStencilAttachment: { view: this.depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    });

    let vertices = 0, drawCalls = 0;
    for (const p of plans) {
      const [x, y, w, h] = p.v.viewport;
      pass.setViewport(x, y, w, h, 0, 1);
      pass.setScissorRect(x, y, w, h);
      for (const { dr, off } of p.draws) {
        const m = this.meshes[dr.mesh];
        if (dr.mesh === 'painting') { pass.setPipeline(this.pipePainting); pass.setBindGroup(1, this.tBind); }
        else pass.setPipeline(this.pipeMesh);
        pass.setBindGroup(0, this.uBind, [off]);
        pass.setVertexBuffer(0, m.buf);
        pass.draw(m.count);
        vertices += m.count; drawCalls++;
      }
      if (p.triCount) {
        pass.setPipeline(this.pipeTris); pass.setBindGroup(0, this.uBind, [p.flatOff]);
        pass.setVertexBuffer(0, triBuf); pass.draw(p.triCount, 1, p.triFirst);
        vertices += p.triCount; drawCalls++;
      }
      if (p.lineCount) {
        pass.setPipeline(this.pipeLines); pass.setBindGroup(0, this.uBind, [p.flatOff]);
        pass.setVertexBuffer(0, lineBuf); pass.draw(p.lineCount, 1, p.lineFirst);
        vertices += p.lineCount; drawCalls++;
      }
    }
    pass.end();
    let readback = null;
    if (this.captureResolve) readback = this.encodeCapture(enc, frameTex);
    d.queue.submit([enc.finish()]);
    if (readback) this.finishCapture(readback);
    return { vertices, drawCalls };
  }

  // ---- screenshot of the next frame as a PNG (the "Save PNG" button):
  // copy the swap-chain texture into a mappable buffer and read it back.
  capture() { return new Promise((resolve) => { this.captureResolve = resolve; }); }

  encodeCapture(enc, tex) {
    const [w, h] = this.size, bpr = Math.ceil(w * 4 / 256) * 256; // rows must be 256-byte aligned
    const buf = this.device.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    const resolve = this.captureResolve; this.captureResolve = null;
    return { buf, w, h, bpr, resolve };
  }

  async finishCapture({ buf, w, h, bpr, resolve }) {
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange()), px = new Uint8ClampedArray(w * h * 4);
    const bgra = this.format.startsWith('bgra');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = y * bpr + x * 4, o = (y * w + x) * 4;
      px[o] = src[s + (bgra ? 2 : 0)]; px[o + 1] = src[s + 1]; px[o + 2] = src[s + (bgra ? 0 : 2)]; px[o + 3] = 255;
    }
    buf.unmap(); buf.destroy();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
    c.toBlob((blob) => resolve({ blob, dataURL: c.toDataURL('image/png') }), 'image/png');
  }
}
