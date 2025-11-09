/**
 * WebGL着色器定义
 *
 * 包含顶点着色器和片段着色器的源码
 */

/**
 * 顶点着色器源码
 * 负责处理顶点变换和纹理坐标传递
 */
export const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  
  uniform mat3 u_matrix;
  
  varying vec2 v_texCoord;
  
  void main() {
    vec3 position = u_matrix * vec3(a_position, 1.0);
    gl_Position = vec4(position.xy, 0, 1);
    v_texCoord = a_texCoord;
  }
`

/**
 * 片段着色器源码
 * 负责像素的最终着色
 */
export const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  
  uniform sampler2D u_image;
  uniform int u_renderMode;
  uniform vec4 u_solidColor;
  varying vec2 v_texCoord;
  
  void main() {
    if (u_renderMode == 0) {
      gl_FragColor = texture2D(u_image, v_texCoord);
    } else {
      gl_FragColor = u_solidColor;
    }
  }
`

/**
 * 创建WebGL着色器
 * @param gl WebGL渲染上下文
 * @param type 着色器类型
 * @param source 着色器源码
 * @returns 编译好的着色器
 */
export function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compilation failed: ${error}`)
  }

  return shader
}
