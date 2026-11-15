# The look

Orpheon shows a voice as a body made of light. The head is not drawn; it is a dense cloud of
particles that holds the shape of a head, and every part inside it (tongue, palate, folds, the
air itself) is its own cloud that can be shown alone. Sound is heat: wherever the air is ringing,
the dust there warms from cold blue to gold to white.

## Principles

1. **The body is the interface.** The cloud fills the page edge to edge, behind everything. The
   controls are quiet, at the edges, and can be dismissed so the head is alone.
2. **What you see is what you hear.** Every moving thing is driven by the voice's telemetry: the
   tongue surface is where the simulated tube says it is, the bright bands in the air are the
   real standing wave. Nothing moves for decoration except a slow drift that keeps the dust alive.
3. **Cold matter, warm sound.** Tissue is cold starlight. Warmth appears only where there is
   acoustic energy or airflow, so the eye is led to the sound.
4. **No boxes.** No cards, no outlined panels, no pills with fills. Text and controls sit directly
   on the dark. Grouping is done with space and alignment; a hairline only where space fails.
5. **Light, not paint.** Particles add their light together (additive blending) and thin out with
   distance. Dense where a surface is, sparse inside it, so shapes read as glowing shells.

## Palette

| Role | Value | Use |
|---|---|---|
| void | `#030409` | The page. A barely visible lift (`#0a0d1a`) behind the head, nothing else. |
| dust | `#c9d6ff` | Tissue at rest. Each part leans slightly its own way inside the cold family (ice, pearl, lavender, sea) so parts separate without a rainbow. |
| ghost | dust at 4% | A part that is hidden while another is shown alone. |
| warm | `#ffd58a` | Sound energy and airflow: the heat ramp runs dust → warm → `#ffffff`. Also the single accent of the interface (the thing that is on, the value being changed). |
| ink | `#e8ecff` | Text. |
| ink-2 | `#8a93b8` | Secondary text, labels. |
| ink-3 | `#4a5170` | Tertiary text, resting controls, hairlines at low alpha. |

No other hues in the look itself. No gradients on interface elements (the veil that darkens the
page under the bottom controls is not one: it belongs to the dark, not to a control). No drop
shadows; things glow or they don't.

**Colour, by the viewer's choice.** The "Colour" slider in View leans every part from its cold
tint toward its own hue (`vivid` in `src/view/layers.ts`: rose skin, ivory bone, red tongue, teal
nose, sky air, green larynx, violet lungs, gold sound), the hue drifting slowly across the body
like light through glass. Sound still warms toward gold and white. "Density" thins the cloud to
airy motes or thickens it past the usual (1.5 times the particles are made; two thirds are drawn
at the start). Both are kept in this browser, not in links.

## Type

One light, open sans for everything and one mono for numbers; self-hosted, open-licensed, under
150 KB together. Not Inter, Instrument Sans, Fraunces or Geist. Labels are small, sentence case,
generously spaced; the only large type is the word or lyric being voiced.

## Layout

- The canvas is the whole viewport. Nothing else has a background.
- Left edge: the parts of the body (a short list; click to show or hide, click the dot to see one
  alone). Right edge: the controls of the current mode. Bottom: what is being said or sung, and
  the transport. Top: the name, the modes, nothing more.
- Everything but the canvas fades away after a few idle seconds while sound is playing, and
  returns on movement.
- Both side columns start under the top bar, level, each in titled groups (small, spaced,
  ink-2 at three quarters).
- On a phone: the name and Video on the first line, the four modes across the second. At the foot
  one row: the main button, then Body, Controls and More. Each opens a sheet above that row. A
  sheet is a panel of the void itself (it must stand over the body to be read), its name and Done
  at its head.

## The eyes

The eyes are open: an eyeball behind each opening, its iris a disc of radial streaks with a dark
pupil, a clear cornea that shows as a bright arc from the side. The lids are the skin over the
opening; in a blink the upper lid comes down with its edge lit. They blink as a person does,
every few seconds, sometimes twice, and glance about between (`src/view/eyes.ts`); each singer
on its own. This is the one movement not driven by the voice: a face that never blinks reads as
dead.

## Motion

Everything eases; nothing snaps or bounces. The cloud drifts slowly as if breathing. With
`prefers-reduced-motion` the drift stops, the eyes stay open and look ahead, and transitions are instant; the voice-driven motion
stays, because it is the content.

## Video looks

The Video frame has four looks, chosen in its menu (`src/app/film/frames.ts` places them,
`overlay.ts` draws them):

- **Score** (the default): the heads above; under them the voices' timeline, each voice a line of
  light in its own cold tint (ice, lavender, sea, pearl) moving right to left past a still dotted
  line. The note being sung warms and carries a bead at the line; the syllables run along the
  bottom as they come. The band's pictures in a row beneath.
- **Stage**: the heads large, the big word and its sounds, the band as a quiet strip.
- **Band**: every instrument large. Each is drawn as itself in hairlines of dust: the harp's
  frame, the tanpura's and sarod's gourds and necks, the esraj's frets, a fiddle's bouts, the
  tabla's and timpani's shells and heads, the piano's keys. Strings take the shape the
  instrument reports and warm as they sound; heads ripple with their modes.
- **Heads**: the singers alone.

A song written with its own captions (Bengali, German) shows its line in its own script, lit
syllable by syllable, with the English under it, instead of the big word.
