/**
 * Dependency-aware auto-layout for a task map.
 *
 * Dragging every node by hand is fine for five nodes and unusable for thirty,
 * which is the real reason maps stayed tiny. This arranges nodes into layers by
 * following the connections: anything with no incoming edge starts at the top,
 * and every node sits one layer below its deepest prerequisite. The result reads
 * top-to-bottom as the order the work actually happens in.
 *
 * A longest-path layering rather than a shortest-path one, so a node never
 * appears above something it depends on. Cycles are tolerated (a map is drawn by
 * a human, not validated as a DAG): the walk is depth-limited and any node the
 * traversal cannot place falls into a trailing layer instead of hanging.
 *
 * Pure and framework-free, so the geometry is unit-tested rather than eyeballed
 * on a canvas.
 */

export type LayoutNode = { id: string };
export type LayoutEdge = { source: string; target: string };
export type Positioned = { id: string; x: number; y: number };
export type Point = { x: number; y: number };

export const LAYOUT_COLUMN_GAP = 240;
export const LAYOUT_ROW_GAP = 170;

/** The node card's footprint, used to keep a new node fully on screen. */
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 140;

/** The visible slice of the canvas, in flow coordinates. */
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Find an empty spot near `origin` for a new node.
 *
 * Dropping every new node at the viewport centre with a little random jitter
 * buried each one under the last, so adding three nodes looked like adding one.
 * This walks outward through the layout grid and returns the first cell far
 * enough from every node already placed.
 *
 * `bounds` is what stops the spiral walking off screen. Without it the fourth or
 * fifth node landed outside the visible canvas: invisible, and impossible to
 * drag, because the pointer lands on the page behind the canvas instead. Spots
 * that fit inside the viewport are preferred; a spot outside it is used only
 * when the visible area is genuinely full, and the caller brings it into view.
 *
 * `taken` is the existing node positions (React Flow's top-left origin).
 */
export function findFreeSpot(taken: Point[], origin: Point, bounds?: Bounds): Point {
  const clear = (candidate: Point) =>
    taken.every(
      (p) =>
        Math.abs(p.x - candidate.x) >= LAYOUT_COLUMN_GAP * 0.9 ||
        Math.abs(p.y - candidate.y) >= LAYOUT_ROW_GAP * 0.9,
    );

  const inView = (candidate: Point) =>
    !bounds ||
    (candidate.x >= bounds.minX &&
      candidate.y >= bounds.minY &&
      candidate.x + NODE_WIDTH <= bounds.maxX &&
      candidate.y + NODE_HEIGHT <= bounds.maxY);

  if (taken.length === 0 && inView(origin)) return { ...origin };

  // Nearest-first ring walk. Collect the best on-screen spot; remember the first
  // off-screen one as a fallback so a full viewport still places the node.
  let offScreenFallback: Point | null = null;
  for (let ring = 0; ring <= 12; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        // Only the perimeter: the inside was covered by a smaller ring.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const candidate = {
          x: origin.x + dx * LAYOUT_COLUMN_GAP,
          y: origin.y + dy * LAYOUT_ROW_GAP,
        };
        if (!clear(candidate)) continue;
        if (inView(candidate)) return candidate;
        offScreenFallback ??= candidate;
      }
    }
  }

  if (offScreenFallback) return offScreenFallback;
  // Nothing free nearby: land below everything rather than on top of it.
  if (taken.length === 0) return { ...origin };
  return { x: origin.x, y: Math.max(...taken.map((p) => p.y)) + LAYOUT_ROW_GAP };
}

/**
 * Assign every node a layer index. Roots (no incoming edge) are layer 0; every
 * other node is one past the deepest layer among its sources.
 */
export function assignLayers(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    // Ignore edges pointing at nodes that are not on the map (or self-loops).
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    (incoming.get(edge.target) ?? incoming.set(edge.target, []).get(edge.target)!).push(edge.source);
    (outgoing.get(edge.source) ?? outgoing.set(edge.source, []).get(edge.source)!).push(edge.target);
  }

  const layer = new Map<string, number>();
  for (const node of nodes) {
    if ((incoming.get(node.id)?.length ?? 0) === 0) layer.set(node.id, 0);
  }

  // Relax layers by walking forward from the roots. Bounded by node count, so a
  // cycle terminates instead of spinning.
  const queue = [...layer.keys()];
  let guard = nodes.length * nodes.length + nodes.length;
  while (queue.length > 0 && guard-- > 0) {
    const current = queue.shift()!;
    const currentLayer = layer.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const proposed = currentLayer + 1;
      if ((layer.get(next) ?? -1) < proposed) {
        layer.set(next, proposed);
        queue.push(next);
      }
    }
  }

  // Anything unreachable (inside a cycle with no root) goes after everything
  // placed so far, rather than silently landing on top of layer 0.
  const maxPlaced = layer.size > 0 ? Math.max(...layer.values()) : -1;
  const overflow = maxPlaced + 1;
  for (const node of nodes) {
    if (!layer.has(node.id)) layer.set(node.id, overflow);
  }

  return layer;
}

/**
 * Lay the map out top-to-bottom, centring each layer horizontally so the shape
 * reads as a flow rather than a left-aligned list.
 *
 * `order` preserves the caller's existing node order within a layer, which keeps
 * a tidy-up from reshuffling nodes the user has already grouped side by side.
 */
export function layoutMap(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): Positioned[] {
  if (nodes.length === 0) return [];

  const layer = assignLayers(nodes, edges);
  const byLayer = new Map<number, string[]>();
  for (const node of nodes) {
    const l = layer.get(node.id) ?? 0;
    const bucket = byLayer.get(l) ?? [];
    bucket.push(node.id);
    byLayer.set(l, bucket);
  }

  const widest = Math.max(...[...byLayer.values()].map((b) => b.length));
  const positioned: Positioned[] = [];

  for (const [layerIndex, bucket] of [...byLayer.entries()].sort(([a], [b]) => a - b)) {
    // Centre this layer against the widest one.
    const offset = ((widest - bucket.length) * LAYOUT_COLUMN_GAP) / 2;
    bucket.forEach((id, i) => {
      positioned.push({
        id,
        x: origin.x + offset + i * LAYOUT_COLUMN_GAP,
        y: origin.y + layerIndex * LAYOUT_ROW_GAP,
      });
    });
  }

  return positioned;
}
