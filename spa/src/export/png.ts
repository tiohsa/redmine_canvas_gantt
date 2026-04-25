import { buildExportFilename, canvasToBlob, downloadBlob } from './download';
import { getCanvasLogicalSize } from '../utils/canvasDpr';
import type { GanttExportSnapshot } from './types';

export const composeExportCanvas = (snapshot: GanttExportSnapshot): HTMLCanvasElement => {
    // PNG export is intentionally stable in logical CSS pixels instead of
    // changing size with the user's monitor DPR. DPR-backed source canvases are
    // drawn down to their visible logical dimensions below.
    const headerSize = getCanvasLogicalSize(snapshot.headerCanvas);
    const backgroundSize = getCanvasLogicalSize(snapshot.backgroundCanvas);
    const baselineSize = getCanvasLogicalSize(snapshot.baselineCanvas);
    const taskSize = getCanvasLogicalSize(snapshot.taskCanvas);
    const overlaySize = getCanvasLogicalSize(snapshot.overlayCanvas);

    const width = Math.max(
        headerSize.width,
        backgroundSize.width,
        baselineSize.width,
        taskSize.width,
        overlaySize.width
    );
    const chartHeight = Math.max(
        backgroundSize.height,
        baselineSize.height,
        taskSize.height,
        overlaySize.height
    );
    const height = headerSize.height + chartHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to initialize export canvas');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(snapshot.headerCanvas, 0, 0, headerSize.width, headerSize.height);

    const chartY = headerSize.height;
    ctx.drawImage(snapshot.backgroundCanvas, 0, chartY, backgroundSize.width, backgroundSize.height);
    ctx.drawImage(snapshot.baselineCanvas, 0, chartY, baselineSize.width, baselineSize.height);
    ctx.drawImage(snapshot.taskCanvas, 0, chartY, taskSize.width, taskSize.height);
    ctx.drawImage(snapshot.overlayCanvas, 0, chartY, overlaySize.width, overlaySize.height);

    return canvas;
};

export const exportSnapshotAsPng = async (snapshot: GanttExportSnapshot) => {
    const canvas = composeExportCanvas(snapshot);
    const blob = await canvasToBlob(canvas);
    downloadBlob(blob, buildExportFilename('png'));
};
