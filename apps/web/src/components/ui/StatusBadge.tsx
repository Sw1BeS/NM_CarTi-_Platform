import React from 'react';
import { RequestStatus } from '../../types';

const statusStyles: Record<string, string> = {
  [RequestStatus.DRAFT]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  [RequestStatus.COLLECTING_VARIANTS]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  [RequestStatus.SHORTLIST]: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
  [RequestStatus.CONTACT_SHARED]: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
  [RequestStatus.WON]: 'bg-green-500/10 text-green-400 border-green-500/20',
  [RequestStatus.LOST]: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const StatusBadge = ({ status }: { status: string }) => {
  const style = statusStyles[status] || 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)]';
  return (
    <span className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 border ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};
