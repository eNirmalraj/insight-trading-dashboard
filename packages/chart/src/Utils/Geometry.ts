export interface Point {
    x: number;
    y: number;
}

export function distSq(p1: Point, p2: Point): number {
    return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

export function distToSegmentSquared(p: Point, v: Point, w: Point): number {
    const l2 = distSq(v, w);
    if (l2 === 0) return distSq(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distSq(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}
