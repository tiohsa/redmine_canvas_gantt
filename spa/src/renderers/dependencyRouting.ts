export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type PortPosition = 'LEFT_CENTER' | 'RIGHT_CENTER' | 'TOP_CENTER' | 'BOTTOM_CENTER';

export type RouteParams = {
    outset: number;
    inset: number;
    step: number;
    maxShift: number;
};

export type ViewportLike = {
    scrollY: number;
    height: number;
};

export type RouteContext = {
    rowHeight: number;
    fromRowIndex: number;
    toRowIndex: number;
    columnWidth: number;
};

type Segment = { from: Point; to: Point };

const DEFAULT_PARAMS: RouteParams = {
    outset: 20,
    inset: 12,
    step: 24,
    maxShift: 8
};

export function getPort(rect: Rect, position: PortPosition): Point {
    switch (position) {
        case 'LEFT_CENTER':
            return { x: rect.x, y: rect.y + rect.height / 2 };
        case 'RIGHT_CENTER':
            return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
        case 'TOP_CENTER':
            return { x: rect.x + rect.width / 2, y: rect.y };
        case 'BOTTOM_CENTER':
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
        default:
            return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    }
}

export function routeDependencyFS(
    fromRect: Rect,
    toRect: Rect,
    obstacles: Rect[],
    viewport: ViewportLike,
    context: RouteContext,
    params: RouteParams = DEFAULT_PARAMS
): Point[] {
    const fromPort = getPort(fromRect, 'RIGHT_CENTER');
    const toPort = getPort(toRect, 'LEFT_CENTER');

    const routed = routeShortestOrthogonal(fromPort, toPort, obstacles, viewport, context, params);
    if (routed) {
        return routed;
    }

    const boundaryY = pickRowBoundary(context);
    return simplifyOrthogonal(buildRouteViaBoundary(fromPort, toPort, params, boundaryY));
}

function routeShortestOrthogonal(
    fromPort: Point,
    toPort: Point,
    obstacles: Rect[],
    viewport: ViewportLike,
    context: RouteContext,
    params: RouteParams
): Point[] | null {
    const clearance = 2;
    const relevantObstacles = filterRelevantObstacles(fromPort, toPort, obstacles, context.rowHeight);
    const expandedObstacles = relevantObstacles.map((rect) => inflateRect(rect, clearance));

    const xs = collectCandidateXs(fromPort, toPort, expandedObstacles, viewport, context, params);
    const ys = collectCandidateYs(fromPort, toPort, expandedObstacles, viewport, context, params);

    if (xs.length < 2 || ys.length < 2) return null;

    const xToIndex = new Map(xs.map((x, index) => [x, index]));
    const yToIndex = new Map(ys.map((y, index) => [y, index]));
    const start = { x: xToIndex.get(fromPort.x), y: yToIndex.get(fromPort.y) };
    const goal = { x: xToIndex.get(toPort.x), y: yToIndex.get(toPort.y) };
    if (start.x === undefined || start.y === undefined || goal.x === undefined || goal.y === undefined) {
        return null;
    }

    const edges = buildEdgeMap(xs, ys, expandedObstacles);
    const nodeCount = xs.length * ys.length;
    const bestDist = new Array<number>(nodeCount * 3).fill(Infinity);
    const bestBends = new Array<number>(nodeCount * 3).fill(Infinity);
    const prev = new Array<{ state: number; node: number } | null>(nodeCount * 3).fill(null);
    const queue: Array<{ state: number; node: number; distance: number; bends: number }> = [];

    const startNode = toNodeIndex(start.x, start.y, ys.length);
    const goalNode = toNodeIndex(goal.x, goal.y, ys.length);
    const startState = toStateIndex(startNode, 0);
    bestDist[startState] = 0;
    bestBends[startState] = 0;
    queue.push({ state: startState, node: startNode, distance: 0, bends: 0 });

    while (queue.length > 0) {
        queue.sort((a, b) => (a.distance - b.distance) || (a.bends - b.bends));
        const current = queue.shift();
        if (!current) break;
        if (current.distance !== bestDist[current.state] || current.bends !== bestBends[current.state]) continue;

        if (current.node === goalNode) {
            const path = restorePath(current.state, prev, xs, ys);
            return simplifyOrthogonal(path);
        }

        const neighbors = edges.get(current.node) ?? [];
        for (const next of neighbors) {
            const nextDirection = next.direction;
            const currentDirection = current.state % 3;
            const addedBend = currentDirection !== 0 && currentDirection !== nextDirection ? 1 : 0;
            const nextDistance = current.distance + next.length;
            const nextBends = current.bends + addedBend;
            const nextState = toStateIndex(next.node, nextDirection);

            if (
                nextDistance < bestDist[nextState] ||
                (nextDistance === bestDist[nextState] && nextBends < bestBends[nextState])
            ) {
                bestDist[nextState] = nextDistance;
                bestBends[nextState] = nextBends;
                prev[nextState] = { state: current.state, node: current.node };
                queue.push({ state: nextState, node: next.node, distance: nextDistance, bends: nextBends });
            }
        }
    }

    return null;
}

function filterRelevantObstacles(fromPort: Point, toPort: Point, obstacles: Rect[], margin: number): Rect[] {
    const minX = Math.min(fromPort.x, toPort.x) - margin * 2;
    const maxX = Math.max(fromPort.x, toPort.x) + margin * 2;
    const minY = Math.min(fromPort.y, toPort.y) - margin * 3;
    const maxY = Math.max(fromPort.y, toPort.y) + margin * 3;

    return obstacles.filter((rect) => !(
        rect.x + rect.width < minX ||
        rect.x > maxX ||
        rect.y + rect.height < minY ||
        rect.y > maxY
    ));
}

function inflateRect(rect: Rect, padding: number): Rect {
    return {
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2
    };
}

function collectCandidateXs(
    fromPort: Point,
    toPort: Point,
    obstacles: Rect[],
    viewport: ViewportLike,
    context: RouteContext,
    params: RouteParams
): number[] {
    const minBase = Math.min(fromPort.x, toPort.x);
    const maxBase = Math.max(fromPort.x, toPort.x);
    const corridor = Math.max(context.columnWidth, context.rowHeight);

    const values = new Set<number>([
        fromPort.x,
        toPort.x,
        fromPort.x + params.outset,
        toPort.x - params.inset,
        minBase - corridor,
        maxBase + corridor,
        minBase - corridor * 2,
        maxBase + corridor * 2,
        viewport.scrollY // dummy to keep deterministic set size independent from no-obstacle cases
    ]);
    values.delete(viewport.scrollY);

    obstacles.forEach((rect) => {
        values.add(rect.x - 1);
        values.add(rect.x + rect.width + 1);
    });

    return Array.from(values).sort((a, b) => a - b);
}

function collectCandidateYs(
    fromPort: Point,
    toPort: Point,
    obstacles: Rect[],
    viewport: ViewportLike,
    context: RouteContext,
    params: RouteParams
): number[] {
    const boundary = pickRowBoundary(context);
    const values = new Set<number>([
        fromPort.y,
        toPort.y,
        boundary,
        boundary + context.rowHeight,
        boundary - context.rowHeight,
        ...buildShiftOffsets(params.maxShift, context.rowHeight).map((shift) => boundary + shift),
        ...buildBypassCandidates(viewport, context.rowHeight)
    ]);

    obstacles.forEach((rect) => {
        values.add(rect.y - 1);
        values.add(rect.y + rect.height + 1);
    });

    return Array.from(values).sort((a, b) => a - b);
}

function buildEdgeMap(
    xs: number[],
    ys: number[],
    obstacles: Rect[]
): Map<number, Array<{ node: number; length: number; direction: 1 | 2 }>> {
    const edges = new Map<number, Array<{ node: number; length: number; direction: 1 | 2 }>>();

    const addEdge = (fromNode: number, toNode: number, length: number, direction: 1 | 2) => {
        if (!edges.has(fromNode)) edges.set(fromNode, []);
        edges.get(fromNode)?.push({ node: toNode, length, direction });
    };

    for (let yIndex = 0; yIndex < ys.length; yIndex += 1) {
        for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
            const from: Point = { x: xs[xIndex], y: ys[yIndex] };
            const to: Point = { x: xs[xIndex + 1], y: ys[yIndex] };
            if (segmentBlocked(from, to, obstacles)) continue;

            const leftNode = toNodeIndex(xIndex, yIndex, ys.length);
            const rightNode = toNodeIndex(xIndex + 1, yIndex, ys.length);
            const length = Math.abs(to.x - from.x);
            addEdge(leftNode, rightNode, length, 1);
            addEdge(rightNode, leftNode, length, 1);
        }
    }

    for (let xIndex = 0; xIndex < xs.length; xIndex += 1) {
        for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
            const from: Point = { x: xs[xIndex], y: ys[yIndex] };
            const to: Point = { x: xs[xIndex], y: ys[yIndex + 1] };
            if (segmentBlocked(from, to, obstacles)) continue;

            const topNode = toNodeIndex(xIndex, yIndex, ys.length);
            const bottomNode = toNodeIndex(xIndex, yIndex + 1, ys.length);
            const length = Math.abs(to.y - from.y);
            addEdge(topNode, bottomNode, length, 2);
            addEdge(bottomNode, topNode, length, 2);
        }
    }

    return edges;
}

function segmentBlocked(from: Point, to: Point, obstacles: Rect[]): boolean {
    return obstacles.some((rect) => segmentIntersectsRect(from, to, rect));
}

function toNodeIndex(xIndex: number, yIndex: number, ySize: number): number {
    return xIndex * ySize + yIndex;
}

function toStateIndex(nodeIndex: number, direction: 0 | 1 | 2): number {
    return nodeIndex * 3 + direction;
}

function restorePath(
    endState: number,
    prev: Array<{ state: number; node: number } | null>,
    xs: number[],
    ys: number[]
): Point[] {
    const points: Point[] = [];
    let cursor: number | null = endState;

    while (cursor !== null) {
        const node = Math.floor(cursor / 3);
        const xIndex = Math.floor(node / ys.length);
        const yIndex = node % ys.length;
        points.push({ x: xs[xIndex], y: ys[yIndex] });
        cursor = prev[cursor]?.state ?? null;
    }

    points.reverse();
    return points;
}

function buildShiftOffsets(maxShift: number, step: number): number[] {
    const offsets: number[] = [];
    for (let i = 1; i <= maxShift; i += 1) {
        offsets.push(i * step, -i * step);
    }
    return offsets;
}

function buildBypassCandidates(viewport: ViewportLike, rowHeight: number): number[] {
    const topSafe = snapToGridLine(viewport.scrollY + rowHeight, rowHeight);
    const bottomSafe = snapToGridLine(viewport.scrollY + viewport.height - rowHeight, rowHeight);
    return [topSafe, bottomSafe];
}

function pickRowBoundary(context: RouteContext): number {
    const fromTop = context.fromRowIndex * context.rowHeight;
    const fromBottom = fromTop + context.rowHeight;

    if (context.fromRowIndex === context.toRowIndex) {
        return fromBottom;
    }

    if (context.fromRowIndex < context.toRowIndex) {
        return fromBottom;
    }

    return fromTop;
}

function snapToGridLine(y: number, rowHeight: number): number {
    if (rowHeight <= 0) return y;
    return Math.round(y / rowHeight) * rowHeight;
}

function buildRouteViaBoundary(
    fromPort: Point,
    toPort: Point,
    params: RouteParams,
    boundaryY: number
): Point[] {
    const outsetX = fromPort.x + params.outset;
    const insetX = toPort.x - params.inset;

    return [
        fromPort,
        { x: outsetX, y: fromPort.y },
        { x: outsetX, y: boundaryY },
        { x: insetX, y: boundaryY },
        { x: insetX, y: toPort.y },
        toPort
    ];
}


function simplifyOrthogonal(points: Point[]): Point[] {
    if (points.length <= 2) return points;
    const simplified: Point[] = [points[0]];

    for (let i = 1; i < points.length; i += 1) {
        const prev = simplified[simplified.length - 1];
        const curr = points[i];

        if (prev.x === curr.x && prev.y === curr.y) {
            continue;
        }

        if (simplified.length >= 2) {
            const prevPrev = simplified[simplified.length - 2];
            const isVertical = prevPrev.x === prev.x && prev.x === curr.x;
            const isHorizontal = prevPrev.y === prev.y && prev.y === curr.y;
            if (isVertical || isHorizontal) {
                simplified[simplified.length - 1] = curr;
                continue;
            }
        }

        simplified.push(curr);
    }

    return simplified;
}


export function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
    if (rectContainsPoint(rect, a) || rectContainsPoint(rect, b)) {
        return true;
    }

    const rectPoints: Point[] = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height }
    ];
    const edges: Segment[] = [
        { from: rectPoints[0], to: rectPoints[1] },
        { from: rectPoints[1], to: rectPoints[2] },
        { from: rectPoints[2], to: rectPoints[3] },
        { from: rectPoints[3], to: rectPoints[0] }
    ];

    for (const edge of edges) {
        if (segmentsIntersect(a, b, edge.from, edge.to)) {
            return true;
        }
    }

    return false;
}

function rectContainsPoint(rect: Rect, point: Point): boolean {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const d1 = direction(p3, p4, p1);
    const d2 = direction(p3, p4, p2);
    const d3 = direction(p1, p2, p3);
    const d4 = direction(p1, p2, p4);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
    }

    if (d1 === 0 && onSegment(p3, p4, p1)) return true;
    if (d2 === 0 && onSegment(p3, p4, p2)) return true;
    if (d3 === 0 && onSegment(p1, p2, p3)) return true;
    if (d4 === 0 && onSegment(p1, p2, p4)) return true;

    return false;
}

function direction(a: Point, b: Point, c: Point): number {
    return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function onSegment(a: Point, b: Point, c: Point): boolean {
    return (
        Math.min(a.x, b.x) <= c.x &&
        c.x <= Math.max(a.x, b.x) &&
        Math.min(a.y, b.y) <= c.y &&
        c.y <= Math.max(a.y, b.y)
    );
}
