import React from 'react';
import { Search, SlidersHorizontal, MessageSquare, Star, Image as ImageIcon } from 'lucide-react';
import { CarListing } from '../../../../types';

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

type CatalogViewProps = {
  surfaceMode: MiniAppSurfaceMode;
  primaryColor: string;
  tab: InventoryTab;
  search: string;
  showFilters: boolean;
  filters: InventoryFilters;
  sortBy: SortBy;
  filteredCars: CarListing[];
  favoritesOnly: boolean;
  onTabChange: (tab: InventoryTab) => void;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onToggleFavoritesOnly: () => void;
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
  onOpenLightbox: (car: CarListing) => void;
  onToggleFavorite: (car: CarListing) => void;
  onPrimaryAction: (car: CarListing) => void;
  onToggleRequestSelection: (car: CarListing) => void;
  onOpenListing: (car: CarListing) => void;
};

export const CatalogView = ({
  surfaceMode,
  primaryColor,
  tab,
  search,
  showFilters,
  filters,
  sortBy,
  filteredCars,
  favoritesOnly,
  onTabChange,
  onSearchChange,
  onToggleFilters,
  onToggleFavoritesOnly,
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
  onOpenLightbox,
  onToggleFavorite,
  onPrimaryAction,
  onToggleRequestSelection,
  onOpenListing
}: CatalogViewProps) => {
  const cardActionLabel = surfaceMode === 'B2B' ? 'Створити B2B запит' : 'Зацікавило дане авто';
  const title = surfaceMode === 'B2B'
    ? 'Інвентар мережі'
    : (tab === 'IN_TRANSIT' ? 'Авто в дорозі' : 'Авто в наявності');

  return (
    <div className="animate-fade-in pb-24 h-full flex flex-col bg-black">
      <div className="p-4 sticky top-0 bg-[#000000]/90 backdrop-blur-md z-20 border-b border-white/10 space-y-3">
        <h2 className="text-xl font-bold text-white">{title}</h2>

        <div className="flex gap-2">
          <button
            onClick={() => onTabChange('IN_STOCK')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${tab === 'IN_STOCK'
              ? 'text-black shadow-lg'
              : 'bg-[#1c1c1e] text-white/50'
              }`}
            style={tab === 'IN_STOCK' ? { backgroundColor: primaryColor } : {}}
          >
            ✅ В наявності
          </button>
          <button
            onClick={() => onTabChange('IN_TRANSIT')}
            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${tab === 'IN_TRANSIT'
              ? 'text-black shadow-lg'
              : 'bg-[#1c1c1e] text-white/50'
              }`}
            style={tab === 'IN_TRANSIT' ? { backgroundColor: primaryColor } : {}}
          >
            📦 В дорозі
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              className="w-full bg-[#1c1c1e] text-white pl-10 pr-4 py-3 rounded-xl outline-none placeholder-gray-600 border border-white/5 focus:border-yellow-500/50 transition-colors"
              placeholder="Пошук авто..."
              value={search}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <button
            onClick={onToggleFilters}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${showFilters ? 'text-black' : 'bg-[#1c1c1e] text-white'
              }`}
            style={showFilters ? { backgroundColor: primaryColor } : {}}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>

        {showFilters && (
          <div className="bg-[#1c1c1e] rounded-xl p-4 space-y-3 border border-white/5 animate-slide-down">
            <div>
              <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Марка</label>
              <input
                className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
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
                  className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                  placeholder="2018"
                  value={filters.minYear}
                  onChange={e => onFiltersChange({ ...filters, minYear: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік до</label>
                <input
                  type="number"
                  className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
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
                  className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                  placeholder="10000"
                  value={filters.minPrice}
                  onChange={e => onFiltersChange({ ...filters, minPrice: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна до ($)</label>
                <input
                  type="number"
                  className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                  placeholder="100000"
                  value={filters.maxPrice}
                  onChange={e => onFiltersChange({ ...filters, maxPrice: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Сортування</label>
              <select
                className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
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
              className="w-full py-2 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold"
            >
              Скинути фільтри
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] text-white/50">
            Знайдено: {filteredCars.length}
          </div>
          {surfaceMode !== 'B2B' && (
            <button
              onClick={onToggleFavoritesOnly}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold transition-colors ${
                favoritesOnly
                  ? 'border-yellow-400/50 bg-yellow-400/15 text-yellow-300'
                  : 'border-white/10 text-white/60'
              }`}
            >
              {favoritesOnly ? 'Усі авто' : '⭐ Лише обране'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredCars.map(car => {
          const images = getCarImages(car);
          const cover = images[0];
          const specs = getCarSpecs(car);
          const carId = getCarId(car);

          return (
            <div key={carId || `inventory_${car.title}_${car.year}`} className={`bg-[#1c1c1e] rounded-2xl overflow-hidden border flex flex-col shadow-lg ${isSelectedForRequest(carId) ? 'border-yellow-400/60' : 'border-white/5'}`}>
              <div className="h-48 bg-gray-800 relative cursor-pointer" onClick={() => onOpenLightbox(car)}>
                {cover ? (
                  <img src={cover} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                    <ImageIcon size={48} />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                  <h3 className="text-lg font-bold text-white">{car.title}</h3>
                  <p className="text-[11px] text-white/70 mt-1">
                    {formatBrandModel(car)}
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
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <Star size={16} className={isFavorite(carId) ? 'text-yellow-400 fill-yellow-400' : 'text-white/70'} />
                </button>
              </div>
              <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-xl font-bold" style={{ color: primaryColor }}>{formatPrice(car.price)}</div>
                  <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{toNumberSafe(car.year) || '—'}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-white/70 mb-4">
                  <div className="bg-black/30 p-2 rounded text-center border border-white/5">{specs.engine || '—'}</div>
                  <div className="bg-black/30 p-2 rounded text-center border border-white/5">{formatMileage(car.mileage)}</div>
                  <div className="bg-black/30 p-2 rounded text-center border border-white/5">{specs.fuel || '—'}</div>
                  <div className="bg-black/30 p-2 rounded text-center border border-white/5">{specs.condition || '—'}</div>
                </div>
                <button
                  onClick={() => onPrimaryAction(car)}
                  className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  style={{ backgroundColor: primaryColor }}
                >
                  <MessageSquare size={18} /> {cardActionLabel}
                </button>
                <button
                  onClick={() => onToggleRequestSelection(car)}
                  className="w-full mt-2 py-2 rounded-xl font-bold text-xs border border-white/10 text-white/80"
                >
                  {isSelectedForRequest(carId) ? '✅ У виборі для запиту' : '➕ Додати до мультивибору'}
                </button>
                <button
                  onClick={() => onOpenListing(car)}
                  className="w-full mt-2 py-2 rounded-xl font-bold text-white/70 border border-white/10"
                >
                  Деталі
                </button>
              </div>
            </div>
          );
        })}
        {filteredCars.length === 0 && <div className="text-center text-white/50 mt-10">Авто не знайдено. Спробуйте змінити фільтри.</div>}
      </div>
    </div>
  );
};
