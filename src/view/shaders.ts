// The programs that run on the graphics card. The particles never change after they are made:
// everything that moves is worked out here, per particle, from a handful of numbers and one small
// texture (`u_body`, filled by moving.ts) that holds the airway, the nose and the soft palate as
// they are this frame.
import { BODY_ROWS } from "./moving.ts";
import { MOUTH_HALF, SEPTUM } from "./body.ts";
import { EYE } from "./head.ts";
import { CAST_MAX } from "./cast.ts";
import { KIND } from "./dust.ts";
import { N } from "./tract.ts";

const f = (v: number) => v.toFixed(4);

export const DUST_VERTEX = `#version 300 es
precision highp float;
precision highp sampler2D;

layout(location = 0) in vec4 a_place;  // a, b, c, seed
layout(location = 1) in vec4 a_face;   // nx, ny, nz, size
layout(location = 2) in vec4 a_kind;   // kind, w1, w2, tag (0..255)

uniform sampler2D u_body;
uniform mat4 u_view;
uniform mat4 u_lens;
uniform vec3 u_eye;
uniform float u_pixels;      // pixels per cm at one cm from the eye
uniform float u_far;         // the eye's distance from what it looks at
uniform float u_time;        // seconds of idle drift (stands still for reduced motion)
uniform float u_flicker;     // a clock for sparks, which the voice drives
uniform vec3 u_tint;
uniform float u_shown;       // this layer: 0 hidden .. 1 shown
uniform float u_edge;        // how much this layer is a see-through shell (0 solid glow .. 1 edges only)
uniform vec3 u_apart;        // where the explode has carried this layer
uniform float u_cut;
uniform float u_gain;
uniform vec4 u_jaw;          // cos and sin of its turn, then the pivot
uniform vec4 u_lip;          // lower lip's drop, mouth width scale, reach forward
uniform float u_lift;        // larynx, cm up
uniform vec4 u_fold;         // strobe phase, how strongly voiced, how far apart, -
uniform vec4 u_air;          // flow travelled, held pressure, where it is held, nose flow travelled
uniform vec4 u_lung;         // size, pressure, flow travelled, -
uniform vec4 u_sound;        // ripple travelled, ripples per cm, how voiced, how hissy
uniform vec4 u_mouth;        // x, y, half-width of the opening, its share of the sound
uniform float u_nose;        // how open the nose is, 0..1
// Which singer of the cast this is: its first row of the body texture, where it stands (x, y, z,
// size), how it is turned (cos, sin), how lit it is, and how much it is a bust (its chest fades).
uniform float u_row;
uniform vec4 u_place;
uniform vec2 u_turn;
uniform vec2 u_bend;        // the head's nod (chin up +) and tilt toward a shoulder, radians
uniform float u_lit;
uniform float u_bust;
uniform float u_colour;      // 0 cold starlight .. 1 every part its own hue, shimmering
uniform float u_grain;       // the size of a mote: larger when the cloud is thin, finer when dense
uniform vec4 u_eyes;         // how closed the lids are (0 open .. 1 shut), where the eyes look (turn, raise), -

out vec4 v_light;

const vec3 DUST = vec3(0.788, 0.839, 1.0);
const vec3 WARM = vec3(1.0, 0.835, 0.541);

vec4 body(float s, float row) {
  return texture(u_body, vec2((clamp(s, 0.0, 1.0) * ${f(N - 1)} + 0.5) / ${f(N)}, (row + u_row + 0.5) / ${f(BODY_ROWS * CAST_MAX)}));
}
float hash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
// Half the height of the opening between the lids, u cm out from the middle of the eye (head.ts).
float eyeOpening(float u) {
  float t = 1.0 - (u / ${f(EYE.wide)}) * (u / ${f(EYE.wide)});
  return t > 0.0 ? ${f(EYE.high)} * pow(t, 0.65) : 0.0;
}
// From the singer's own coordinates to the stage's: turned about its upright (and then sized).
vec3 turned(vec3 v) { return vec3(v.x * u_turn.x - v.z * u_turn.y, v.y, v.x * u_turn.y + v.z * u_turn.x); }
// The head bends at the neck, a little: fully above the jaw, not at all at the collar, so the
// chest stays where it stands. A nod turns it in its own profile plane, a tilt about the line
// from the back of the head to the face.
const vec3 NECK = vec3(-2.0, -14.0, 0.0);
vec3 bent(vec3 v, float w, bool point) {
  vec3 q = point ? v - NECK : v;
  float a = u_bend.x * w;
  float c = cos(a), s = sin(a);
  q = vec3(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
  float b = u_bend.y * w;
  c = cos(b); s = sin(b);
  q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
  return point ? q + NECK : q;
}

// Sound is heat: cold dust, then warm, then white, and brighter all the way.
vec3 heat(vec3 cold, float h) {
  vec3 c = mix(cold, WARM, smoothstep(0.0, 0.5, h));
  return mix(c, vec3(1.0), 0.75 * smoothstep(0.7, 1.0, h));
}

// The floor of the airway at s, at a sideways position z: the tongue's surface.
vec3 floorAt(float s, float z) {
  vec4 roof = body(s, 0.0);
  vec4 lens = body(s, 1.0);
  float open = lens.x * max(0.0, 1.0 - z * z / (lens.y * lens.y + 1e-4));
  return vec3(roof.xy + roof.zw * (lens.z * z * z + open), z);
}
void main() {
  int kind = int(a_kind.x + 0.5);
  float w1 = a_kind.y / 255.0;
  float w2 = a_kind.z / 255.0;
  float tag = a_kind.w;
  float seed = a_place.w;
  vec3 p = a_place.xyz;
  vec3 face = a_face.xyz;
  float edge = u_edge;
  float glow = 1.0;       // brightness
  float warm = 0.0;       // 0 cold .. 1 white hot
  float size = abs(a_face.w);
  // Which way a tube-shaped part runs here (the air, the tongue, the nose), and how much it is
  // dimmed when seen end-on: looking down a tube stacks all its dust on one spot, which would
  // otherwise burn the middle of the face white in the front view.
  vec3 runs = vec3(0.0);
  float endOn = 0.0;
  float iris = 0.0;       // 1 where this is the iris of an eye, which has its own colour

  if (kind == ${KIND.rigid}) {
    // A sharp bend in the surface shows from any side, and brighter.
    float crease = floor(mod(tag, 64.0) / 4.0) / 15.0;
    edge *= 1.0 - 0.75 * crease;
    glow *= 1.0 + 2.1 * crease;
    float closed = u_eyes.x;
    if (tag > 127.5) {
      // An eyeball: it turns about its middle to look about, and is seen whole only through the
      // opening between the lids; behind them it is a faint shape in the glass.
      vec3 c = vec3(${f(EYE.x)}, ${f(EYE.y)}, sign(p.z) * ${f(EYE.z)});
      vec3 q = p - c;
      float ct = cos(u_eyes.y), st = sin(u_eyes.y);
      q = vec3(q.x * ct - q.z * st, q.y, q.x * st + q.z * ct);
      float cr = cos(u_eyes.z), sr = sin(u_eyes.z);
      q = vec3(q.x * cr - q.y * sr, q.x * sr + q.y * cr, q.z);
      face = vec3(face.x * ct - face.z * st, face.y, face.x * st + face.z * ct);
      p = c + q;
      float u = abs(p.z) - ${f(EYE.z)};
      float w = p.y - ${f(EYE.y)} - ${f(EYE.tilt)} * u;
      float h = eyeOpening(u);
      float top = h - (2.0 * h + 0.1) * closed;
      float open = step(0.25, q.x) * smoothstep(-h - 0.05, -h + 0.05, w) * (1.0 - smoothstep(top - 0.05, top + 0.05, w));
      glow *= (0.12 + 1.13 * open) * mix(1.5, 3.2, w2);
      edge = 0.15;
      iris = w2;
      if (w1 > 0.5) {
        // the cornea: clear glass, bright where it is seen edge-on
        edge = 1.0;
        glow *= 2.2;
      }
    } else if (tag > 63.5) {
      // A lid: hidden while the eye is open; in a blink the upper lid comes down over the eye,
      // its edge a line of light.
      float showAt = 1.05 - 1.1 * closed;
      glow *= smoothstep(showAt - 0.03, showAt + 0.03, w2);
      glow *= 1.0 + 5.0 * exp(-pow((w2 - showAt) / 0.07, 2.0)) * step(0.03, closed);
      // A lid is skin seen face-on: drawn as a soft surface, not clear glass, or a blink would not show.
      edge *= 0.3;
      glow *= 1.4;
    } else {
      // The jaw, then the lips on top of it.
      vec2 q = p.xy - u_jaw.zw;
      vec2 swung = u_jaw.zw + vec2(q.x * u_jaw.x + q.y * u_jaw.y, q.y * u_jaw.x - q.x * u_jaw.y);
      p.xy = mix(p.xy, swung, w1);
      float across = p.z / ${f(MOUTH_HALF)};
      float middle = max(0.0, 1.0 - across * across);
      if (mod(tag, 4.0) > 0.5) p.y += u_lip.x * w2 * middle;
      p.z *= mix(1.0, u_lip.y, w2);
      p.x += u_lip.z * w2 * (0.35 + 0.65 * middle);
    }
  } else if (kind == ${KIND.tongue}) {
    float s = p.x;
    vec4 under = body(s, 2.0);
    float z = p.y * under.w;
    float depth = p.z;
    // From its surface, where the airway's floor is, down to where it is anchored in the floor
    // of the mouth, narrowing as it goes.
    p = mix(floorAt(s, z), vec3(under.yz, z * 0.5), depth);
    // Which way its skin faces: up from the surface (worked out from its neighbours), turning
    // outward down the sides.
    vec3 ds = floorAt(s + 0.012, z) - floorAt(s - 0.012, z);
    vec3 dz = floorAt(s, z + 0.08) - floorAt(s, z - 0.08);
    vec3 up = normalize(cross(dz, ds) + vec3(0.0, 1e-4, 0.0));
    face = mix(up, vec3(0.0, 0.0, sign(a_place.y)), smoothstep(0.1, 0.6, depth));
    if (a_face.x < 0.5) {
      edge = 0.0;
      glow *= 0.45;
    }
    // Where the tongue makes the hiss, it catches a little of the heat.
    warm = under.x * 0.5;
    runs = normalize(ds + vec3(0.0, 0.0, 1e-5));
    endOn = 0.5;
  } else if (kind == ${KIND.wall} || kind == ${KIND.flow}) {
    float s = p.x;
    if (kind == ${KIND.flow}) {
      s = fract(s + u_air.x * (0.6 + 0.8 * a_face.x));
      // Behind a closure the air is packed toward it.
      float behind = u_air.z - s;
      if (behind > 0.0) s += behind * 0.35 * u_air.y * exp(-behind / 0.25);
    }
    vec4 roof = body(s, 0.0);
    vec4 lens = body(s, 1.0);
    vec4 more = body(s, 2.0);
    runs = vec3(roof.w, -roof.z, 0.0);
    endOn = 0.75;
    float u = p.y;
    float z = u * lens.y;
    float open = lens.x * (1.0 - u * u);
    float down = kind == ${KIND.wall} ? p.z : 0.04 + 0.92 * p.z;
    p = vec3(roof.xy + roof.zw * (lens.z * z * z + down * open), z);
    face = vec3(roof.zw * (kind == ${KIND.wall} ? p.z * 2.0 - 1.0 : 0.0), u);
    // A little contrast, so the loud and quiet stretches of the column stand apart.
    float h = lens.w * lens.w * lens.w;
    float behind = u_air.z - s;
    if (behind > 0.0) h += u_air.y * exp(-behind / 0.1);
    // Turbulence: the dust is thrown about and sparks.
    float hiss = more.x;
    float tick = floor(u_flicker * 24.0);
    vec3 jolt = vec3(hash(seed * 31.0 + tick), hash(seed * 57.0 + tick), hash(seed * 83.0 + tick)) - 0.5;
    p += jolt * hiss * (kind == ${KIND.flow} ? 0.75 : 0.25);
    float spark = step(0.86, hash(seed * 17.0 + tick)) * hiss;
    h = max(h, hiss * 0.5) + spark * 0.8;
    warm = h;
    if (kind == ${KIND.flow}) {
      // The same dust in a narrower tube would shine brighter for no reason: even it out.
      float room = clamp(lens.x * lens.y / 1.8, 0.1, 1.4);
      glow = (0.14 + 0.55 * h + spark * 2.0) * room * smoothstep(0.0, 0.08, lens.x);
      glow *= smoothstep(0.0, 0.03, s) * smoothstep(1.0, 0.97, s);
      size *= 1.0 + 0.4 * h;
      edge = 0.0;
    } else {
      glow = (0.4 + 0.5 * h) * clamp(lens.y / 1.6, 0.15, 1.2);
    }
  } else if (kind == ${KIND.noseAir}) {
    float t = fract(p.x + u_air.w * (0.6 + 0.8 * a_face.y));
    vec4 line = body(t, 3.0);
    vec4 heatRow = body(t, 4.0);
    vec2 up = body(t, 6.0).xy;
    runs = vec3(up.y, -up.x, 0.0);
    endOn = 0.6;
    float z = a_face.x * (${f(SEPTUM)} + p.z * line.w);
    p = vec3(line.xy + up * p.y * line.z * 0.5, z);
    warm = heatRow.x * u_nose;
    glow = (0.1 + 0.3 * u_nose + 1.2 * warm * warm) * smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.96, t);
    edge = 0.0;
  } else if (kind == ${KIND.velum}) {
    float t = p.x;
    vec4 under = body(t, 4.0);
    vec4 flap = body(t, 5.0);
    float z = p.y * flap.w;
    // Its sides hang a little lower, as the arch of the palate does.
    p = vec3(under.zw + flap.xy * (p.z * flap.z - 0.16 * z * z), z);
    face = normalize(vec3(a_place.z > 0.5 ? flap.xy : -flap.xy, a_place.y * 0.8));
  } else if (kind == ${KIND.larynx}) {
    p.y += u_lift * w1;
  } else if (kind == ${KIND.fold}) {
    // Seen as a stroboscope shows them: the true cycle, slowed until the eye can follow.
    float along = p.x;
    float up = p.y;
    float depth = p.z;
    float side = a_face.x;
    float apart = u_fold.z * 0.62 * along;
    // The lower lip of each fold opens first and the opening rolls upward: the mucosal wave.
    float cycle = fract(u_fold.x + 0.14 * (1.0 - up));
    float wave = cycle < 0.62 ? sin(3.14159 * cycle / 0.62) : 0.0;
    float swing = u_fold.y * 0.16 * pow(sin(3.14159 * clamp(along * 0.92 + 0.04, 0.0, 1.0)), 0.7) * (wave - 0.25);
    float gap = max(0.0, apart + swing * (1.0 - 0.6 * depth));
    float reach = 0.55 + 0.75 * along;
    p = vec3(2.4 - 1.4 * along, -8.2 + u_lift + (up - 0.6) * 0.5 * (1.0 + 1.5 * depth), side * (gap + depth * reach));
    face = normalize(vec3(0.0, up - 0.5, -side * (1.0 - depth)));
    warm = u_fold.y * (1.0 - depth) * (0.35 + 0.5 * wave);
    glow = 1.0 + 1.5 * warm;
  } else if (kind == ${KIND.lung}) {
    vec3 root = vec3(-0.3, -23.5, sign(p.z) * 3.6);
    float breath = tag > 0.5 ? mix(1.0, u_lung.x, w1) : u_lung.x;
    p = root + (p - root) * vec3(breath, mix(1.0, breath, 0.8), breath);
    if (tag > 0.5) {
      // Light climbs the airways toward the windpipe as the breath is spent.
      float pulse = 0.5 + 0.5 * sin(6.2832 * (w1 * 5.0 + u_lung.z));
      warm = u_lung.y * (0.25 + 0.6 * pulse * pulse);
      glow = 0.7 + 1.8 * warm;
      edge = 0.0;
    } else {
      warm = u_lung.y * 0.15;
    }
  } else {
    // Sound leaving: shells of dust that widen from the mouth, one for each ring. A higher note
    // packs the rings closer; a hiss has no rings and is a shapeless sparkle.
    float from = a_face.y;
    float shell = floor(a_face.x * 18.0);
    float loose = mix(0.5, 0.07, u_sound.z) * (hash(seed * 5.0) * 2.0 - 1.0);
    float r = max(0.0, shell + fract(u_sound.x) + loose) / u_sound.y * (from == 0.0 ? 1.0 : 0.6);
    float way = r / 30.0;
    vec3 origin = from == 0.0 ? vec3(u_mouth.x, u_mouth.y, p.z * u_mouth.z * 0.6) : vec3(9.9, 2.35, from * 0.55);
    p = origin + normalize(p * vec3(1.0, 1.0, 0.55)) * (0.3 + r);
    float level = body(way, 4.0).y * (from == 0.0 ? u_mouth.w : 1.0 - u_mouth.w);
    float grain = hash(seed * 13.0 + floor(u_flicker * 20.0));
    float lit = mix(1.0, 0.4 + 2.0 * step(0.75, grain), u_sound.w);
    glow = level * lit * 2.2 / (1.0 + r * 0.22) * smoothstep(1.0, 0.6, way) * smoothstep(0.0, 0.5, r);
    warm = 0.3 + 0.45 * level;
    edge = 0.0;
  }

  // The idle drift: each particle wanders a fraction of a millimetre, so the cloud is alive.
  p += 0.035 * vec3(sin(u_time * 0.7 + seed * 40.0), sin(u_time * 0.9 + seed * 71.0), sin(u_time * 0.8 + seed * 113.0));

  // The cut: a plane sweeps in from the near side to the middle and takes away what it passes.
  float plane = mix(10.5, 0.0, u_cut);
  float kept = 1.0 - smoothstep(plane, plane + 0.1, p.z);
  // What is left is a slab: the far half fades with its distance behind the slice.
  kept *= mix(1.0, exp(min(0.0, p.z) / 2.2), u_cut);
  // The face of the cut glows, and the particles made for it appear.
  float onFace = exp(-max(0.0, plane - p.z) / 0.22) * step(0.001, u_cut) * (1.0 - step(0.5, float(kind == ${KIND.flow})));
  if (a_face.w < 0.0) {
    kept *= smoothstep(0.55, 1.0, u_cut);
    edge = 0.0;
    glow *= 1.5;
  } else {
    glow *= 1.0 + 1.2 * onFace * u_cut;
  }

  p += u_apart;
  // In a choir each singer is a bust: below the collar it fades, so the rows behind stay clear.
  kept *= mix(1.0, smoothstep(-17.0, -12.0, p.y), u_bust);
  float neckBend = smoothstep(-26.0, -12.0, p.y);
  p = bent(p, neckBend, true);
  face = bent(face, neckBend, false);
  runs = bent(runs, neckBend, false);
  p = u_place.xyz + turned(p) * u_place.w;
  face = turned(face);
  runs = turned(runs);
  vec4 seen = u_view * vec4(p, 1.0);
  gl_Position = u_lens * seen;
  float away = -seen.z;

  // A shell seen edge-on is bright, seen face-on it is nearly clear: the head is glass.
  vec3 toEye = normalize(u_eye - p);
  float facing = length(face);
  float rim = facing > 1e-4 ? 1.0 - abs(dot(face / facing, toEye)) : 0.6;
  // A little light from in front and above models the face when it is turned toward the eye.
  float lit = facing > 1e-4 ? max(0.0, dot(face / facing, vec3(0.55, 0.45, 0.7))) : 0.0;
  glow *= mix(1.0, 0.06 + 1.2 * rim * rim + 0.6 * lit * lit, edge);
  // Depth: the near side of the head is brighter than the far side, so the cloud reads as a
  // solid seen from one side and the far half's outlines do not cross the near half's.
  vec3 mid = u_place.xyz + turned(vec3(-0.5, 3.0, 0.0)) * u_place.w;
  float behind = (away + (u_view * vec4(mid, 1.0)).z) / (9.0 * u_place.w);
  glow *= clamp(1.0 - 0.5 * behind, 0.42, 1.35);
  float down = length(runs) > 1e-4 ? dot(normalize(runs), toEye) : 0.0;
  glow *= 1.0 - endOn * down * down;
  // Light thins with distance.
  glow *= clamp(1.0 - (away - u_far) / (u_far * 0.6), 0.35, 1.5);
  // A slow twinkle, and here and there a mote that catches the light like a star.
  float twinkle = hash(seed * 7.0 + floor(u_time * 0.6 + seed * 9.0));
  glow *= 0.8 + 0.4 * twinkle;
  if (hash(seed * 3.7) > 0.988 && kind != ${KIND.flow}) {
    size *= 1.7;
    glow *= 1.3 + 1.6 * smoothstep(0.6, 1.0, twinkle);
  }

  float wide = size * u_grain * u_place.w * 0.085 * u_pixels / away;
  // A point cannot be smaller than a pixel or so; below that it dims instead.
  float drawn = clamp(wide, 1.6, 40.0);
  gl_PointSize = drawn;
  float dim = (wide * wide) / (drawn * drawn);
  // In colour, the hue drifts a little across the body and with time, like light through glass.
  vec3 tint = u_tint;
  if (u_colour > 0.001) {
    float a = p.y * 0.12 + p.x * 0.09 + seed * 1.5 + u_time * 0.15;
    tint *= 1.0 + 0.28 * u_colour * vec3(sin(a), sin(a + 2.1), sin(a + 4.2));
  }
  // The iris: sea-blue in the cold look, a deeper blue-green in colour.
  tint = mix(tint, mix(vec3(0.55, 0.86, 1.0), vec3(0.25, 0.75, 0.95), u_colour), iris);
  vec3 colour = heat(tint, clamp(warm, 0.0, 1.0));
  v_light = vec4(colour * glow * dim * kept * u_shown * u_gain * u_lit, 1.0);
  if (kept * u_shown * u_lit * glow <= 0.0005) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const DUST_FRAGMENT = `#version 300 es
precision mediump float;
in vec4 v_light;
out vec4 o;
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float soft = max(0.0, 1.0 - dot(d, d));
  o = vec4(v_light.rgb * soft * soft, 1.0);
}
`;

/** One triangle that covers the screen. */
export const SCREEN_VERTEX = `#version 300 es
out vec2 v_at;
void main() {
  v_at = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(v_at * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Shrink the picture to a quarter, keeping its light. */
export const SHRINK_FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_from;
uniform vec2 u_step;
in vec2 v_at;
out vec4 o;
void main() {
  o = 0.25 * (texture(u_from, v_at + u_step * vec2(-1.0, -1.0)) + texture(u_from, v_at + u_step * vec2(1.0, -1.0)) +
              texture(u_from, v_at + u_step * vec2(-1.0, 1.0)) + texture(u_from, v_at + u_step * vec2(1.0, 1.0)));
}
`;

/** Blur along one direction (nine samples' worth in five reads). */
export const BLUR_FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_from;
uniform vec2 u_step;
in vec2 v_at;
out vec4 o;
void main() {
  o = texture(u_from, v_at) * 0.2270270 +
      (texture(u_from, v_at + u_step * 1.3846154) + texture(u_from, v_at - u_step * 1.3846154)) * 0.3162162 +
      (texture(u_from, v_at + u_step * 3.2307692) + texture(u_from, v_at - u_step * 3.2307692)) * 0.0702703;
}
`;

/** The finished frame: the dust, its glow, the faint lift behind the head, fitted to the screen's range. */
export const FINISH_FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D u_dust;
uniform sampler2D u_glow;
uniform sampler2D u_haze;
uniform vec3 u_head;     // where the head is on screen (0..1) and how big
uniform float u_aspect;
in vec2 v_at;
out vec4 o;
void main() {
  vec3 light = texture(u_dust, v_at).rgb + texture(u_glow, v_at).rgb * 0.55 + texture(u_haze, v_at).rgb * 0.5;
  // Many dim particles add up smoothly instead of clipping to white.
  vec3 c = 1.0 - exp(-light * 1.25);
  vec2 from = (v_at - u_head.xy) * vec2(u_aspect, 1.0);
  float lift = exp(-dot(from, from) / (u_head.z * u_head.z));
  c += mix(vec3(0.0118, 0.0157, 0.0353), vec3(0.039, 0.051, 0.102), lift) * (1.0 - c);
  // A breath of noise hides the steps a dark gradient would show.
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  o = vec4(c + (grain - 0.5) / 255.0, 1.0);
}
`;
