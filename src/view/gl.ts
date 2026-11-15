// The few WebGL2 chores the view needs, with the error checking in one place.

export function program(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const made = gl.createProgram()!;
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(made, shader);
  }
  gl.linkProgram(made);
  if (!gl.getProgramParameter(made, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(made)}`);
  return made;
}

/** The places of a program's uniforms, looked up once, by name. */
export function uniforms<K extends string>(gl: WebGL2RenderingContext, of: WebGLProgram, names: readonly K[]): Record<K, WebGLUniformLocation | null> {
  const out = {} as Record<K, WebGLUniformLocation | null>;
  for (const name of names) out[name] = gl.getUniformLocation(of, name);
  return out;
}

/** A picture that can be drawn into and then read as a texture. */
export interface Canvas {
  frame: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export function makeCanvas(gl: WebGL2RenderingContext): Canvas {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const frame = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { frame, texture, width: 0, height: 0 };
}

/** Give a canvas its size. `deep` keeps light brighter than white (16-bit floats) where the card can. */
export function sizeCanvas(gl: WebGL2RenderingContext, c: Canvas, width: number, height: number, deep: boolean): void {
  if (c.width === width && c.height === height) return;
  c.width = width;
  c.height = height;
  gl.bindTexture(gl.TEXTURE_2D, c.texture);
  if (deep) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
}
