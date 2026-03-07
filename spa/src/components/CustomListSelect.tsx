import React from 'react';

export type CustomListSelectCloseReason = 'outside' | 'escape' | 'select' | 'toggle';

export interface CustomListSelectOption {
    value: string;
    label: string;
}

interface CustomListSelectProps {
    value: string;
    options: CustomListSelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    width?: string;
    onClose?: (reason: CustomListSelectCloseReason) => void;
    dataTestId?: string;
}

export const CustomListSelect: React.FC<CustomListSelectProps> = ({
    value,
    options,
    onChange,
    disabled = false,
    placeholder,
    width = '100%',
    onClose,
    dataTestId,
}) => {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const selectedOption = options.find((option) => option.value === value);
    const displayText = selectedOption?.label || placeholder || '';

    const closeMenu = React.useCallback((reason: CustomListSelectCloseReason) => {
        setOpen(false);
        onClose?.(reason);
    }, [onClose]);

    React.useEffect(() => {
        if (!open) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                closeMenu('outside');
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMenu('escape');
            }
        };

        document.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [closeMenu, open]);

    return (
        <div ref={containerRef} style={{ position: 'relative', width }}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                data-testid={dataTestId ? `${dataTestId}-button` : undefined}
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    setOpen((prev) => {
                        if (prev) {
                            onClose?.('toggle');
                        }
                        return !prev;
                    });
                }}
                style={{
                    width: '100%',
                    minHeight: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    fontSize: 13,
                    padding: '6px 8px',
                    border: '1px solid #ccc',
                    borderRadius: 4,
                    background: '#fff',
                    color: '#333',
                    cursor: disabled ? 'not-allowed' : 'pointer'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayText}</span>
                <span aria-hidden="true">▾</span>
            </button>

            {open && !disabled ? (
                <div
                    role="listbox"
                    data-testid={dataTestId ? `${dataTestId}-menu` : undefined}
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        right: 0,
                        zIndex: 30,
                        background: '#fff',
                        border: '1px solid #ccc',
                        borderRadius: 6,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
                        maxHeight: 240,
                        overflowY: 'auto'
                    }}
                >
                    {options.map((option) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                data-testid={dataTestId ? `${dataTestId}-option-${option.value || 'empty'}` : undefined}
                                onClick={() => {
                                    onChange(option.value);
                                    closeMenu('select');
                                }}
                                style={{
                                    width: '100%',
                                    border: 'none',
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    background: isSelected ? '#e8f0fe' : '#fff',
                                    color: isSelected ? '#1a73e8' : '#333',
                                    cursor: 'pointer',
                                    fontSize: 13
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
};

