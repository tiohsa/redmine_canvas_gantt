declare module 'canvas2svg' {
    class C2S {
        constructor(options: { width?: number; height?: number; document?: Document; ctx?: CanvasRenderingContext2D; });
        constructor(width: number, height: number);
        getContext(type: string): CanvasRenderingContext2D; // Actually returns C2S which mimics context
        getSerializedSvg(fixNamedEntities?: boolean): string;
        getSvg(): SVGSVGElement;

        // Helper to satisfy TS that expects CanvasRenderingContext2D methods
        save(): void;
        restore(): void;
        scale(x: number, y: number): void;
        rotate(angle: number): void;
        translate(x: number, y: number): void;
        transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
        setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
        resetTransform(): void;
        createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
        createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
        createPattern(image: CanvasImageSource, repetition: string | null): CanvasPattern | null;
        clearRect(x: number, y: number, w: number, h: number): void;
        fillRect(x: number, y: number, w: number, h: number): void;
        strokeRect(x: number, y: number, w: number, h: number): void;
        beginPath(): void;
        fill(fillRule?: CanvasFillRule): void;
        stroke(path?: Path2D): void;
        clip(fillRule?: CanvasFillRule): void;
        isPointInPath(x: number, y: number, fillRule?: CanvasFillRule): boolean;
        isPointInStroke(x: number, y: number): boolean;
        measureText(text: string): TextMetrics;
        setLineDash(segments: number[]): void;
        getLineDash(): number[];
        closePath(): void;
        moveTo(x: number, y: number): void;
        lineTo(x: number, y: number): void;
        quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
        bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
        arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
        rect(x: number, y: number, w: number, h: number): void;
        arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
        ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
        drawImage(image: CanvasImageSource, dx: number, dy: number): void;
        drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
        drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
        createImageData(sw: number, sh: number): ImageData;
        createImageData(imagedata: ImageData): ImageData;
        getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
        putImageData(imagedata: ImageData, dx: number, dy: number): void;
        putImageData(imagedata: ImageData, dx: number, dy: number, dirtyX: number, dirtyY: number, dirtyWidth: number, dirtyHeight: number): void;
        fillText(text: string, x: number, y: number, maxWidth?: number): void;
        strokeText(text: string, x: number, y: number, maxWidth?: number): void;

        fillStyle: string | CanvasGradient | CanvasPattern;
        strokeStyle: string | CanvasGradient | CanvasPattern;
        shadowColor: string;
        shadowBlur: number;
        shadowOffsetX: number;
        shadowOffsetY: number;
        lineCap: CanvasLineCap;
        lineJoin: CanvasLineJoin;
        lineWidth: number;
        miterLimit: number;
        font: string;
        textAlign: CanvasTextAlign;
        textBaseline: CanvasTextBaseline;
        globalAlpha: number;
        globalCompositeOperation: GlobalCompositeOperation;
    }
    export = C2S;
}
