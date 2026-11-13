import type { DrawInstance, FrameState } from './core'
import { PlaceholderAtlas } from './placeholder-atlas'
import { PLACEHOLDER_FRAGMENT, PLACEHOLDER_VERTEX, THUMBNAIL_FRAGMENT, THUMBNAIL_VERTEX } from './shaders'
import type { CanvasPhoto } from './types'

const FLOATS_PER_INSTANCE = 10
const BASE_RADIUS = 6
const BORDER_ALPHA = 0.1
const HOVER_BORDER_ALPHA = 0.55
const THUMBNAIL_FADE_MS = 200
const DECODE_BUDGET_MS = 4
const FILL_COLOR = [0.165, 0.165, 0.173] as const

interface Thumbnail {
  texture: WebGLTexture
  loadedAt: number
}

interface Program {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed')
  }
  return shader
}

const link = (gl: WebGL2RenderingContext, vertex: string, fragment: string, uniformNames: string[]): Program => {
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed')
  }
  const uniforms: Program['uniforms'] = {}
  for (const name of uniformNames) {
    uniforms[name] = gl.getUniformLocation(program, name)
  }
  return { program, uniforms }
}

const SHARED_UNIFORMS = ['u_camera', 'u_scale', 'u_viewport', 'u_radius', 'u_border', 'u_dpr']

export class Renderer {
  private readonly placeholderProgram: Program
  private readonly thumbnailProgram: Program
  private readonly quad: WebGLBuffer
  private readonly instanceBuffer: WebGLBuffer
  private readonly placeholderVao: WebGLVertexArrayObject
  private readonly thumbnailVao: WebGLVertexArrayObject
  private readonly atlas: PlaceholderAtlas
  private readonly thumbnails = new Map<string, Thumbnail>()
  private instanceData = new Float32Array(0)
  private instanceCount = 0
  private uploadedFrameVersion = -1
  private uploadedAtlasVersion = -1

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.placeholderProgram = link(gl, PLACEHOLDER_VERTEX, PLACEHOLDER_FRAGMENT, [
      ...SHARED_UNIFORMS,
      'u_atlas',
      'u_fill',
    ])
    this.thumbnailProgram = link(gl, THUMBNAIL_VERTEX, THUMBNAIL_FRAGMENT, [
      ...SHARED_UNIFORMS,
      'u_rect',
      'u_alpha',
      'u_image',
      'u_outlineOnly',
    ])
    this.atlas = new PlaceholderAtlas(gl)

    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)

    this.thumbnailVao = gl.createVertexArray()!
    gl.bindVertexArray(this.thumbnailVao)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.placeholderVao = gl.createVertexArray()!
    gl.bindVertexArray(this.placeholderVao)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.instanceBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    const stride = FLOATS_PER_INSTANCE * 4
    const layout: [number, number, number][] = [
      [1, 4, 0],
      [2, 4, 16],
      [3, 2, 32],
    ]
    for (const [location, size, offset] of layout) {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
      gl.vertexAttribDivisor(location, 1)
    }
    gl.bindVertexArray(null)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)
  }

  setPhotos(photos: CanvasPhoto[]) {
    this.atlas.sync(photos)
  }

  setThumbnail(id: string, bitmap: ImageBitmap, now: number) {
    const { gl } = this
    const previous = this.thumbnails.get(id)
    if (previous) {
      gl.deleteTexture(previous.texture)
    }
    const texture = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    bitmap.close()
    this.thumbnails.set(id, { texture, loadedAt: previous ? now - THUMBNAIL_FADE_MS : now })
  }

  deleteThumbnail(id: string) {
    const thumbnail = this.thumbnails.get(id)
    if (thumbnail) {
      this.gl.deleteTexture(thumbnail.texture)
      this.thumbnails.delete(id)
    }
  }

  render(frame: FrameState, hoveredKey: string | null, now: number): boolean {
    const { gl } = this
    const { viewport, dpr, camera } = frame
    const pendingDecode = this.atlas.decode(DECODE_BUDGET_MS)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    this.uploadInstances(frame)
    const radius = BASE_RADIUS * Math.min(1, camera.scale * 1.4)
    const shared = (program: Program, border: number) => {
      gl.useProgram(program.program)
      gl.uniform2f(program.uniforms.u_camera, camera.x, camera.y)
      gl.uniform1f(program.uniforms.u_scale, camera.scale)
      gl.uniform2f(program.uniforms.u_viewport, viewport.width, viewport.height)
      gl.uniform1f(program.uniforms.u_radius, radius)
      gl.uniform1f(program.uniforms.u_border, border)
      gl.uniform1f(program.uniforms.u_dpr, dpr)
    }

    if (this.instanceCount > 0) {
      shared(this.placeholderProgram, BORDER_ALPHA)
      this.atlas.bind(0)
      gl.uniform1i(this.placeholderProgram.uniforms.u_atlas, 0)
      gl.uniform3f(this.placeholderProgram.uniforms.u_fill, ...FILL_COLOR)
      gl.bindVertexArray(this.placeholderVao)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount)
    }

    shared(this.thumbnailProgram, BORDER_ALPHA)
    const uniforms = this.thumbnailProgram.uniforms
    gl.bindVertexArray(this.thumbnailVao)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(uniforms.u_image, 0)
    gl.uniform1f(uniforms.u_outlineOnly, 0)
    const halfWidth = viewport.width / 2 / camera.scale
    const halfHeight = viewport.height / 2 / camera.scale
    let fading = false
    let hovered: DrawInstance | null = null
    for (const instance of frame.instances) {
      if (instance.key === hoveredKey) {
        hovered = instance
      }
      if (
        instance.x > camera.x + halfWidth
        || instance.x + instance.w < camera.x - halfWidth
        || instance.y > camera.y + halfHeight
        || instance.y + instance.h < camera.y - halfHeight
      ) {
        continue
      }
      const thumbnail = this.thumbnails.get(instance.id)
      if (!thumbnail) {
        continue
      }
      const reveal = Math.min(1, (now - thumbnail.loadedAt) / THUMBNAIL_FADE_MS)
      fading ||= reveal < 1
      gl.bindTexture(gl.TEXTURE_2D, thumbnail.texture)
      gl.uniform4f(uniforms.u_rect, instance.x, instance.y, instance.w, instance.h)
      gl.uniform1f(uniforms.u_alpha, instance.alpha * reveal)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    if (hovered) {
      gl.uniform1f(uniforms.u_border, HOVER_BORDER_ALPHA)
      gl.uniform1f(uniforms.u_outlineOnly, 1)
      gl.uniform4f(uniforms.u_rect, hovered.x, hovered.y, hovered.w, hovered.h)
      gl.uniform1f(uniforms.u_alpha, hovered.alpha)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    gl.bindVertexArray(null)
    return pendingDecode || fading
  }

  dispose() {
    const { gl } = this
    for (const thumbnail of this.thumbnails.values()) {
      gl.deleteTexture(thumbnail.texture)
    }
    this.thumbnails.clear()
    this.atlas.dispose()
    gl.deleteBuffer(this.quad)
    gl.deleteBuffer(this.instanceBuffer)
    gl.deleteVertexArray(this.placeholderVao)
    gl.deleteVertexArray(this.thumbnailVao)
    gl.deleteProgram(this.placeholderProgram.program)
    gl.deleteProgram(this.thumbnailProgram.program)
  }

  private uploadInstances(frame: FrameState) {
    if (frame.version === this.uploadedFrameVersion && this.atlas.version === this.uploadedAtlasVersion) {
      return
    }
    const { gl } = this
    const { instances } = frame
    const needed = instances.length * FLOATS_PER_INSTANCE
    if (this.instanceData.length < needed) {
      this.instanceData = new Float32Array(Math.ceil(needed * 1.25))
    }
    const data = this.instanceData
    for (const [i, instance] of instances.entries()) {
      const uv = this.atlas.uvOf(instance.id)
      const offset = i * FLOATS_PER_INSTANCE
      data[offset] = instance.x
      data[offset + 1] = instance.y
      data[offset + 2] = instance.w
      data[offset + 3] = instance.h
      data[offset + 4] = uv?.u ?? 0
      data[offset + 5] = uv?.v ?? 0
      data[offset + 6] = uv?.w ?? 0
      data[offset + 7] = uv?.h ?? 0
      data[offset + 8] = uv ? uv.layer : -1
      data[offset + 9] = instance.alpha
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, needed), gl.DYNAMIC_DRAW)
    this.instanceCount = instances.length
    this.uploadedFrameVersion = frame.version
    this.uploadedAtlasVersion = this.atlas.version
  }
}
