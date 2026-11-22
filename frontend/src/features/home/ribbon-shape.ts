/** A ribbon drawn as filled shapes so its width can change along its length, like a turning band of fabric. */
type Point = [number, number];
/** Cubic Bézier segments: start, control 1, control 2, end. */
export type Segment = [Point, Point, Point, Point];

const at = ([a, b, c, d]: Segment, t: number): Point => {
  const u = 1 - t;
  return [0, 1].map(i => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]) as Point;
};
const slope = ([a, b, c, d]: Segment, t: number): Point => {
  const u = 1 - t;
  return [0, 1].map(i => 3 * u * u * (b[i] - a[i]) + 6 * u * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i])) as Point;
};
const ease = (t: number) => t * t * (3 - 2 * t);

/**
 * One closed outline per segment, `widths[i]` being the width where segment i starts (one more width than segments).
 * Segments are drawn separately so the band can cross itself without leaving a gap.
 */
export function ribbonOutlines(segments: Segment[], widths: number[], steps = 28): string[] {
  return segments.map((segment, index) => {
    const left: string[] = [];
    const right: string[] = [];
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const [x, y] = at(segment, t);
      const [dx, dy] = slope(segment, t);
      const length = Math.hypot(dx, dy) || 1;
      const half = (widths[index] + (widths[index + 1] - widths[index]) * ease(t)) / 2;
      const [nx, ny] = [-dy / length * half, dx / length * half];
      left.push(`${(x + nx).toFixed(1)} ${(y + ny).toFixed(1)}`);
      right.push(`${(x - nx).toFixed(1)} ${(y - ny).toFixed(1)}`);
    }
    return `M ${left.join(" L ")} L ${right.reverse().join(" L ")} Z`;
  });
}
