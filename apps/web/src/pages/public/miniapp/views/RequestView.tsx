import React from 'react';
import { ArrowRight, CheckCircle, ChevronLeft, Search } from 'lucide-react';
import {
  BODY_TYPES,
  CITY_OPTIONS,
  FUEL_TYPES,
  MILEAGE_OPTIONS,
  OTHER_BRAND,
  OTHER_MODEL,
  VEHICLE_BRANDS
} from '../vehicleOptions';

type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type RequestType = 'BUY' | 'SELL';

export type RequestFormData = {
  brand: string;
  model: string;
  brands?: string[];
  models?: string[];
  budgetMin: string;
  budgetMax: string;
  yearMin: string;
  yearMax: string;
  city: string;
  brandSearch: string;
  modelSearch?: string;
  bodyType: string;
  brandCustom: string;
  modelCustom: string;
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
  submitError?: { message: string; openBotUrl?: string } | null;
  openBotUrl?: string;
  onOpenBot?: (url?: string) => void;
  onDismissSubmitError?: () => void;
  onNextStep: () => void;
  onBackStep: () => void;
  onHome: () => void;
};

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

const SelectedPill = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white">
    {label}
    <button type="button" onClick={onRemove} className="text-white/55 hover:text-white" aria-label={`Прибрати ${label}`}>
      x
    </button>
  </span>
);

const SearchableOptionList = ({
  inputLabel,
  placeholder,
  value,
  onChange,
  options,
  selectedValues,
  onPick,
  disabled
}: {
  inputLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  selectedValues: string[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) => {
  const listboxId = React.useId();
  const [focused, setFocused] = React.useState(false);
  const visibleOptions = options
    .filter(option => option.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 14);
  const showList = focused && !disabled;

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={18} />
        <input
          aria-label={inputLabel}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showList}
          role="combobox"
          disabled={disabled}
          className="w-full bg-[#15171a] text-white pl-10 pr-4 py-3 rounded-xl outline-none placeholder-white/30 border border-white/10 focus:border-white/35 transition-colors disabled:opacity-50"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        />
      </div>
      {showList && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/12 bg-[#111316] shadow-2xl shadow-black/50"
        >
          {visibleOptions.length ? visibleOptions.map(option => {
            const selected = selectedValues.includes(option);
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={e => e.preventDefault()}
                onClick={() => onPick(option)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                  selected ? 'bg-white/12 text-white' : 'text-white/78 hover:bg-white/8 hover:text-white'
                }`}
              >
                <span>{option}</span>
                {selected && <span className="text-xs text-white/55">обрано</span>}
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
  submitError,
  openBotUrl,
  onOpenBot,
  onDismissSubmitError,
  onNextStep,
  onBackStep,
  onHome
}: RequestViewProps) => {
  const filteredBrands = VEHICLE_BRANDS.filter(item =>
    item.brand.toLowerCase().includes(reqData.brandSearch.toLowerCase())
  );
  const selectedBrands = (reqData.brands?.length ? reqData.brands : (reqData.brand ? [reqData.brand] : []))
    .filter(Boolean);
  const selectedModels = (reqData.models?.length ? reqData.models : (reqData.model ? [reqData.model] : []))
    .filter(Boolean);
  const modelOptions = Array.from(new Set(
    selectedBrands.flatMap(brand => VEHICLE_BRANDS.find(item => item.brand === brand)?.models || [])
  ))
    .filter(Boolean)
    .concat(selectedBrands.length && !selectedBrands.includes(OTHER_BRAND) ? [OTHER_MODEL] : [])
    .sort((a, b) => a.localeCompare(b));
  const filteredModels = modelOptions.filter(model =>
    model.toLowerCase().includes(String(reqData.modelSearch || '').toLowerCase())
  );
  const displayBrand = selectedBrands.includes(OTHER_BRAND)
    ? (reqData.brandCustom || OTHER_BRAND)
    : selectedBrands.join(', ');
  const displayModel = selectedModels.includes(OTHER_MODEL)
    ? (reqData.modelCustom || OTHER_MODEL)
    : selectedModels.join(', ');
  const title = surfaceMode === 'B2B'
    ? 'Створити B2B запит'
    : (requestType === 'SELL' ? 'Продаж авто' : 'Підбір авто');
  const allowMultiVehicleChoice = surfaceMode === 'LEAD' && requestType === 'BUY' && selectedCarsCount === 0;
  const pickBrand = (brand: string) => {
    const nextBrands = allowMultiVehicleChoice
      ? (selectedBrands.includes(brand) ? selectedBrands.filter(item => item !== brand) : [...selectedBrands, brand])
      : [brand];
    setReqData({
      ...reqData,
      brand: nextBrands[0] || '',
      brands: nextBrands,
      model: '',
      models: [],
      brandSearch: '',
      modelSearch: '',
      brandCustom: brand === OTHER_BRAND ? reqData.brandCustom : '',
      modelCustom: ''
    });
  };
  const pickModel = (model: string) => {
    const nextModels = allowMultiVehicleChoice
      ? (selectedModels.includes(model) ? selectedModels.filter(item => item !== model) : [...selectedModels, model])
      : [model];
    setReqData({
      ...reqData,
      model: nextModels[0] || '',
      models: nextModels,
      modelSearch: '',
      modelCustom: model === OTHER_MODEL ? reqData.modelCustom : ''
    });
  };

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
                <SearchableOptionList
                  inputLabel="Пошук марки"
                  placeholder={allowMultiVehicleChoice ? 'Почніть вводити марку, можна обрати кілька' : 'Почніть вводити марку'}
                  value={reqData.brandSearch}
                  onChange={value => setReqData({ ...reqData, brandSearch: value })}
                  options={filteredBrands.map(item => item.brand)}
                  selectedValues={selectedBrands}
                  onPick={pickBrand}
                />
                {selectedBrands.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedBrands.map(brand => (
                      <SelectedPill
                        key={brand}
                        label={brand}
                        onRemove={() => pickBrand(brand)}
                      />
                    ))}
                  </div>
                )}
                {selectedBrands.includes(OTHER_BRAND) && (
                  <input
                    className="mt-3 w-full bg-[#15171a] text-white p-3 rounded-xl outline-none placeholder-white/30 border border-white/10 focus:border-white/30"
                    placeholder="Введіть марку"
                    value={reqData.brandCustom}
                    onChange={e => setReqData({ ...reqData, brandCustom: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Модель">
                <SearchableOptionList
                  inputLabel="Пошук моделі"
                  placeholder={selectedBrands.length ? (allowMultiVehicleChoice ? 'Почніть вводити модель, можна обрати кілька' : 'Почніть вводити модель') : 'Спочатку оберіть марку'}
                  value={reqData.modelSearch || ''}
                  onChange={value => setReqData({ ...reqData, modelSearch: value })}
                  options={filteredModels}
                  selectedValues={selectedModels}
                  onPick={pickModel}
                  disabled={!selectedBrands.length}
                />
                {selectedModels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedModels.map(model => (
                      <SelectedPill
                        key={model}
                        label={model}
                        onRemove={() => pickModel(model)}
                      />
                    ))}
                  </div>
                )}
                {selectedModels.includes(OTHER_MODEL) && (
                  <input
                    className="mt-3 w-full bg-[#15171a] text-white p-3 rounded-xl outline-none placeholder-white/30 border border-white/10 focus:border-white/30"
                    placeholder="Введіть модель"
                    value={reqData.modelCustom}
                    onChange={e => setReqData({ ...reqData, modelCustom: e.target.value })}
                  />
                )}
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
                  {BODY_TYPES.map(type => (
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
                  {FUEL_TYPES.map(type => (
                    <Chip key={type} selected={reqFuel === type} onClick={() => setReqFuel(type)}>{type}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Пробіг">
                <div className="grid grid-cols-2 gap-2">
                  {MILEAGE_OPTIONS.map(option => (
                    <Chip key={option} selected={reqMileage === option} onClick={() => setReqMileage(option)}>{option}</Chip>
                  ))}
                </div>
              </Field>
              <Field label="Місто">
                <div className="grid grid-cols-2 gap-2">
                  {CITY_OPTIONS.map(city => (
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
                  ['Авто', [displayBrand, displayModel].filter(Boolean).join(' ') || 'Не обрано'],
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
                  <div>Відкрийте Mini App з Telegram-бота, щоб надіслати запит.</div>
                  {(submitError?.openBotUrl || openBotUrl) && (
                    <button
                      type="button"
                      onClick={() => onOpenBot?.(submitError?.openBotUrl || openBotUrl)}
                      className="mt-3 w-full rounded-lg bg-yellow-100/12 px-3 py-2 font-bold text-yellow-100"
                    >
                      Відкрити бота
                    </button>
                  )}
                </div>
              )}
              {submitError && (
                <div className="rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-white">Не вдалося надіслати запит</p>
                      <p className="mt-1 text-red-100/80">{submitError.message}</p>
                    </div>
                    {onDismissSubmitError && (
                      <button
                        type="button"
                        onClick={onDismissSubmitError}
                        className="shrink-0 text-red-100/70 hover:text-white"
                        aria-label="Закрити помилку"
                      >
                        x
                      </button>
                    )}
                  </div>
                  {submitError.openBotUrl && (
                    <button
                      type="button"
                      onClick={() => onOpenBot?.(submitError.openBotUrl)}
                      className="mt-3 w-full rounded-lg border border-red-100/20 bg-white/10 px-3 py-2 font-bold text-white"
                    >
                      Відкрити чат з ботом
                    </button>
                  )}
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
