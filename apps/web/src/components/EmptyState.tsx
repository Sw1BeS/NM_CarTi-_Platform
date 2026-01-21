import React from 'react';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    actionLabel?: string;
    action?: () => void;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon,
    title,
    description,
    actionLabel,
    action,
    className = ''
}) => {
    return (
        <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
            <div className="text-[var(--text-secondary)] mb-4 opacity-50">
                {icon}
            </div>
            <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2">
                {title}
            </h3>
            {description && (
                <p className="text-sm text-[var(--text-secondary)] max-w-md">
                    {description}
                </p>
            )}
            {action && actionLabel && (
                <button
                    onClick={action}
                    className="btn-primary mt-6"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};
