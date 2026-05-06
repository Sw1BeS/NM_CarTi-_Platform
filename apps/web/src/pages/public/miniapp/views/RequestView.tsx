import React from 'react';
import { ArrowRight, CheckCircle, ChevronLeft, Search } from 'lucide-react';

type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type RequestType = 'BUY' | 'SELL';

export type RequestFormData = {
  brand: string;
  model: string;
  budgetMin: string;
  budgetMax: string;
  yearMin: string;
  yearMax: string;
  city: string;
  brandSearch: string;
  bodyType: string;
};

type RequestViewProps = {
  reqStep: number;
  reqData: RequestFormData;
  setReqData: (next: RequestFormData) => void;
  reqMileage: string;
  setReqMileage: (value: string) => void;
  reqFuel: string;
  setReqFuel: (value: string) => void;
  reqCompany: string;
  setReqCompany: (value: string) => void;
  reqComment: string;
  setReqComment: (value: string) => void;
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
};

const carCatalog = [
  { brand: 'BMW', models: ['X3', 'X5', 'X6', '3 Series', '5 Series', '7 Series', 'iX'] },
  { brand: 'Mercedes-Benz', models: ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'GLS', 'EQE'] },
  { brand: 'Audi', models: ['A4', 'A6', 'A8', 'Q5', 'Q7', 'Q8', 'e-tron'] },
  { brand: 'Toyota', models: ['Camry', 'RAV4', 'Land Cruiser', 'Highlander', 'Corolla', 'Prius'] },
  { brand: 'Lexus', models: ['RX', 'NX', 'LX', 'GX', 'ES', 'LS'] },
  { brand: 'Porsche', models: ['Cayenne', 'Macan', 'Panamera', '911', 'Taycan'] },
  { brand: 'Volkswagen', models: ['Touareg', 'Tiguan', 'Passat', 'Golf', 'ID.4'] },
  { brand: 'Tesla', models: ['Model 3', 'Model Y', 'Model S', 'Model X'] },
  { brand: 'Land Rover', models: ['Range Rover', 'Range Rover Sport', 'Defender', 'Discovery'] },
  { brand: 'Volvo', models: ['XC60', 'XC90', 'S90', 'V60'] },
  { brand: 'Hyundai', models: ['Tucson', 'Santa Fe', 'Palisade', 'IONIQ 5'] },
  { brand: 'Kia', models: ['Sportage', 'Sorento', 'Telluride', 'EV6'] },
  { brand: 'Інше', models: ['Порадьте модель'] }
];

const bodyTypes = ['SUV', 'Седан', 'Універсал', 'Купе', 'Хетчбек', 'Пікап'];
const fuelTypes = ['Бензин', 'Дизель', 'Гібрид', 'Електро', 'Газ'];
const mileageOptions = ['до 50 000 км', 'до 100 000 км', 'до 150 000 км', 'не важливо'];
const cities = ['Київ', 'Львів', 'Одеса', 'Дніпро', 'Харків', 'Вся Україна'];

const metallicStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #f6f7f9 0%, #d9dde2 34%, #aab0b8 68%, #f2f4f7 100%)',
  color: '#101216',
  boxShadow: '0 10px 24px rgba(210, 216, 224, 0.18), inset 0 1px 0 rgba(255,255,255,0.85)'
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[10px] font-bold text-white/50 uppercase mb-2 block">{label}</label>
    {children}
  </div>
);

const Chip = ({
  selected,
  children,
  onClick
}: {
  selected: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`min-h-[42px] px-3 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95 ${
      selected ? 'border-white/55 text-black' : 'border-white/10 bg-[#181a1d] text-white/76'
    }`}
    style={selected ? metallicStyle : undefined}
  >
    {children}
  </button>
);

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
  reqComment,
  setReqComment,
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
  onHome
}: RequestViewProps) => {
  const filteredBrands = carCatalog.filter(item =>
    item.brand.toLowerCase().includes(reqData.brandSearch.toLowerCase())
  );
  const selectedBrand = carCatalog.find(item => item.brand === reqData.brand);
  const title = surfaceMode === 'B2B'
    ? 'Створити B2B запит'
    : (requestType === 'SELL' ? 'Продаж авто' : 'Підбір авто');

  return (
    <div className="animate-fade-in pb-24 p-5 h-full overflow-y-auto flex flex-col justify-start bg-black">
      {reqStep === 5 ? (
        <div className="text-center animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-white/10 text-white flex items-center justify-center mx-auto mb-6 border border-white/15">
            <CheckCircle size={42} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Запит відправлено</h2>
          <p className="text-white/56 mb-8">Mini App можна закрити. Бот попросить контакт у Telegram-чаті.</p>
          <button onClick={onHome} className="w-full py-4 rounded-xl font-bold text-lg" style={metallicStyle}>
            На головну
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <div className="flex justify-between items-start gap-3 mb-3">
              <div>
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <p className="text-xs text-white/45 mt-1">
                  Контакт не вводиться вручну. Після заявки бот попросить нативний контакт Telegram.
                </p>
              </div>
              <span className="text-sm font-bold" style={{ color: primaryColor }}>{reqStep}/4</span>
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(step => (
                <div
                  key={step}
                  className="h-1.5 flex-1 rounded-full transition-all duration-300"
                  style={step <= reqStep ? metallicStyle : { background: '#2b2d31', opacity: 0.65 }}
                />
              ))}
            </div>
          </div>

          {selectedCarsCount > 0 && (
            <div className="mb-4 bg-[#15171a] border border-white/10 rounded-xl p-3 text-xs text-white/80 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span>{selectedCarsCount > 1 ? `Запит по ${selectedCarsCount} авто` : 'Запит по конкретному авто'}</span>
                <button onClick={onClearSelectedCars} className="text-white/60 underline">Очистити</button>
              </div>
              {selectedCarsPreview.length > 0 && (
                <div className="text-white/50 truncate">{selectedCarsPreview.join(', ')}</div>
              )}
            </div>
          )}

          {reqStep === 1 && (
            <div className="space-y-4 animate-slide-up">
              <Field label="Марка">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={18} />
                  <input
                    className="w-full bg-[#15171a] text-white pl-10 pr-4 py-3 rounded-xl outline-none placeholder-white/30 border border-white/10 focus:border-white/30 transition-colors"
                    placeholder="Пошук марки"
                    value={reqData.brandSearch}
                    onChange={e => setReqData({ ...reqData, brandSearch: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {filteredBrands.map(item => (
                    <Chip
                      key={item.brand}
                      selected={reqData.brand === item.brand}
                      onClick={() => setReqData({ ...reqData, brand: item.brand, model: '', brandSearch: '' })}
                    >
                      {item.brand}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label="Модель">
                <div className="grid grid-cols-2 gap-2">
                  {(selectedBrand?.models || ['Спочатку оберіть марку']).map(model => (
                    <Chip
                      key={model}
                      selected={reqData.model === model}
                      onClick={() => setReqData({ ...reqData, model })}
                    >
                      {model}
                    </Chip>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {reqStep === 2 && (
            <div className="space-y-4 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Рік від">
                  <input className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10" placeholder="2018" value={reqData.yearMin} onChange={e => setReqData({ ...reqData, yearMin: e.target.value })} />
                </Field>
                <Field label="Рік до">
                  <input className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10" placeholder="2024" value={reqData.yearMax} onChange={e => setReqData({ ...reqData, yearMax: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Бюджет від, $">
                  <input className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10" placeholder="20000" value={reqData.budgetMin} onChange={e => setReqData({ ...reqData, budgetMin: e.target.value })} />
                </Field>
                <Field label="Бюджет до, $">
                  <input className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10" placeholder="60000" value={reqData.budgetMax} onChange={e => setReqData({ ...reqData, budgetMax: e.target.value })} />
                </Field>
              </div>
              <Field label="Тип кузова">
                <div className="grid grid-cols-2 gap-2">
                  {bodyTypes.map(type => (
                    <Chip key={type} selected={reqData.bodyType === type} onClick={() => setReqData({ ...reqData, bodyType: type })}>{type}</Chip>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {reqStep === 3 && (
            <div className="space-y-4 animate-slide-up">
              <Field label="Пальне / двигун">
                <div className="grid grid-cols-2 gap-2">
                  {fuelTypes.map(type => (
                    <Chip key={type} selected={reqFuel === type} onClick={() => setReqFuel(type)}>{type}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Пробіг">
                <div className="grid grid-cols-2 gap-2">
                  {mileageOptions.map(option => (
                    <Chip key={option} selected={reqMileage === option} onClick={() => setReqMileage(option)}>{option}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Місто">
                <div className="grid grid-cols-2 gap-2">
                  {cities.map(city => (
                    <Chip key={city} selected={reqData.city === city} onClick={() => setReqData({ ...reqData, city })}>{city}</Chip>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {reqStep === 4 && (
            <div className="space-y-4 animate-slide-up">
              {surfaceMode === 'B2B' && (
                <Field label="Компанія">
                  <input
                    className="w-full bg-[#15171a] text-white p-4 rounded-xl outline-none border border-white/10 placeholder-white/30"
                    placeholder="Назва компанії"
                    value={reqCompany}
                    onChange={e => setReqCompany(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Коментар">
                <textarea
                  className="w-full min-h-[112px] bg-[#15171a] text-white p-4 rounded-xl outline-none border border-white/10 placeholder-white/30 resize-none"
                  placeholder="Побажання щодо комплектації, кольору, строків або умов"
                  value={reqComment}
                  onChange={e => setReqComment(e.target.value)}
                />
              </Field>

              <div className="bg-[#15171a] p-5 rounded-xl border border-white/10 text-white/80 text-sm space-y-3">
                <p className="font-bold text-white text-lg border-b border-white/10 pb-2">Підсумок</p>
                {[
                  ['Авто', [reqData.brand, reqData.model].filter(Boolean).join(' ') || 'Не обрано'],
                  ['Роки', `${reqData.yearMin || 'будь-який'} - ${reqData.yearMax || 'будь-який'}`],
                  ['Бюджет', reqData.budgetMin || reqData.budgetMax ? `$${reqData.budgetMin || '0'} - $${reqData.budgetMax || '∞'}` : 'Не обрано'],
                  ['Кузов', reqData.bodyType || 'Не обрано'],
                  ['Пальне', reqFuel || 'Не обрано'],
                  ['Пробіг', reqMileage || 'Не обрано'],
                  ['Локація', reqData.city || 'Не обрано']
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center gap-3">
                    <span className="text-white/52">{label}:</span>
                    <span className="font-semibold text-white text-right">{value}</span>
                  </div>
                ))}
              </div>
              {!hasTelegramInit && (
                <div className="text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 text-center">
                  Відкрийте Mini App з Telegram-бота, щоб надіслати запит.
                </div>
              )}
            </div>
          )}

          {showInlineAction && (
            <div className="pt-6 flex gap-3">
              {reqStep > 1 && (
                <button
                  onClick={onBackStep}
                  className="flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform bg-[#15171a] border border-white/10"
                >
                  <ChevronLeft size={18} />
                  Назад
                </button>
              )}
              <button
                onClick={onNextStep}
                disabled={Boolean(actionDisabled)}
                className="flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100"
                style={metallicStyle}
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
