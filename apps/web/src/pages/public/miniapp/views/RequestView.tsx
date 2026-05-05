import React from 'react';
import { ArrowRight, CheckCircle, Search, ChevronLeft } from 'lucide-react';

type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type RequestType = 'BUY' | 'SELL';

type RequestViewProps = {
  reqStep: number;
  reqData: {
    brand: string;
    budgetMin: string;
    budgetMax: string;
    yearMin: string;
    yearMax: string;
    city: string;
    brandSearch: string;
  };
  setReqData: (next: {
    brand: string;
    budgetMin: string;
    budgetMax: string;
    yearMin: string;
    yearMax: string;
    city: string;
    brandSearch: string;
  }) => void;
  reqMileage: string;
  setReqMileage: (value: string) => void;
  reqFuel: string;
  setReqFuel: (value: string) => void;
  reqCompany: string;
  setReqCompany: (value: string) => void;
  reqPhone: string;
  setReqPhone: (value: string) => void;
  reqComment: string;
  setReqComment: (value: string) => void;
  manualContactMode: boolean;
  selectedCarsCount: number;
  selectedCarsPreview: string[];
  onClearSelectedCars: () => void;
  hasTelegramInit: boolean;
  primaryColor: string;
  surfaceMode: MiniAppSurfaceMode;
  requestType: RequestType;
  showInlineAction: boolean;
  actionLabel: string;
  actionDisabled?: boolean;
  onNextStep: () => void;
  onBackStep: () => void;
  onHome: () => void;
  tgUser?: any;
};

export const RequestView = ({
  reqStep,
  reqData,
  setReqData,
  reqMileage,
  setReqMileage,
  reqFuel,
  setReqFuel,
  reqCompany,
  setReqCompany,
  reqPhone,
  setReqPhone,
  reqComment,
  setReqComment,
  manualContactMode,
  selectedCarsCount,
  selectedCarsPreview,
  onClearSelectedCars,
  hasTelegramInit,
  primaryColor,
  surfaceMode,
  requestType,
  showInlineAction,
  actionLabel,
  actionDisabled,
  onNextStep,
  onBackStep,
  onHome,
  tgUser
}: RequestViewProps) => {
  // Popular brands data
  const popularBrands = [
    { id: 'toyota', name: 'Toyota', name_uk: 'Тойота' },
    { id: 'bmw', name: 'BMW', name_uk: 'BMW' },
    { id: 'mercedes', name: 'Mercedes', name_uk: 'Мерседес' },
    { id: 'audi', name: 'Audi', name_uk: 'Ауді' },
    { id: 'volkswagen', name: 'Volkswagen', name_uk: 'Фольксваген' },
    { id: 'ford', name: 'Ford', name_uk: 'Форд' },
    { id: 'honda', name: 'Honda', name_uk: 'Хонда' },
    { id: 'nissan', name: 'Nissan', name_uk: 'Ніссан' },
    { id: 'hyundai', name: 'Hyundai', name_uk: 'Хюндай' },
    { id: 'kia', name: 'Kia', name_uk: 'Кіа' },
    { id: 'other', name: 'Other', name_uk: 'Інше' }
  ];

  // Year ranges
  const yearRanges = [
    { id: '2022+', label: '2022+', label_uk: '2022+' },
    { id: '2020+', label: '2020+', label_uk: '2020+' },
    { id: '2018+', label: '2018+', label_uk: '2018+' },
    { id: '2015+', label: '2015+', label_uk: '2015+' },
    { id: '2010+', label: '2010+', label_uk: '2010+' },
    { id: 'any', label: 'Any', label_uk: 'Будь-який' }
  ];

  // Budget ranges
  const budgetRanges = [
    { id: '5k-10k', min: 5000, max: 10000, label: '$5k - $10k', label_uk: '$5k - $10k' },
    { id: '10k-15k', min: 10000, max: 15000, label: '$10k - $15k', label_uk: '$10k - $15k' },
    { id: '15k-20k', min: 15000, max: 20000, label: '$15k - $20k', label_uk: '$15k - $20k' },
    { id: '20k-30k', min: 20000, max: 30000, label: '$20k - $30k', label_uk: '$20k - $30k' },
    { id: '30k-50k', min: 30000, max: 50000, label: '$30k - $50k', label_uk: '$30k - $50k' },
    { id: '50k+', min: 50000, max: 999999, label: '$50k+', label_uk: '$50k+' }
  ];

  // Popular cities
  const cities = [
    { id: 'kiev', name: 'Київ', name_en: 'Kyiv' },
    { id: 'kharkiv', name: 'Харків', name_en: 'Kharkiv' },
    { id: 'odesa', name: 'Одеса', name_en: 'Odesa' },
    { id: 'dnipro', name: 'Дніпро', name_en: 'Dnipro' },
    { id: 'lviv', name: 'Львів', name_en: 'Lviv' },
    { id: 'all', name: 'Вся Україна', name_en: 'All Ukraine' }
  ];

  const getLabel = (item: any) => {
    const lang = tgUser?.language_code || 'en';
    if (lang === 'uk' && item.name_uk) return item.name_uk;
    if (lang === 'uk' && item.label_uk) return item.label_uk;
    return item.label || item.name;
  };

  const filteredBrands = popularBrands.filter(brand =>
    brand.name.toLowerCase().includes(reqData.brandSearch.toLowerCase()) ||
    brand.name_uk.toLowerCase().includes(reqData.brandSearch.toLowerCase())
  );

  return (
    <div className="animate-fade-in pb-24 p-6 h-full overflow-y-auto flex flex-col justify-center bg-black">
      {reqStep === 5 ? (
        <div className="text-center animate-slide-up">
          <div className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
            <CheckCircle size={48} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Запит відправлено!</h2>
          <p className="text-white/50 mb-8">Ми отримали ваш запит. Менеджер перевірить ринок і скоро зв'яжеться з вами.</p>
          <button onClick={onHome} className="btn-primary w-full py-4 rounded-xl font-bold text-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
            На головну
          </button>
        </div>
      ) : (
        <>
          {/* Progress Indicator */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-2xl font-bold text-white">
                {surfaceMode === 'B2B' ? 'Створити B2B запит' : (requestType === 'SELL' ? 'Продати авто' : 'Підібрати авто за 1 хвилину')}
              </h2>
              <span className="text-sm font-bold" style={{ color: primaryColor }}>{reqStep}/4</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(step => (
                <div
                  key={step}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    step <= reqStep ? 'opacity-100' : 'opacity-30'
                  }`}
                  style={{ backgroundColor: step <= reqStep ? primaryColor : '#333' }}
                />
              ))}
            </div>
          </div>

          {/* Step 1: Brand Selection */}
          {reqStep === 1 && (
            <div className="space-y-4 animate-slide-up">
              {selectedCarsCount > 0 && (
                <div className="bg-[#1c1c1e] border border-white/10 rounded-xl p-3 text-xs text-white/80">
                  <div className="flex items-center justify-between gap-2">
                    <span>Мультивибір: {selectedCarsCount} авто</span>
                    <button onClick={onClearSelectedCars} className="text-white/60 underline">Очистити</button>
                  </div>
                  {selectedCarsPreview.length > 0 && (
                    <div className="text-white/50 mt-1 truncate">{selectedCarsPreview.join(', ')}</div>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-white/70 uppercase mb-3 block">Оберіть марку</label>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18}/>
                  <input
                    className="w-full bg-[#1c1c1e] text-white pl-10 pr-4 py-3 rounded-xl outline-none placeholder-gray-600 border border-white/5 focus:border-yellow-500/50 transition-colors"
                    placeholder="Пошук марки..."
                    value={reqData.brandSearch}
                    onChange={e => setReqData({...reqData, brandSearch: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {filteredBrands.map(brand => (
                    <button
                      key={brand.id}
                      onClick={() => setReqData({...reqData, brand: brand.name, brandSearch: ''})}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 active:scale-95 ${
                        reqData.brand === brand.name
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-white/10 bg-[#1c1c1e] hover:border-white/20'
                      }`}
                    >
                      <div className="text-sm font-bold text-white">{getLabel(brand)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Year Selection */}
          {reqStep === 2 && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <label className="text-xs font-bold text-white/70 uppercase mb-3 block">Оберіть рік</label>
                <div className="grid grid-cols-2 gap-3">
                  {yearRanges.map(range => (
                    <button
                      key={range.id}
                      onClick={() => {
                        const year = parseInt(range.label.replace('+', ''));
                        setReqData({
                          ...reqData,
                          yearMin: range.id === 'any' ? '' : year.toString(),
                          yearMax: ''
                        });
                      }}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 active:scale-95 ${
                        reqData.yearMin === range.label.replace('+', '') || (range.id === 'any' && reqData.yearMin === '')
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-white/10 bg-[#1c1c1e] hover:border-white/20'
                      }`}
                    >
                      <div className="text-sm font-bold text-white">{getLabel(range)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Budget Selection */}
          {reqStep === 3 && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <label className="text-xs font-bold text-white/70 uppercase mb-3 block">Оберіть бюджет</label>
                <div className="grid grid-cols-2 gap-3">
                  {budgetRanges.map(range => (
                    <button
                      key={range.id}
                      onClick={() => setReqData({
                        ...reqData,
                        budgetMin: range.min.toString(),
                        budgetMax: range.max.toString()
                      })}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 active:scale-95 ${
                        reqData.budgetMin === range.min.toString() && reqData.budgetMax === range.max.toString()
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-white/10 bg-[#1c1c1e] hover:border-white/20'
                      }`}
                    >
                      <div className="text-sm font-bold text-white">{getLabel(range)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Location & Summary */}
          {reqStep === 4 && (
            <div className="space-y-4 animate-slide-up">
              <div>
                <label className="text-xs font-bold text-white/70 uppercase mb-3 block">Оберіть локацію</label>
                <div className="grid grid-cols-2 gap-3">
                  {cities.map(city => (
                    <button
                      key={city.id}
                      onClick={() => setReqData({...reqData, city: city.name})}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 active:scale-95 ${
                        reqData.city === city.name
                          ? 'border-yellow-500 bg-yellow-500/10'
                          : 'border-white/10 bg-[#1c1c1e] hover:border-white/20'
                      }`}
                    >
                      <div className="text-sm font-bold text-white">{city.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-[#1c1c1e] p-5 rounded-xl border border-white/10 text-white/80 text-sm space-y-3 mt-6">
                <p className="font-bold text-white mb-4 text-lg border-b border-white/10 pb-2">Підсумок</p>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Марка:</span>
                  <span className="font-bold text-white">{reqData.brand || 'Не обрано'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Рік:</span>
                  <span className="font-bold text-white">{reqData.yearMin ? reqData.yearMin + '+' : 'Будь-який'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Бюджет:</span>
                  <span className="font-bold text-white" style={{color: primaryColor}}>
                    {reqData.budgetMin && reqData.budgetMax
                      ? `$${parseInt(reqData.budgetMin).toLocaleString()} - $${parseInt(reqData.budgetMax).toLocaleString()}`
                      : 'Не обрано'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-white/60">Локація:</span>
                  <span className="font-bold text-white">{reqData.city || 'Не обрано'}</span>
                </div>
                {selectedCarsCount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Обрані авто:</span>
                    <span className="font-bold text-white">{selectedCarsCount}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-white/50 text-center px-4">
                Після надсилання менеджер зв'яжеться з вами у цьому чаті.
              </p>
              {!hasTelegramInit && (
                <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                  Відкрийте цю сторінку з Telegram, щоб надіслати запит.
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          {showInlineAction && (
            <div className="pt-6 flex gap-3">
              {reqStep > 1 && (
                <button
                  onClick={onBackStep}
                  className="flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform bg-[#1c1c1e] border border-white/10"
                >
                  <ChevronLeft size={18} />
                  Назад
                </button>
              )}
              <button
                onClick={onNextStep}
                disabled={Boolean(actionDisabled)}
                className="flex-1 py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {actionLabel} <ArrowRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
