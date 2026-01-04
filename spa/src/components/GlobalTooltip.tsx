import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export const GlobalTooltip: React.FC = () => {
    const [tooltipData, setTooltipData] = useState<{ text: string; x: number; y: number } | null>(null);

    useEffect(() => {
        let activeElement: HTMLElement | null = null;
        let timer: ReturnType<typeof setTimeout>;

        const showTooltip = (el: HTMLElement, x: number, y: number) => {
            const text = el.getAttribute('data-tooltip');
            if (text) {
                // Adjust position to not be directly under the cursor
                setTooltipData({ text, x: x + 10, y: y + 10 });
            }
        };

        const onMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const tooltipElement = target.closest('[data-tooltip]') as HTMLElement;

            if (tooltipElement) {
                activeElement = tooltipElement;
                // Fast 100ms delay to feel instant but avoid flickering
                timer = setTimeout(() => {
                    showTooltip(tooltipElement, e.clientX, e.clientY);
                }, 100);
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (activeElement) {
                // Move tooltip with mouse if it's already showing
                setTooltipData(prev => prev ? { ...prev, x: e.clientX + 15, y: e.clientY + 15 } : null);
            }
        };

        const onMouseOut = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const tooltipElement = target.closest('[data-tooltip]');
            // If we leave the element, clear everything
            if (tooltipElement && tooltipElement === activeElement) {
                clearTimeout(timer);
                activeElement = null;
                setTooltipData(null);
            }
        };

        document.addEventListener('mouseover', onMouseOver);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseout', onMouseOut);

        return () => {
            document.removeEventListener('mouseover', onMouseOver);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseout', onMouseOut);
        };
    }, []);

    if (!tooltipData) return null;

    // Use portal to render at body level to avoid overflow clipping
    return createPortal(
        <div
            className="rcg-tooltip"
            style={{
                position: 'fixed',
                top: tooltipData.y,
                left: tooltipData.x,
                // Ensure it doesn't go off screen (basic check, can be improved)
                transform: 'translate(0, 0)',
            }}
        >
            {tooltipData.text}
        </div>,
        document.body
    );
};
