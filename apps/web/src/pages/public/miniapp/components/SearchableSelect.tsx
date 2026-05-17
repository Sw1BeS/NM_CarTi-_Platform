import React from 'react';
import { Check, Search, X } from 'lucide-react';

export type SearchableSelectOption = {
  id: string;
  label: string;
  aliases?: string[];
  disabled?: boolean;
};

type SearchableSelectProps = {
  label: string;
  placeholder: string;
  value?: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

const matchesQuery = (option: SearchableSelectOption, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [option.label, ...(option.aliases || [])]
    .some((value) => value.toLowerCase().includes(needle));
};

export const SearchableSelect = ({
  label,
  placeholder,
  value,
  options,
  onChange,
  disabled
}: SearchableSelectProps) => {
  const inputId = React.useId();
  const listboxId = React.useId();
  const [query, setQuery] = React.useState(value || '');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const visibleOptions = React.useMemo(
    () => options.filter((option) => matchesQuery(option, query)).slice(0, 24),
    [options, query]
  );
  const activeOption = visibleOptions[activeIndex];

  React.useEffect(() => {
    if (!open) setQuery(value || '');
  }, [open, value]);

  const pick = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.label);
    setQuery(option.label);
    setOpen(false);
  };

  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(true);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={18} />
        <input
          id={inputId}
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeOption ? `${listboxId}-${activeOption.id}` : undefined}
          aria-expanded={open && !disabled}
          role="combobox"
          disabled={disabled}
          className="w-full rounded-xl border border-white/10 bg-[#15171a] py-3 pl-10 pr-10 text-sm font-semibold text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/35 disabled:opacity-50"
          placeholder={placeholder}
          value={open ? query : (value || '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(visibleOptions.length - 1, index + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter') {
              if (open && activeOption) {
                event.preventDefault();
                pick(activeOption);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/45 hover:bg-white/8 hover:text-white"
            aria-label={`Очистити ${label}`}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/12 bg-[#111316] shadow-2xl shadow-black/50"
        >
          {visibleOptions.length ? visibleOptions.map((option, index) => {
            const selected = value === option.label;
            const active = index === activeIndex;
            return (
              <button
                key={option.id}
                id={`${listboxId}-${option.id}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(option)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition-colors ${
                  selected || active ? 'bg-white/12 text-white' : 'text-white/78 hover:bg-white/8 hover:text-white'
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected && <Check size={16} className="shrink-0 text-white/60" />}
              </button>
            );
          }) : (
            <div className="px-4 py-3 text-sm text-white/50">Нічого не знайдено</div>
          )}
        </div>
      )}
    </div>
  );
};
