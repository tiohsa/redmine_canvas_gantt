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

    // Strategy 1: Simple Direct Z-Route with Column Center Snapping
    // Search for a column center that fits in the gap between Source and Target.

    let dropX: number | null = null;
    const minX = fromPort.x + params.outset;
    const maxX = toPort.x - params.inset;

    if (maxX > minX) {
        // Start from the column containing the target start
        const colIndex = Math.floor(toPort.x / context.columnWidth);

        // Look backwards for a few columns to find one that fits
        for (let i = 0; i < 5; i++) {
            const center = (colIndex - i) * context.columnWidth + context.columnWidth / 2;

            // If we went too far left (behind source), stop
            if (center < minX) break;

            // If this center is valid (left of target buffer), use it
            if (center <= maxX) {
                dropX = center;
                break;
            }
        }
    }

    // Only attempt if we found a valid drop point
    if (dropX !== null) {
        const directRoute = [
            fromPort,
            { x: dropX, y: fromPort.y },
            { x: dropX, y: toPort.y },
            toPort
        ];
        if (!pathIntersectsAny(directRoute, obstacles)) {
            return directRoute;
        }
    }

    const boundaryY = pickRowBoundary(context);
    const basePoints = simplifyOrthogonal(buildRouteViaBoundary(fromPort, toPort, params, boundaryY));

    if (!pathIntersectsAny(basePoints, obstacles)) {
        return basePoints;
    }

    const shiftOffsets = buildShiftOffsets(params.maxShift, context.rowHeight);
    for (const offset of shiftOffsets) {
        const shiftedPoints = simplifyOrthogonal(buildRouteViaBoundary(
            fromPort,
            toPort,
            params,
            boundaryY + offset
        ));
        if (!pathIntersectsAny(shiftedPoints, obstacles)) {
            return shiftedPoints;
        }
    }

    const bypassCandidates = buildBypassCandidates(viewport, context.rowHeight);
    for (const safeY of bypassCandidates) {
        const bypassPoints = simplifyOrthogonal(buildRouteViaBoundary(fromPort, toPort, params, safeY));
        if (!pathIntersectsAny(bypassPoints, obstacles)) {
            return bypassPoints;
        }
    }

    const stretch = context.rowHeight;
    const stretchedParams: RouteParams = {
        ...params,
        outset: params.outset + stretch,
        inset: params.inset + stretch
    };
    const stretchedPoints = simplifyOrthogonal(buildRouteViaBoundary(fromPort, toPort, stretchedParams, boundaryY));
    if (!pathIntersectsAny(stretchedPoints, obstacles)) {
        return stretchedPoints;
    }

    return basePoints;
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

function pathIntersectsAny(points: Point[], obstacles: Rect[]): boolean {
    const segments = toSegments(points);
    for (const rect of obstacles) {
        for (const segment of segments) {
            if (segmentIntersectsRect(segment.from, segment.to, rect)) {
                return true;
            }
        }
    }
    return false;
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

function toSegments(points: Point[]): Segment[] {
    const segments: Segment[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
        segments.push({ from: points[i], to: points[i + 1] });
    }
    return segments;
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
