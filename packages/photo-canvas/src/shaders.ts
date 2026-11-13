const VERTEX_BODY = `
uniform vec2 u_camera;
uniform float u_scale;
uniform vec2 u_viewport;
out vec2 v_local;
out vec2 v_size;
out vec3 v_uv;
out float v_alpha;

void place(vec4 rect, vec4 uv, float layer, float alpha) {
  vec2 world = rect.xy + a_corner * rect.zw;
  vec2 screen = (world - u_camera) * u_scale;
  gl_Position = vec4(screen.x / (u_viewport.x * 0.5), -screen.y / (u_viewport.y * 0.5), 0.0, 1.0);
  v_size = rect.zw * u_scale;
  v_local = a_corner * v_size;
  v_uv = vec3(uv.xy + a_corner * uv.zw, layer);
  v_alpha = alpha;
}
`

const FRAGMENT_HEAD = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_local;
in vec2 v_size;
in vec3 v_uv;
in float v_alpha;
uniform float u_radius;
uniform float u_border;
uniform float u_dpr;
out vec4 outColor;

float edgeDistance() {
  float radius = min(u_radius, min(v_size.x, v_size.y) * 0.5);
  vec2 q = abs(v_local - v_size * 0.5) - v_size * 0.5 + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec4 finish(vec3 color, float fill) {
  float d = edgeDistance();
  float coverage = clamp(0.5 - d * u_dpr, 0.0, 1.0);
  float hairline = clamp((d + 1.0) * u_dpr + 0.5, 0.0, 1.0) * u_border;
  float alpha = coverage * v_alpha * max(fill, hairline);
  return vec4(mix(color, vec3(1.0), hairline) * alpha, alpha);
}
`

export const PLACEHOLDER_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_rect;
layout(location = 2) in vec4 a_uv;
layout(location = 3) in vec2 a_extra;
${VERTEX_BODY}
void main() {
  place(a_rect, a_uv, a_extra.x, a_extra.y);
}
`

export const PLACEHOLDER_FRAGMENT = `${FRAGMENT_HEAD}
uniform sampler2DArray u_atlas;
uniform vec3 u_fill;

void main() {
  vec3 color = v_uv.z < 0.0 ? u_fill : texture(u_atlas, v_uv).rgb;
  outColor = finish(color, 1.0);
}
`

export const THUMBNAIL_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_corner;
uniform vec4 u_rect;
uniform float u_alpha;
${VERTEX_BODY}
void main() {
  place(u_rect, vec4(0.0, 0.0, 1.0, 1.0), 0.0, u_alpha);
}
`

export const THUMBNAIL_FRAGMENT = `${FRAGMENT_HEAD}
uniform sampler2D u_image;
uniform float u_outlineOnly;

void main() {
  vec3 color = u_outlineOnly > 0.5 ? vec3(1.0) : texture(u_image, v_uv.xy).rgb;
  outColor = finish(color, 1.0 - u_outlineOnly);
}
`
