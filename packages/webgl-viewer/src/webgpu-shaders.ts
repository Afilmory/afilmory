export const IMAGE_SHADER = /* wgsl */ `
struct DrawParams {
  rect: vec4f,
  viewport: vec4f,
  baseUV: vec4f,
  gainUV: vec4f,
}
struct ImageParams {
  gainMin: vec4f,
  gainMax: vec4f,
  gamma: vec4f,
  offsetBase: vec4f,
  offsetAlternate: vec4f,
  toGain: mat3x3f,
  toP3: mat3x3f,
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var base: texture_2d<f32>;
@group(0) @binding(2) var gain: texture_2d<f32>;
@group(0) @binding(3) var<uniform> draw: DrawParams;
@group(0) @binding(4) var<uniform> image: ImageParams;
struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertex(@builtin(vertex_index) index: u32) -> VertexOut {
  let points = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  let uv = points[index];
  let xy = draw.rect.xy + uv * draw.rect.zw;
  var output: VertexOut;
  output.position = vec4f(xy.x / draw.viewport.x * 2 - 1, 1 - xy.y / draw.viewport.y * 2, 0, 1);
  output.uv = uv;
  return output;
}
fn linearize(v: vec3f) -> vec3f {
  let c = abs(v);
  return sign(v) * select(c / 12.92, pow((c + 0.055) / 1.055, vec3f(2.4)), c > vec3f(0.04045));
}
fn encode(v: vec3f) -> vec3f {
  let c = abs(v);
  return sign(v) * select(c * 12.92, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c > vec3f(0.0031308));
}
@fragment fn fragment(input: VertexOut) -> @location(0) vec4f {
  let b = textureSample(base, smp, draw.baseUV.xy + input.uv * draw.baseUV.zw);
  let g = textureSample(gain, smp, draw.gainUV.xy + input.uv * draw.gainUV.zw).rgb;
  let border = fwidth(input.uv) * 1.5;
  if (draw.viewport.w > 0 && (any(input.uv < border) || any(input.uv > vec2f(1) - border))) {
    return vec4f(0, 1, 1, 1);
  }
  if (draw.viewport.z == 0) { return vec4f(b.rgb * b.a, b.a); }
  let recovered = pow(clamp(g, vec3f(0), vec3f(1)), image.gamma.rgb);
  let boost = mix(image.gainMin.rgb, image.gainMax.rgb, recovered);
  let linearBase = image.toGain * linearize(b.rgb);
  let hdr = (linearBase + image.offsetBase.rgb) * exp2(boost) - image.offsetAlternate.rgb;
  let p3 = clamp(image.toP3 * hdr, vec3f(-65504), vec3f(65504));
  return vec4f(encode(p3) * b.a, b.a);
}
`
