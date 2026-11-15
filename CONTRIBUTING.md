# Contributing to Orpheon

Thank you for wanting to help. A few things to know first.

## The licence of what you send

Orpheon is released under the GNU Affero General Public License, version 3 or later
(`LICENSE`). By sending a contribution (a pull request, a patch, an issue with code in it) you
agree that:

1. it is your own work, or you have the right to send it, and it contains no code copied from
   another voice synthesizer;
2. it is licensed under AGPL-3.0-or-later like the rest of the project; and
3. the project's owner may also license it, with the rest of Orpheon, under other terms (for
   example a commercial licence for someone who cannot use the AGPL).

Point 3 is what lets the project offer a commercial licence at all. If you do not agree to it,
say so in your pull request before it is merged.

## How the work is done here

Every change follows a few house rules:

- **Physics from papers, not from other programs.** Cite the paper in a comment where a model or
  a constant comes from one. Do not read the source of other voice synthesizers.
- **The voice never allocates while rendering**, its output does not depend on the block size,
  it holds from 8 kHz to 192 kHz without NaN, and its noise is seeded.
- **Small files, plain names.** Comments say why, not what.
- **The look is `docs/look.md`.** Read it before drawing or styling anything.
- **The judges are not tuned.** `tools/voice-judge.ts`, `voice-story.ts` and `voice-pairs.ts`
  measure the voice; change the voice to raise their scores, never the tests.

## Before you send

```sh
bun run typecheck
bun test
bun run build && bun run preview     # then, in another terminal:
bun tools/e2e.ts                     # must print non-zero peaks and "errors: none"
```
