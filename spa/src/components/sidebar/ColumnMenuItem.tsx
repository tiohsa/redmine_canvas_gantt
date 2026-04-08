import React from 'react';

type ColumnMenuItemProps = {
  columnKey: string;
  label: string;
  visible: boolean;
  draggable: boolean;
  isDragging: boolean;
  isDropBefore: boolean;
  isPinned: boolean;
  onToggle: (key: string) => void;
  onDragStart: (key: string, event: React.DragEvent<HTMLElement>) => void;
  onDragOver: (key: string, event: React.DragEvent<HTMLElement>) => void;
  onDrop: (key: string, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};

export const ColumnMenuItem: React.FC<ColumnMenuItemProps> = ({
  columnKey,
  label,
  visible,
  draggable,
  isDragging,
  isDropBefore,
  isPinned,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}) => {
  const handleToggle = () => {
    if (isPinned) return;
    onToggle(columnKey);
  };

  return (
    <div
      role="button"
      aria-disabled={isPinned}
      tabIndex={isPinned ? -1 : 0}
      onDragOver={(event) => onDragOver(columnKey, event)}
      onDrop={(event) => onDrop(columnKey, event)}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;
        handleToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleToggle();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 0',
        color: '#444',
        cursor: isPinned ? 'default' : 'pointer',
        userSelect: 'none',
        opacity: isDragging ? 0.5 : 1,
        borderTop: isDropBefore ? '1px solid #1a73e8' : '1px solid transparent'
      }}
    >
    <button
      type="button"
      draggable={draggable}
      aria-label={`Reorder ${label}`}
      onDragStart={(event) => onDragStart(columnKey, event)}
      onDragEnd={onDragEnd}
      onClick={(event) => event.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        cursor: draggable ? 'move' : 'default',
        padding: 0
      }}
    >
      ⋮⋮
    </button>
    <input
      type="checkbox"
      checked={visible}
      aria-label={label}
      onChange={handleToggle}
      disabled={isPinned}
      onClick={(event) => event.stopPropagation()}
    />
    <span style={{ flex: 1 }}>{label}</span>
    </div>
  );
};
