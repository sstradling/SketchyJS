# Accessibility

A sketch is a picture, not a document. The paths are not an accessible name.

## SVG

`SketchySvg` and `<sketchy-shape>` set `role="img"` and copy `label` to `aria-label`. Pass a label that says what the drawing is, not how it was hatched.

```tsx
<Sketchy
  shapes={rectangle(10, 10, 80, 60)}
  size={{ width: 120, height: 90 }}
  options={{ seed: 42n, fillStyle: "hachure" }}
  label="A hand-drawn rectangle"
/>
```

If you call `renderToSvgString` yourself, put the string in an element with `role="img"` and an accessible name. Do not rely on the path data being read as text.

Decorative sketches that repeat a nearby heading should use `aria-hidden="true"` instead of a label.

## Canvas

`renderToCanvas` draws pixels and exposes no text. Give the `<canvas>` an accessible name, or put a visually hidden description next to it. The SVG string of the same scene is a reasonable text alternative when you need one. React's `SketchySvg` is that alternative: it does not load the canvas renderer.

## Motion

`useContourPhase` and `createAnimation` move the drawing. Respect `prefers-reduced-motion`: leave `running` false on `useContourPhase`, or do not start the animation controller. A still frame at phase 0 is the reduced-motion state. Contour scroll does not re-roll wobble, but it is still motion.

## Contrast

Hatch, wash, and crayon are textured. Do not use a low-contrast fill as the only carrier of meaning. Interior shades darken a shape; they are not a focus ring. A halo is decorative.

## Hit targets

The generator does not produce buttons. If a shape is interactive, the hit target is your element's box, not the rough outline. Holes in a sticker or a contour clip are visual. They are not keyboard stops.
