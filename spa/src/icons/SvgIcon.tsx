import type { CSSProperties } from 'react';

type SvgIconProps = {
    name: string;
    size?: number;
    className?: string;
    style?: CSSProperties;
    title?: string;
};

export const SvgIcon = ({ name, size = 16, className, style, title }: SvgIconProps) => (
    <svg
        aria-hidden={title ? undefined : true}
        className={className}
        height={size}
        role={title ? 'img' : undefined}
        style={{ display: 'block', flexShrink: 0, ...style }}
        viewBox="0 0 24 24"
        width={size}
    >
        {title ? <title>{title}</title> : null}
        <use href={`#${name}`} />
    </svg>
);
