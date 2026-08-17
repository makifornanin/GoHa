import { describe, expect, it } from "vitest";

import {
  assignLayers,
  findFreeSpot,
  LAYOUT_COLUMN_GAP,
  LAYOUT_ROW_GAP,
  layoutMap,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutEdge,
  type LayoutNode,
  type Point,
} from "@/lib/task-map-layout";

function nodes(...ids: string[]): LayoutNode[] {
  return ids.map((id) => ({ id }));
}

function edges(...pairs: [string, string][]): LayoutEdge[] {
  return pairs.map(([source, target]) => ({ source, target }));
}

describe("assignLayers", () => {
  it("puts a node with no incoming edge on the first layer", () => {
    const layers = assignLayers(nodes("a", "b"), edges(["a", "b"]));
    expect(layers.get("a")).toBe(0);
    expect(layers.get("b")).toBe(1);
  });

  it("layers a chain in order", () => {
    const layers = assignLayers(nodes("a", "b", "c", "d"), edges(["a", "b"], ["b", "c"], ["c", "d"]));
    expect([layers.get("a"), layers.get("b"), layers.get("c"), layers.get("d")]).toEqual([0, 1, 2, 3]);
  });

  it("takes the LONGEST path, so a node never sits above a prerequisite", () => {
    // a -> b -> c and a -> c. The short edge must not pull c up next to b.
    const layers = assignLayers(nodes("a", "b", "c"), edges(["a", "b"], ["b", "c"], ["a", "c"]));
    expect(layers.get("c")).toBe(2);
  });

  it("keeps parallel branches on the same layer", () => {
    const layers = assignLayers(
      nodes("root", "left", "right", "join"),
      edges(["root", "left"], ["root", "right"], ["left", "join"], ["right", "join"]),
    );
    expect(layers.get("left")).toBe(1);
    expect(layers.get("right")).toBe(1);
    expect(layers.get("join")).toBe(2);
  });

  it("places unconnected nodes on the first layer", () => {
    const layers = assignLayers(nodes("a", "loner"), edges());
    expect(layers.get("loner")).toBe(0);
  });

  it("terminates on a cycle instead of hanging", () => {
    // Every node has an incoming edge, so there is no root to start from.
    const layers = assignLayers(nodes("a", "b", "c"), edges(["a", "b"], ["b", "c"], ["c", "a"]));
    expect(layers.size).toBe(3);
    for (const id of ["a", "b", "c"]) expect(Number.isFinite(layers.get(id))).toBe(true);
  });

  it("puts a cycle after the work that can be placed", () => {
    const layers = assignLayers(
      nodes("root", "x", "y"),
      edges(["root", "x"], ["x", "y"], ["y", "x"]),
    );
    // y is only reachable through x, so it lands below root rather than on it.
    expect(layers.get("root")).toBe(0);
    expect(layers.get("y")!).toBeGreaterThan(0);
  });

  it("ignores self-loops and edges pointing off the map", () => {
    const layers = assignLayers(nodes("a", "b"), edges(["a", "a"], ["ghost", "b"], ["a", "b"]));
    expect(layers.get("a")).toBe(0);
    expect(layers.get("b")).toBe(1);
  });
});

describe("layoutMap", () => {
  it("returns nothing for an empty map", () => {
    expect(layoutMap([], [])).toEqual([]);
  });

  it("stacks layers one row apart", () => {
    const positioned = layoutMap(nodes("a", "b"), edges(["a", "b"]));
    const byId = new Map(positioned.map((p) => [p.id, p]));
    expect(byId.get("b")!.y - byId.get("a")!.y).toBe(LAYOUT_ROW_GAP);
  });

  it("spaces siblings one column apart", () => {
    const positioned = layoutMap(
      nodes("root", "left", "right"),
      edges(["root", "left"], ["root", "right"]),
    );
    const byId = new Map(positioned.map((p) => [p.id, p]));
    expect(byId.get("left")!.y).toBe(byId.get("right")!.y);
    expect(Math.abs(byId.get("right")!.x - byId.get("left")!.x)).toBe(LAYOUT_COLUMN_GAP);
  });

  it("centres a narrow layer against the widest one", () => {
    const positioned = layoutMap(
      nodes("root", "left", "right"),
      edges(["root", "left"], ["root", "right"]),
    );
    const byId = new Map(positioned.map((p) => [p.id, p]));
    const midpoint = (byId.get("left")!.x + byId.get("right")!.x) / 2;
    expect(byId.get("root")!.x).toBe(midpoint);
  });

  it("anchors the whole layout at the given origin", () => {
    const origin = { x: 500, y: -120 };
    const positioned = layoutMap(nodes("a", "b"), edges(["a", "b"]), origin);
    const byId = new Map(positioned.map((p) => [p.id, p]));
    expect(byId.get("a")).toEqual({ id: "a", x: 500, y: -120 });
    expect(byId.get("b")!.y).toBe(-120 + LAYOUT_ROW_GAP);
  });

  it("positions every node exactly once", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const positioned = layoutMap(nodes(...ids), edges(["a", "b"], ["b", "c"], ["d", "e"]));
    expect(positioned).toHaveLength(ids.length);
    expect(new Set(positioned.map((p) => p.id))).toEqual(new Set(ids));
  });

  it("never overlaps two nodes", () => {
    const positioned = layoutMap(
      nodes("a", "b", "c", "d", "e", "f"),
      edges(["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["d", "e"]),
    );
    const seen = new Set(positioned.map((p) => `${p.x}:${p.y}`));
    expect(seen.size).toBe(positioned.length);
  });
});

describe("findFreeSpot", () => {
  const origin = { x: 100, y: 100 };

  /** True when two nodes would visually sit on top of each other. */
  function overlaps(a: Point, b: Point) {
    return (
      Math.abs(a.x - b.x) < LAYOUT_COLUMN_GAP * 0.9 && Math.abs(a.y - b.y) < LAYOUT_ROW_GAP * 0.9
    );
  }

  it("uses the origin on an empty map", () => {
    expect(findFreeSpot([], origin)).toEqual(origin);
  });

  it("uses the origin when nothing is near it", () => {
    expect(findFreeSpot([{ x: 2000, y: 2000 }], origin)).toEqual(origin);
  });

  it("steps aside when the origin is taken", () => {
    const spot = findFreeSpot([origin], origin);
    expect(overlaps(spot, origin)).toBe(false);
  });

  it("keeps every node clear when added one after another", () => {
    const placed: Point[] = [];
    for (let i = 0; i < 12; i++) placed.push(findFreeSpot(placed, origin));

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("stays near the origin rather than drifting far away", () => {
    const placed: Point[] = [];
    for (let i = 0; i < 9; i++) placed.push(findFreeSpot(placed, origin));
    // Nine nodes fit inside one ring of the grid around the origin.
    for (const p of placed) {
      expect(Math.abs(p.x - origin.x)).toBeLessThanOrEqual(LAYOUT_COLUMN_GAP);
      expect(Math.abs(p.y - origin.y)).toBeLessThanOrEqual(LAYOUT_ROW_GAP);
    }
  });

  describe("with viewport bounds", () => {
    // A viewport roughly the size of a laptop canvas, in flow coordinates.
    const bounds = { minX: 0, minY: 0, maxX: 1200, maxY: 700 };
    const fits = (p: Point) =>
      p.x >= bounds.minX &&
      p.y >= bounds.minY &&
      p.x + NODE_WIDTH <= bounds.maxX &&
      p.y + NODE_HEIGHT <= bounds.maxY;

    it("keeps every node inside the viewport while there is room", () => {
      const placed: Point[] = [];
      for (let i = 0; i < 8; i++) {
        const spot = findFreeSpot(placed, { x: 500, y: 300 }, bounds);
        expect(fits(spot)).toBe(true);
        placed.push(spot);
      }
    });

    it("never overlaps two nodes even when constrained", () => {
      const placed: Point[] = [];
      for (let i = 0; i < 8; i++) placed.push(findFreeSpot(placed, { x: 500, y: 300 }, bounds));
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          expect(overlaps(placed[i], placed[j])).toBe(false);
        }
      }
    });

    it("pulls a node back inside when the origin sits against an edge", () => {
      // Origin in the bottom-right corner: an unbounded walk would go outside.
      const spot = findFreeSpot([{ x: 1150, y: 650 }], { x: 1150, y: 650 }, bounds);
      expect(fits(spot)).toBe(true);
    });

    it("still places a node when the viewport is completely full", () => {
      // A tiny viewport with one node in it has nowhere free on screen.
      const tiny = { minX: 0, minY: 0, maxX: NODE_WIDTH + 10, maxY: NODE_HEIGHT + 10 };
      const spot = findFreeSpot([{ x: 0, y: 0 }], { x: 0, y: 0 }, tiny);
      expect(spot).toBeDefined();
      expect(overlaps(spot, { x: 0, y: 0 })).toBe(false);
    });

    it("uses the origin on an empty map when the origin is in view", () => {
      expect(findFreeSpot([], { x: 500, y: 300 }, bounds)).toEqual({ x: 500, y: 300 });
    });
  });
});
