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
  primaryColor: string;
  tab: InventoryTab;
  search: string;
  showFilters: boolean;
  filters: InventoryFilters;
  sortBy: SortBy;
  filteredCars: CarListing[];
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

export const CatalogView = ({
  surfaceMode,
  tab,
  search,
  showFilters,
  filters,
  sortBy,
  filteredCars,
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
  const metallicStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #f7f8fa 0%, #d7dbe1 34%, #a4abb4 68%, #f1f3f6 100%)',
    color: '#101216',
    boxShadow: '0 10px 22px rgba(210,216,224,0.16), inset 0 1px 0 rgba(255,255,255,0.85)'
  };

  return (
    <div className="animate-fade-in flex h-full flex-col bg-[#050608] pb-24">
      <div className="sticky top-0 z-20 flex flex-col gap-3 border-b border-white/10 bg-[#050608]/92 p-4 backdrop-blur-xl">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/44">{subtitle}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onTabChange('IN_STOCK')}
            className={`flex-1 rounded-[14px] px-3 py-2.5 text-sm font-black transition-all flex items-center justify-center gap-2 ${tab === 'IN_STOCK'
              ? 'text-black'
              : 'border border-white/10 bg-white/[0.045] text-white/56'
              }`}
            style={tab === 'IN_STOCK' ? metallicStyle : {}}
          >
            <Car size={16} />
            {surfaceMode === 'B2B' ? 'Склад' : 'В наявності'}
          </button>
          <button
            onClick={() => onTabChange('IN_TRANSIT')}
            className={`flex-1 rounded-[14px] px-3 py-2.5 text-sm font-black transition-all flex items-center justify-center gap-2 ${tab === 'IN_TRANSIT'
              ? 'text-black'
              : 'border border-white/10 bg-white/[0.045] text-white/56'
              }`}
            style={tab === 'IN_TRANSIT' ? metallicStyle : {}}
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
            />
          </div>
          <button
            onClick={onToggleFilters}
            className={`flex size-12 items-center justify-center rounded-[16px] transition-colors ${showFilters ? 'text-black' : 'border border-white/10 bg-white/[0.055] text-white'
              }`}
            style={showFilters ? metallicStyle : {}}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>

        {showFilters && (
          <div className="animate-slide-down flex flex-col gap-3 rounded-[18px] border border-white/10 bg-[#111417] p-4">
            <div>
              <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Марка</label>
              <input
                className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                placeholder="BMW, Mercedes..."
                value={filters.brand}
                onChange={e => onFiltersChange({ ...filters, brand: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік від</label>
                <input
                  type="number"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="2018"
                  value={filters.minYear}
                  onChange={e => onFiltersChange({ ...filters, minYear: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік до</label>
                <input
                  type="number"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="2024"
                  value={filters.maxYear}
                  onChange={e => onFiltersChange({ ...filters, maxYear: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна від ($)</label>
                <input
                  type="number"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="10000"
                  value={filters.minPrice}
                  onChange={e => onFiltersChange({ ...filters, minPrice: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна до ($)</label>
                <input
                  type="number"
                  className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="100000"
                  value={filters.maxPrice}
                  onChange={e => onFiltersChange({ ...filters, maxPrice: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Сортування</label>
              <select
                className="w-full rounded-[12px] border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                value={sortBy}
                onChange={e => onSortChange(e.target.value as SortBy)}
              >
                <option value="year_desc">Новіші спочатку</option>
                <option value="price_asc">Ціна: від меншої</option>
                <option value="price_desc">Ціна: від більшої</option>
              </select>
            </div>
            <button
              onClick={onResetFilters}
              className="w-full rounded-[12px] border border-white/10 bg-white/[0.045] py-2 text-xs font-bold text-white/64"
            >
              Скинути фільтри
            </button>
          </div>
        )}

        <div className="w-fit rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/44">
          Знайдено: {filteredCars.length}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {filteredCars.map(car => {
          const images = getCarImages(car);
          const cover = images[0];
          const specs = getCarSpecs(car);
          const carId = getCarId(car);
          const specTiles = car.presentation?.detailRows?.length
            ? car.presentation.detailRows.slice(0, 6)
            : buildSpecTiles(specs, car, formatMileage, toNumberSafe);

          return (
            <div key={carId || `inventory_${car.title}_${car.year}`} className={`flex flex-col overflow-hidden rounded-[22px] border bg-white/[0.045] shadow-[0_18px_55px_rgba(0,0,0,0.28)] ${isSelectedForRequest(carId) ? 'border-white/42' : 'border-white/10'}`}>
              <div className="relative aspect-[4/3] cursor-pointer bg-[#1a1d21]" onClick={() => onOpenListing(car)}>
                <MiniAppImage src={cover} sources={images} alt={car.presentation?.title || car.title || 'Авто'} />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                  <h3 className="text-lg font-bold text-white">{car.presentation?.title || car.title}</h3>
                  <p className="text-[11px] text-white/70 mt-1">
                    {car.presentation?.subtitle || formatBrandModel(car)}
                  </p>
                </div>
                {images.length > 1 && (
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                    +{images.length - 1} фото
                  </div>
                )}
                <div className="absolute top-2 right-12 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                  {getStatusLabel(car)}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(car); }}
                  className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/60"
                >
                  <Star size={16} className={isFavorite(carId) ? 'text-yellow-400 fill-yellow-400' : 'text-white/70'} />
                </button>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-xl font-bold text-[#E4E7EC]">{car.presentation?.priceLabel || formatPrice(car.price)}</div>
                  <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{toNumberSafe(car.year) || '—'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/70 mb-4">
                  {specTiles.map(tile => (
                    <div key={`${carId}_${tile.label}`} className="bg-black/30 p-2 rounded border border-white/5 min-h-[48px]">
                      <div className="text-[9px] uppercase tracking-wide text-white/35 mb-1">{tile.label}</div>
                      <div className="font-semibold text-white/80 leading-snug line-clamp-2">{tile.value}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => onPrimaryAction(car)}
                  className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  style={metallicStyle}
                >
                  <MessageSquare size={18} /> {cardActionLabel}
                </button>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <button
                    onClick={() => onToggleRequestSelection(car)}
                    className="min-w-0 py-2 rounded-xl font-bold text-xs border border-white/10 text-white/80"
                  >
                    {isSelectedForRequest(carId) ? 'У виборі' : 'До запиту'}
                  </button>
                  <button
                    onClick={() => onOpenListing(car)}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-white/70 border border-white/10"
                  >
                    Деталі
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filteredCars.length === 0 && (
          <div className="mt-10 rounded-[22px] border border-white/10 bg-white/[0.045] p-5 text-center text-white/60">
            <div className="font-bold text-white mb-2">Авто не знайдено</div>
            <div className="text-sm mb-4">
              {surfaceMode === 'B2B' ? 'Спробуйте змінити фільтри або створіть запит для мережі.' : 'Спробуйте змінити фільтри або залиште запит на підбір.'}
            </div>
            <button
              onClick={onEmptyRequest}
              className="w-full py-3 rounded-xl font-bold text-black"
              style={metallicStyle}
            >
              Підібрати авто
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
