import React from 'react';
import { Car, Search, SlidersHorizontal, MessageSquare, Star, Truck } from 'lucide-react';
import { CarListing } from '../../../../types';
import { MiniAppImage } from '../components/MiniAppImage';

type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type InventoryTab = 'IN_STOCK' | 'IN_TRANSIT';
type SortBy = 'price_asc' | 'price_desc' | 'year_desc';

type InventoryFilters = {
  brand: string;
  minYear: string;
  maxYear: string;
  minPrice: string;
  maxPrice: string;
};

type CarSpecs = {
  brand: string;
  model: string;
  engine: string;
  fuel: string;
  transmission: string;
  drive: string;
  color: string;
  vin: string;
  condition: string;
};

const METALLIC_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #f7f8fa 0%, #d7dbe1 34%, #a4abb4 68%, #f1f3f6 100%)',
  color: '#101216',
  boxShadow: '0 10px 22px rgba(210,216,224,0.16), inset 0 1px 0 rgba(255,255,255,0.85)'
};

const EMPTY_FILTERS: InventoryFilters = {
  brand: '',
  minYear: '',
  maxYear: '',
  minPrice: '',
  maxPrice: ''
};

const KEYBOARD_SCROLL_DELAYS_MS = [0, 120, 320, 560];

const findScrollableParent = (target: HTMLElement) => {
  let parent = target.parentElement;
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight + 1) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
};

const scrollFieldIntoKeyboardSafeView = (target: HTMLElement, preferredContainer?: HTMLElement | null) => {
  if (!target.isConnected) return;
  const scrollContainer = preferredContainer ?? findScrollableParent(target);
  if (scrollContainer?.isConnected) {
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const keyboardInset = Math.max(0, window.innerHeight - (window.visualViewport?.height ?? window.innerHeight));
    const bottomPadding = Math.min(180, Math.max(24, keyboardInset + 16));
    const availableHeight = Math.max(80, scrollContainer.clientHeight - bottomPadding);
    const targetTop = scrollContainer.scrollTop
      + targetRect.top
      - containerRect.top
      - Math.max(12, (availableHeight - targetRect.height) / 2);

    scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const targetRect = target.getBoundingClientRect();
  const bottomGuard = Math.min(viewportHeight - 16, viewportHeight * 0.72);
  if (targetRect.bottom > bottomGuard || targetRect.top < 12) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
};

const scheduleKeyboardSafeFieldScroll = (target: HTMLElement, preferredContainer?: HTMLElement | null) => {
  KEYBOARD_SCROLL_DELAYS_MS.forEach(delay => {
    window.setTimeout(() => {
      if (document.activeElement !== target) return;
      scrollFieldIntoKeyboardSafeView(target, preferredContainer);
    }, delay);
  });
};

const buildSpecTiles = (
  specs: CarSpecs,
  car: CarListing,
  formatMileage: (value: unknown) => string,
  toNumberSafe: (value: unknown) => number
) => {
  const year = toNumberSafe(car.year);
  const items = [
    { label: 'Рік', value: year ? String(year) : '' },
    { label: 'Пробіг', value: formatMileage(car.mileage) },
    { label: 'Двигун', value: specs.engine },
    { label: 'Пальне', value: specs.fuel },
    { label: 'КПП', value: specs.transmission },
    { label: 'Привід', value: specs.drive },
    { label: 'Стан', value: specs.condition },
    { label: 'Колір', value: specs.color },
    { label: 'VIN', value: specs.vin ? `${specs.vin.slice(0, 8)}...` : '' }
  ];

  const visible = items.filter(item => item.value && item.value !== '—').slice(0, 6);
  return visible.length ? visible : items.slice(0, 4).map(item => ({ ...item, value: item.value || '—' }));
};

type CatalogViewProps = {
  surfaceMode: MiniAppSurfaceMode;
  tab: InventoryTab;
  search: string;
  showFilters: boolean;
  filters: InventoryFilters;
  sortBy: SortBy;
  filteredCars: CarListing[];
  selectedCarsCount: number;
  onTabChange: (tab: InventoryTab) => void;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onFiltersChange: (next: InventoryFilters) => void;
  onSortChange: (sortBy: SortBy) => void;
  onResetFilters: () => void;
  getCarId: (car?: CarListing | null) => string;
  getCarImages: (car: CarListing) => string[];
  getCarSpecs: (car: CarListing | null | undefined) => CarSpecs;
  formatBrandModel: (car: CarListing | null | undefined) => string;
  formatMileage: (value: unknown) => string;
  formatPrice: (price?: { amount?: number; currency?: string }) => string;
  toNumberSafe: (value: unknown) => number;
  getStatusLabel: (car: CarListing) => string;
  isFavorite: (carId: string) => boolean;
  isSelectedForRequest: (carId: string) => boolean;
  onToggleFavorite: (car: CarListing) => void;
  onPrimaryAction: (car: CarListing) => void;
  onToggleRequestSelection: (car: CarListing) => void;
  onOpenListing: (car: CarListing) => void;
  onEmptyRequest: () => void;
};

type InventoryCardProps = {
  car: CarListing;
  surfaceMode: MiniAppSurfaceMode;
  cardActionLabel: string;
  getCarId: (car?: CarListing | null) => string;
  getCarImages: (car: CarListing) => string[];
  getCarSpecs: (car: CarListing | null | undefined) => CarSpecs;
  formatBrandModel: (car: CarListing | null | undefined) => string;
  formatMileage: (value: unknown) => string;
  formatPrice: (price?: { amount?: number; currency?: string }) => string;
  toNumberSafe: (value: unknown) => number;
  getStatusLabel: (car: CarListing) => string;
  isFavorite: (carId: string) => boolean;
  isSelectedForRequest: (carId: string) => boolean;
  onToggleFavorite: (car: CarListing) => void;
  onPrimaryAction: (car: CarListing) => void;
  onToggleRequestSelection: (car: CarListing) => void;
  onOpenListing: (car: CarListing) => void;
};

const InventoryCard = React.memo(function InventoryCard({
  car,
  surfaceMode,
  cardActionLabel,
  getCarId,
  getCarImages,
  getCarSpecs,
  formatBrandModel,
  formatMileage,
  formatPrice,
  toNumberSafe,
  getStatusLabel,
  isFavorite,
  isSelectedForRequest,
  onToggleFavorite,
  onPrimaryAction,
  onToggleRequestSelection,
  onOpenListing
}: InventoryCardProps) {
  const images = getCarImages(car);
  const cover = images[0];
  const specs = getCarSpecs(car);
  const carId = getCarId(car);
  const title = car.presentation?.title || car.title || formatBrandModel(car);
  const specTiles = car.presentation?.detailRows?.length
    ? car.presentation.detailRows.slice(0, 4)
    : buildSpecTiles(specs, car, formatMileage, toNumberSafe).slice(0, 4);
  const chips = (car.presentation?.specChips?.length
    ? car.presentation.specChips.slice(0, 3).map(value => ({ label: '', value }))
    : specTiles
  ).filter(item => item.value && item.value !== '—');
  const selected = isSelectedForRequest(carId);
  const favorite = isFavorite(carId);

  return (
    <article
      data-catalog-card
      className={`shrink-0 rounded-[20px] border bg-white/[0.045] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.28)] ${selected ? 'border-white/42' : 'border-white/10'}`}
    >
      <div className="flex gap-3">
        <div className="relative size-[116px] shrink-0 overflow-hidden rounded-[16px] bg-[#1a1d21]">
          <MiniAppImage
            src={cover}
            sources={images}
            alt={title}
            className="size-full object-cover"
            fallbackClassName="flex size-full flex-col items-center justify-center bg-[#202226] text-white/22"
            fallbackLabel="Фото готується"
          />
          <button
            type="button"
            onClick={() => onOpenListing(car)}
            className="absolute inset-0"
            aria-label={`Відкрити ${title}`}
          />
          {images.length > 1 && (
            <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
              {images.length} фото
            </div>
          )}
          <button
            type="button"
            onClick={() => onToggleFavorite(car)}
            className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
            aria-label={favorite ? 'Прибрати з обраного' : 'Додати в обране'}
          >
            <Star size={15} className={favorite ? 'fill-[#F0D27A] text-[#F0D27A]' : 'text-white/72'} />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="rounded-full border border-white/10 bg-black/24 px-2 py-1 text-[10px] font-bold text-white/58">
              {getStatusLabel(car)}
            </span>
            <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-white/44">
              {toNumberSafe(car.year) || '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenListing(car)}
            className="block w-full text-left"
          >
            <h3 className="line-clamp-2 text-[15px] font-black leading-tight text-white">{title}</h3>
            <p className="mt-1 truncate text-[11px] text-white/48">
              {car.presentation?.subtitle || formatBrandModel(car)}
            </p>
          </button>
          <div className="mt-2 text-lg font-black leading-none text-[#F4F6F8]">
            {car.presentation?.priceLabel || formatPrice(car.price)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.slice(0, 3).map(item => (
              <span
                key={`${carId}_${item.label}_${item.value}`}
                className="max-w-full truncate rounded-full border border-white/10 bg-black/24 px-2 py-1 text-[10px] font-semibold text-white/58"
              >
                {item.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => onPrimaryAction(car)}
          className="flex min-w-0 items-center justify-center gap-2 rounded-[14px] py-3 text-sm font-black active:scale-[0.98]"
          style={METALLIC_STYLE}
        >
          <MessageSquare size={17} />
          <span className="truncate">{cardActionLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleRequestSelection(car)}
          className="rounded-[14px] border border-white/10 px-3 py-3 text-xs font-bold text-white/72 active:scale-[0.98]"
        >
          {selected ? 'У виборі' : surfaceMode === 'B2B' ? 'В запит' : 'Додати'}
        </button>
      </div>
    </article>
  );
});

export const CatalogView = ({
  surfaceMode,
  tab,
  search,
  showFilters,
  filters,
  sortBy,
  filteredCars,
  selectedCarsCount,
  onTabChange,
  onSearchChange,
  onToggleFilters,
  onFiltersChange,
  onSortChange,
  onResetFilters,
  getCarId,
  getCarImages,
  getCarSpecs,
  formatBrandModel,
  formatMileage,
  formatPrice,
  toNumberSafe,
  getStatusLabel,
  isFavorite,
  isSelectedForRequest,
  onToggleFavorite,
  onPrimaryAction,
  onToggleRequestSelection,
  onOpenListing,
  onEmptyRequest
}: CatalogViewProps) => {
  const cardActionLabel = surfaceMode === 'B2B' ? 'Створити запит по авто' : 'Зацікавило це авто';
  const title = surfaceMode === 'B2B' ? 'B2B склад' : 'Каталог CarTié';
  const subtitle = surfaceMode === 'B2B'
    ? 'Inventory партнерської мережі без дублювання авто'
    : 'Авто в наявності, в дорозі та під швидкий запит';
  const [draftFilters, setDraftFilters] = React.useState<InventoryFilters>(filters);
  const [draftSortBy, setDraftSortBy] = React.useState<SortBy>(sortBy);
  const filterPanelRef = React.useRef<HTMLFormElement | null>(null);
  const filterControlsRef = React.useRef<Array<HTMLInputElement | HTMLSelectElement | null>>([]);

  React.useEffect(() => {
    setDraftFilters(filters);
  }, [filters.brand, filters.minYear, filters.maxYear, filters.minPrice, filters.maxPrice]);

  React.useEffect(() => {
    setDraftSortBy(sortBy);
  }, [sortBy]);

  const registerFilterControl = (index: number) => (node: HTMLInputElement | HTMLSelectElement | null) => {
    filterControlsRef.current[index] = node;
  };

  const focusControl = (index: number) => {
    window.setTimeout(() => {
      const control = filterControlsRef.current[index];
      if (!control) return;
      control.focus({ preventScroll: true });
      scheduleKeyboardSafeFieldScroll(control, filterPanelRef.current);
    }, 40);
  };

  const dismissKeyboard = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    dismissKeyboard();
  };

  const handleFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, nextIndex?: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (nextIndex !== undefined) {
      focusControl(nextIndex);
      return;
    }
    onFiltersChange(draftFilters);
    onSortChange(draftSortBy);
    dismissKeyboard();
  };

  const handleFieldFocus = (event: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.currentTarget;
    scheduleKeyboardSafeFieldScroll(target, filterPanelRef.current);
  };

  const applyFilterDraft = () => {
    onFiltersChange(draftFilters);
    onSortChange(draftSortBy);
    dismissKeyboard();
  };

  const resetFilterDraft = () => {
    setDraftFilters(EMPTY_FILTERS);
    setDraftSortBy('year_desc');
    onResetFilters();
    onSortChange('year_desc');
    dismissKeyboard();
  };

  const draftActiveCount = [
    draftFilters.brand,
    draftFilters.minYear,
    draftFilters.maxYear,
    draftFilters.minPrice,
    draftFilters.maxPrice,
    draftSortBy !== 'year_desc' ? draftSortBy : ''
  ].filter(Boolean).length;
  const hasPendingFilterChanges = draftSortBy !== sortBy
    || draftFilters.brand !== filters.brand
    || draftFilters.minYear !== filters.minYear
    || draftFilters.maxYear !== filters.maxYear
    || draftFilters.minPrice !== filters.minPrice
    || draftFilters.maxPrice !== filters.maxPrice;

  return (
    <div className="animate-fade-in flex h-full min-h-0 flex-col bg-[#050608]">
      <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-white/10 bg-[#050608]/92 p-4 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/44">{subtitle}</p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onTabChange('IN_STOCK')}
            className={`flex-1 rounded-[14px] px-3 py-2.5 text-sm font-black transition-all flex items-center justify-center gap-2 ${tab === 'IN_STOCK'
              ? 'text-black'
              : 'border border-white/10 bg-white/[0.045] text-white/56'
              }`}
            style={tab === 'IN_STOCK' ? METALLIC_STYLE : undefined}
          >
            <Car size={16} />
            {surfaceMode === 'B2B' ? 'Склад' : 'В наявності'}
          </button>
          <button
            type="button"
            onClick={() => onTabChange('IN_TRANSIT')}
            className={`flex-1 rounded-[14px] px-3 py-2.5 text-sm font-black transition-all flex items-center justify-center gap-2 ${tab === 'IN_TRANSIT'
              ? 'text-black'
              : 'border border-white/10 bg-white/[0.045] text-white/56'
              }`}
            style={tab === 'IN_TRANSIT' ? METALLIC_STYLE : undefined}
          >
            <Truck size={16} />
            В дорозі
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              className="w-full rounded-[16px] border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-white outline-none placeholder-white/28 transition-colors focus:border-white/30"
              placeholder={surfaceMode === 'B2B' ? 'Пошук по складу, бренду, моделі...' : 'Пошук авто, бренду, моделі...'}
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={handleFieldFocus}
              enterKeyHint="search"
            />
          </div>
          <button
            type="button"
            onClick={onToggleFilters}
            className={`relative flex size-12 items-center justify-center rounded-[16px] transition-colors ${showFilters ? 'text-black' : 'border border-white/10 bg-white/[0.055] text-white'
              }`}
            style={showFilters ? METALLIC_STYLE : undefined}
            aria-label="Фільтри"
          >
            <SlidersHorizontal size={20} />
            {draftActiveCount > 0 && (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-black">
                {draftActiveCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <form
            ref={filterPanelRef}
            className="animate-slide-down flex max-h-[min(58vh,calc(var(--tg-viewport-height,100vh)-190px))] flex-col gap-3 overflow-y-auto overscroll-contain rounded-[18px] border border-white/10 bg-[#111417] p-4 pb-5"
            onSubmit={(event) => {
              event.preventDefault();
              applyFilterDraft();
            }}
          >
            <div>
              <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Марка</label>
              <input
                ref={registerFilterControl(0)}
                className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                placeholder="BMW, Mercedes..."
                value={draftFilters.brand}
                onChange={e => setDraftFilters({ ...draftFilters, brand: e.target.value })}
                onFocus={handleFieldFocus}
                onKeyDown={event => handleFilterKeyDown(event, 1)}
                enterKeyHint="next"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік від</label>
                <input
                  ref={registerFilterControl(1)}
                  type="number"
                  inputMode="numeric"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="2018"
                  value={draftFilters.minYear}
                  onChange={e => setDraftFilters({ ...draftFilters, minYear: e.target.value })}
                  onFocus={handleFieldFocus}
                  onKeyDown={event => handleFilterKeyDown(event, 2)}
                  enterKeyHint="next"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік до</label>
                <input
                  ref={registerFilterControl(2)}
                  type="number"
                  inputMode="numeric"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="2024"
                  value={draftFilters.maxYear}
                  onChange={e => setDraftFilters({ ...draftFilters, maxYear: e.target.value })}
                  onFocus={handleFieldFocus}
                  onKeyDown={event => handleFilterKeyDown(event, 3)}
                  enterKeyHint="next"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна від ($)</label>
                <input
                  ref={registerFilterControl(3)}
                  type="number"
                  inputMode="numeric"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="10000"
                  value={draftFilters.minPrice}
                  onChange={e => setDraftFilters({ ...draftFilters, minPrice: e.target.value })}
                  onFocus={handleFieldFocus}
                  onKeyDown={event => handleFilterKeyDown(event, 4)}
                  enterKeyHint="next"
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна до ($)</label>
                <input
                  ref={registerFilterControl(4)}
                  type="number"
                  inputMode="numeric"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="100000"
                  value={draftFilters.maxPrice}
                  onChange={e => setDraftFilters({ ...draftFilters, maxPrice: e.target.value })}
                  onFocus={handleFieldFocus}
                  onKeyDown={event => handleFilterKeyDown(event)}
                  enterKeyHint="done"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Сортування</label>
              <select
                ref={registerFilterControl(5)}
                className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                value={draftSortBy}
                onChange={e => setDraftSortBy(e.target.value as SortBy)}
                onFocus={handleFieldFocus}
              >
                <option value="year_desc">Новіші спочатку</option>
                <option value="price_asc">Ціна: від меншої</option>
                <option value="price_desc">Ціна: від більшої</option>
              </select>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 pt-1">
              <button
                type="submit"
                className="rounded-[12px] py-3 text-sm font-black active:scale-[0.98]"
                style={METALLIC_STYLE}
              >
                {hasPendingFilterChanges ? 'Застосувати зміни' : 'Застосувати'}
              </button>
              <button
                type="button"
                onClick={resetFilterDraft}
                className="rounded-[12px] border border-white/10 bg-white/[0.045] px-3 py-3 text-xs font-bold text-white/64"
              >
                Скинути
              </button>
            </div>
          </form>
        )}

        <div className="w-fit rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/44">
          Знайдено: {filteredCars.length}
        </div>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 ${selectedCarsCount > 0 ? 'pb-32' : 'pb-6'}`}>
        {filteredCars.map(car => {
          const carId = getCarId(car);

          return (
            <InventoryCard
              key={carId || `inventory_${car.title}_${car.year}`}
              car={car}
              surfaceMode={surfaceMode}
              cardActionLabel={cardActionLabel}
              getCarId={getCarId}
              getCarImages={getCarImages}
              getCarSpecs={getCarSpecs}
              formatBrandModel={formatBrandModel}
              formatMileage={formatMileage}
              formatPrice={formatPrice}
              toNumberSafe={toNumberSafe}
              getStatusLabel={getStatusLabel}
              isFavorite={isFavorite}
              isSelectedForRequest={isSelectedForRequest}
              onToggleFavorite={onToggleFavorite}
              onPrimaryAction={onPrimaryAction}
              onToggleRequestSelection={onToggleRequestSelection}
              onOpenListing={onOpenListing}
            />
          );
        })}
        {!filteredCars.length && (
          <div className="mt-10 shrink-0 rounded-[22px] border border-white/10 bg-white/[0.045] p-5 text-center text-white/60">
            <div className="font-bold text-white mb-2">Авто не знайдено</div>
            <div className="text-sm mb-4">
              {surfaceMode === 'B2B' ? 'Спробуйте змінити фільтри або створіть запит для мережі.' : 'Спробуйте змінити фільтри або залиште запит на підбір.'}
            </div>
            <button
              onClick={onEmptyRequest}
              className="w-full py-3 rounded-xl font-bold text-black"
              style={METALLIC_STYLE}
            >
              Підібрати авто
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
