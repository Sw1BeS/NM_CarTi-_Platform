import React from 'react';
import { Check, Search, X } from 'lucide-react';
import type { SearchableSelectOption } from './SearchableSelect';

type MultiSelectComboboxProps = {
  label: string;
  placeholder: string;
  values: string[];
  options: SearchableSelectOption[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
};

const matchesQuery = (option: SearchableSelectOption, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [option.label, ...(option.aliases || [])]
    .some((value) => value.toLowerCase().includes(needle));
};

export const MultiSelectCombobox = ({
  label,
  placeholder,
  values,
  options,
  onChange,
  disabled
}: MultiSelectComboboxProps) => {
  const listboxId = React.useId();
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const matchingOptions = React.useMemo(
    () => options.filter((option) => matchesQuery(option, query)),
    [options, query]
  );
  const visibleOptions = matchingOptions.slice(0, 24);
  const activeOption = visibleOptions[activeIndex];
  const hiddenOptionsCount = Math.max(0, matchingOptions.length - visibleOptions.length);

  const toggle = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    const next = values.includes(option.label)
      ? values.filter((value) => value !== option.label)
      : [...values, option.label];
    onChange(next);
    setQuery('');
    setOpen(true);
  };

  const remove = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className="space-y-3">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white"
            >
              <span className="min-w-0 truncate">{value}</span>
              <button
                type="button"
                onClick={() => remove(value)}
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                aria-label={`Прибрати ${value}`}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={18} />
          <input
            aria-label={label}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={activeOption ? `${listboxId}-${activeOption.id}` : undefined}
            aria-expanded={open && !disabled}
            role="combobox"
            disabled={disabled}
            className="min-h-[48px] w-full rounded-xl border border-white/10 bg-[#15171a] py-3 pl-10 pr-4 text-sm font-semibold text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/35 focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={placeholder}
            value={query}
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
                  toggle(activeOption);
                }
              } else if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
        </div>

        {open && !disabled && (
          <div
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto overscroll-contain rounded-xl border border-white/12 bg-[#111316] shadow-2xl shadow-black/50"
          >
            {visibleOptions.length ? visibleOptions.map((option, index) => {
              const selected = values.includes(option.label);
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
                  onClick={() => toggle(option)}
                  className={`flex min-h-[48px] w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-white/35 ${
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
            {hiddenOptionsCount > 0 && (
              <div className="border-t border-white/8 px-4 py-2 text-xs text-white/42">
                Показано перші 24. Уточніть пошук, щоб звузити список.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
