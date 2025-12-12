import React from 'react';
import { useUIStore, type NotificationType } from '../stores/UIStore';

const Toast: React.FC = () => {
    const { notifications, removeNotification } = useUIStore();

    if (notifications.length === 0) return null;

    const getBackgroundColor = (type: NotificationType) => {
        switch (type) {
            case 'error': return '#ef5350';
            case 'warning': return '#ff9800';
            case 'success': return '#4caf50';
            default: return '#2196f3';
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        }}>
            {notifications.map((notification) => (
                <div
                    key={notification.id}
                    onClick={() => removeNotification(notification.id)}
                    style={{
                        backgroundColor: getBackgroundColor(notification.type),
                        color: 'white',
                        padding: '12px 20px',
                        borderRadius: '4px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                        minWidth: '200px',
                        cursor: 'pointer',
                        animation: 'fadeIn 0.3s ease-in-out',
                        fontSize: '14px',
                        fontWeight: 500
                    }}
                >
                    {notification.message}
                </div>
            ))}
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
            </style>
        </div>
    );
};

export default Toast;
