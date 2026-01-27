import React from 'react';

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => {
    return (
        <div className={`panel p-4 animate-pulse ${className}`}>
            <div className="h-4 bg-[var(--bg-input)] rounded w-3/4 mb-3" />
            <div className="h-4 bg-[var(--bg-input)] rounded w-1/2 mb-3" />
            <div className="h-3 bg-[var(--bg-input)] rounded w-full" />
        </div>
    );
};

export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
};

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 5 }) => {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="panel p-4 animate-pulse">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[var(--bg-input)] rounded-full" />
                        <div className="flex-1">
                            <div className="h-4 bg-[var(--bg-input)] rounded w-1/2 mb-2" />
                            <div className="h-3 bg-[var(--bg-input)] rounded w-3/4" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
    rows = 5,
    cols = 4
}) => {
    return (
        <div className="panel overflow-hidden">
            <div className="animate-pulse">
                {/* Header */}
                <div className="flex gap-4 p-4 border-b border-[var(--border-color)]">
                    {Array.from({ length: cols }).map((_, i) => (
                        <div key={i} className="flex-1 h-4 bg-[var(--bg-input)] rounded" />
                    ))}
                </div>
                {/* Rows */}
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <div key={rowIndex} className="flex gap-4 p-4 border-b border-[var(--border-color)]">
                        {Array.from({ length: cols }).map((_, colIndex) => (
                            <div key={colIndex} className="flex-1 h-3 bg-[var(--bg-input)] rounded" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
};

export const SkeletonLoader: React.FC = () => {
    return (
        <div className="w-full max-w-md">
            <SkeletonCard />
        </div>
    );
};
