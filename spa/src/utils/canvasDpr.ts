export function getCanvasDpr(): number {
    return window.devicePixelRatio || 1;
}

export function getCanvasLogicalSize(canvas: HTMLCanvasElement): {
    width: number;
    height: number;
} {
    const dpr = getCanvasDpr();
    const style = canvas.style;
    const width = parseInt(style?.width || '0', 10) || canvas.width / dpr;
    const height = parseInt(style?.height || '0', 10) || canvas.height / dpr;

    return {
        width: Math.max(0, width),
        height: Math.max(0, height),
    };
}

export function resizeCanvasForDpr(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D | null,
    cssWidth: number,
    cssHeight: number
): void {
    if (cssWidth <= 0 || cssHeight <= 0) return;

    const dpr = getCanvasDpr();
    const targetBufferWidth = Math.floor(cssWidth * dpr);
    const targetBufferHeight = Math.floor(cssHeight * dpr);

    if (canvas.width !== targetBufferWidth || canvas.height !== targetBufferHeight) {
        canvas.width = targetBufferWidth;
        canvas.height = targetBufferHeight;
    }

    if (canvas.style.width !== `${cssWidth}px`) {
        canvas.style.width = `${cssWidth}px`;
    }
    if (canvas.style.height !== `${cssHeight}px`) {
        canvas.style.height = `${cssHeight}px`;
    }

    if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
}

export function snapTextPosition(value: number): number {
    return Math.round(value);
}

export function snapLinePosition(value: number): number {
    return Math.floor(value) + 0.5;
}
