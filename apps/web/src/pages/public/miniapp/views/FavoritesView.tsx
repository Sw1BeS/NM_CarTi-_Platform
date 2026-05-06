import React from 'react';
import { Star } from 'lucide-react';
import { CarListing } from '../../../../types';
import { MiniAppImage } from '../components/MiniAppImage';

type FavoritesViewProps = {
  cars: CarListing[];
  favorites: string[];
  favoriteItems: CarListing[];
  primaryColor: string;
  getCarId: (car?: CarListing | null) => string;
  getCarImages: (car: CarListing) => string[];
  toNumberSafe: (value: unknown) => number;
  formatMileage: (value: unknown) => string;
  formatPrice: (price?: { amount?: number; currency?: string }) => string;
  isSelectedForRequest: (carId: string) => boolean;
  onToggleFavorite: (car: CarListing) => void;
  onToggleRequestSelection: (car: CarListing) => void;
  onOpenListing: (car: CarListing) => void;
};

export const FavoritesView = ({
  cars,
  favorites,
  favoriteItems,
  primaryColor,
  getCarId,
  getCarImages,
  toNumberSafe,
  formatMileage,
  formatPrice,
  isSelectedForRequest,
  onToggleFavorite,
  onToggleRequestSelection,
  onOpenListing
}: FavoritesViewProps) => {
  const favoriteCars = favoriteItems.length
    ? favoriteItems
    : cars.filter(car => favorites.includes(getCarId(car)));

  return (
    <div className="animate-fade-in pb-24 h-full flex flex-col bg-black">
      <div className="p-4 sticky top-0 bg-[#000000]/90 backdrop-blur-md z-20 border-b border-white/10">
        <h2 className="text-xl font-bold text-white">Обране</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {favoriteCars.map(car => {
          const images = getCarImages(car);
          const cover = images[0];
          const carId = getCarId(car);

          return (
            <div key={carId || `fav_${car.title}_${car.year}`} className={`bg-[#1c1c1e] rounded-2xl overflow-hidden border flex flex-col shadow-lg ${isSelectedForRequest(carId) ? 'border-yellow-400/60' : 'border-white/5'}`}>
              <div className="h-40 bg-gray-800 relative cursor-pointer" onClick={() => onOpenListing(car)}>
                <MiniAppImage src={cover} sources={images} alt={car.presentation?.title || car.title || 'Авто'} />
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(car); }}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <Star size={16} className="text-yellow-400 fill-yellow-400" />
                </button>
              </div>
              <div className="p-4">
                <h3 className="text-base font-bold text-white truncate">{car.presentation?.title || car.title}</h3>
                <div className="text-sm text-white/60 mt-1">{car.presentation?.subtitle || `${toNumberSafe(car.year) || '—'} • ${formatMileage(car.mileage)}`}</div>
                <div className="mt-2 font-bold text-[#E4E7EC]">
                  {car.presentation?.priceLabel || formatPrice(car.price)}
                </div>
                <button
                  onClick={() => onToggleRequestSelection(car)}
                  className="w-full mt-3 py-2 rounded-xl font-bold text-xs border border-white/10 text-white/80"
                >
                  {isSelectedForRequest(carId) ? '✅ У виборі для запиту' : '➕ Додати до мультивибору'}
                </button>
              </div>
            </div>
          );
        })}
        {favoriteCars.length === 0 && (
          <div className="text-center text-white/50 mt-12">
            Поки немає обраних авто. Натисніть серце на картці.
          </div>
        )}
      </div>
    </div>
  );
};
