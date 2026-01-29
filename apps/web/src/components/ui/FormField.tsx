import React from 'react';

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  input: React.ReactNode;
  helpText?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, input, helpText, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{label}</label>
    {input}
    {helpText && <p className="text-[11px] text-[var(--text-secondary)]">{helpText}</p>}
  </div>
);
