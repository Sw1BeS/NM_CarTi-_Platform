import React from 'react';
import { ArrowRight, CheckCircle, ChevronLeft, ClipboardList, Home, LayoutGrid, MessageCircle } from 'lucide-react';
import {
  BODY_TYPES,
  CITY_OPTIONS,
  FUEL_TYPES,
  MILEAGE_OPTIONS,
  OTHER_BRAND,
  OTHER_MODEL,
  VEHICLE_BRANDS
} from '../vehicleOptions';
import { MultiSelectCombobox } from '../components/MultiSelectCombobox';
import { SearchableSelect, type SearchableSelectOption } from '../components/SearchableSelect';
import { resolveRequestSuccessContent, type RequestSuccessActionId } from '../requestSuccessActions';
import type { VehicleTaxonomyResponse } from '../../../../services/miniappApi';

type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type RequestType = 'BUY' | 'SELL';

export type RequestFormData = {
  brand: string;
  model: string;
  brands?: string[];
  models?: string[];
  bodyTypes?: string[];
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
  telegramWriteUnavailableMessage?: string;
  primaryColor: string;
  surfaceMode: MiniAppSurfaceMode;
  requestType: RequestType;
  taxonomy?: VehicleTaxonomyResponse | null;
  showInlineAction: boolean;
  actionLabel: string;
  actionDisabled?: boolean;
  submitError?: { message: string; openBotUrl?: string } | null;
  openBotUrl?: string;
  onOpenBot?: (url?: string) => void;
  onDismissSubmitError?: () => void;
  onNextStep: () => void;
  onBackStep: () => void;
  onViewRequests?: () => void;
  onCatalog?: () => void;
  onContactManager?: () => void;
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

const toSelectOption = (label: string, aliases?: string[]): SearchableSelectOption => ({
  id: label.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '-').replace(/^-+|-+$/g, '') || label,
  label,
  aliases
});

const successActionIcons: Record<RequestSuccessActionId, React.ComponentType<{ size?: number }>> = {
  MY_REQUESTS: ClipboardList,
  CATALOG: LayoutGrid,
  MANAGER: MessageCircle,
  B2B_ACTIVITY: ClipboardList,
  B2B_REQUESTS: LayoutGrid,
  B2B_SUPPORT: MessageCircle,
  HOME: Home
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
  telegramWriteUnavailableMessage,
  primaryColor,
  surfaceMode,
  requestType,
  taxonomy,
  showInlineAction,
  actionLabel,
  actionDisabled,
  submitError,
  openBotUrl,
  onOpenBot,
  onDismissSubmitError,
  onNextStep,
  onBackStep,
  onViewRequests,
  onCatalog,
  onContactManager,
  onHome
}: RequestViewProps) => {
  const brandSources = (taxonomy?.brands?.length ? taxonomy.brands : VEHICLE_BRANDS.map(item => ({
    id: item.brand.toLowerCase(),
    label: item.brand,
    aliases: [],
    models: item.models.map(model => ({ id: model.toLowerCase(), label: model, aliases: [], brandId: item.brand.toLowerCase() }))
  })));
  const brandOptions = brandSources
    .map(item => ({ id: item.id, label: item.label === 'Other' ? OTHER_BRAND : item.label, aliases: item.aliases }))
    .concat(brandSources.some(item => item.label === OTHER_BRAND || item.label === 'Other') ? [] : [toSelectOption(OTHER_BRAND)]);
  const selectedBrands = (reqData.brands?.length ? reqData.brands : (reqData.brand ? [reqData.brand] : []))
    .filter(Boolean);
  const selectedModels = (reqData.models?.length ? reqData.models : (reqData.model ? [reqData.model] : []))
    .filter(Boolean);
  const selectedBodyTypes = (reqData.bodyTypes?.length ? reqData.bodyTypes : (reqData.bodyType ? [reqData.bodyType] : []))
    .filter(Boolean);
  const modelOptions = Array.from(new Set(
    selectedBrands.flatMap(brand => {
      if (brand === OTHER_BRAND || brand === 'Other') return [OTHER_MODEL];
      const source = brandSources.find(item => item.label === brand || item.id === brand);
      return source?.models?.map(model => model.label === 'Other' ? OTHER_MODEL : model.label) || [];
    })
  ))
    .filter(Boolean)
    .concat(selectedBrands.length && !selectedBrands.includes(OTHER_BRAND) && !selectedBrands.includes('Other') ? [OTHER_MODEL] : [])
    .sort((a, b) => a.localeCompare(b));
  const modelSelectOptions = modelOptions.map(label => {
    const sourceModel = brandSources
      .flatMap(brand => brand.models || [])
      .find(model => model.label === label || (model.label === 'Other' && label === OTHER_MODEL));
    return { id: sourceModel?.id || toSelectOption(label).id, label, aliases: sourceModel?.aliases };
  });
  const bodyTypeOptions = (taxonomy?.bodyTypes?.length ? taxonomy.bodyTypes : BODY_TYPES.map(type => toSelectOption(type)));
  const fuelOptions = (taxonomy?.fuels?.length ? taxonomy.fuels : FUEL_TYPES.map(type => toSelectOption(type)));
  const cityOptions = (taxonomy?.cities?.length ? taxonomy.cities : CITY_OPTIONS.map(city => toSelectOption(city)));
  const displayBrand = selectedBrands.includes(OTHER_BRAND)
    ? (reqData.brandCustom || OTHER_BRAND)
    : selectedBrands.join(', ');
  const displayModel = selectedModels.includes(OTHER_MODEL)
    ? (reqData.modelCustom || OTHER_MODEL)
    : selectedModels.join(', ');
  const title = surfaceMode === 'B2B'
    ? 'Створити B2B запит'
    : (requestType === 'SELL' ? 'Продаж авто' : 'Підбір авто');
  const successContent = resolveRequestSuccessContent(surfaceMode);
  const handleSuccessAction = (actionId: RequestSuccessActionId) => {
    if (actionId === 'MY_REQUESTS' || actionId === 'B2B_ACTIVITY') {
      onViewRequests?.();
      return;
    }
    if (actionId === 'CATALOG' || actionId === 'B2B_REQUESTS') {
      onCatalog?.();
      return;
    }
    if (actionId === 'MANAGER' || actionId === 'B2B_SUPPORT') {
      onContactManager?.();
      return;
    }
    onHome();
  };
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
  const pickBodyType = (bodyType: string) => {
    const nextBodyTypes = allowMultiVehicleChoice
      ? (selectedBodyTypes.includes(bodyType) ? selectedBodyTypes.filter(item => item !== bodyType) : [...selectedBodyTypes, bodyType])
      : [bodyType];
    setReqData({
      ...reqData,
      bodyType: nextBodyTypes[0] || '',
      bodyTypes: nextBodyTypes
    });
  };

  return (
    <div className="animate-fade-in h-full overflow-y-auto bg-black px-5 pb-24 pt-16 flex flex-col justify-start">
      {reqStep === 5 ? (
        <div className="animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-white/10 text-white flex items-center justify-center mx-auto mb-6 border border-white/15">
            <CheckCircle size={42} />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{successContent.title}</h2>
            <p className="text-white/56 mb-8">{successContent.message}</p>
          </div>
          <div className="space-y-3">
            {successContent.actions.map(action => {
              const Icon = successActionIcons[action.id];
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleSuccessAction(action.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-transform active:scale-[0.99] ${
                    action.primary
                      ? 'border-white/20 text-black'
                      : 'border-white/10 bg-[#15171a] text-white'
                  }`}
                  style={action.primary ? metallicStyle : undefined}
                >
                  <span className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      action.primary ? 'bg-black/10 text-black' : 'bg-white/8 text-white'
                    }`}>
                      <Icon size={20} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{action.label}</span>
                      <span className={`mt-1 block text-xs ${action.primary ? 'text-black/62' : 'text-white/45'}`}>
                        {action.description}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
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
                {allowMultiVehicleChoice ? (
                  <MultiSelectCombobox
                    label="Пошук марки"
                    placeholder="Почніть вводити марку, можна обрати кілька"
                    values={selectedBrands}
                    options={brandOptions}
                    onChange={values => setReqData({
                      ...reqData,
                      brand: values[0] || '',
                      brands: values,
                      model: '',
                      models: [],
                      brandSearch: '',
                      modelSearch: '',
                      brandCustom: values.includes(OTHER_BRAND) ? reqData.brandCustom : '',
                      modelCustom: ''
                    })}
                  />
                ) : (
                  <SearchableSelect
                    label="Пошук марки"
                    placeholder="Почніть вводити марку"
                    value={selectedBrands[0] || ''}
                    options={brandOptions}
                    onChange={pickBrand}
                  />
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
                {allowMultiVehicleChoice ? (
                  <MultiSelectCombobox
                    label="Пошук моделі"
                    placeholder={selectedBrands.length ? 'Почніть вводити модель, можна обрати кілька' : 'Спочатку оберіть марку'}
                    values={selectedModels}
                    options={modelSelectOptions}
                    onChange={values => setReqData({
                      ...reqData,
                      model: values[0] || '',
                      models: values,
                      modelSearch: '',
                      modelCustom: values.includes(OTHER_MODEL) ? reqData.modelCustom : ''
                    })}
                    disabled={!selectedBrands.length}
                  />
                ) : (
                  <SearchableSelect
                    label="Пошук моделі"
                    placeholder={selectedBrands.length ? 'Почніть вводити модель' : 'Спочатку оберіть марку'}
                    value={selectedModels[0] || ''}
                    options={modelSelectOptions}
                    onChange={pickModel}
                    disabled={!selectedBrands.length}
                  />
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
                  {bodyTypeOptions.map(type => (
                    <Chip key={type.id} selected={selectedBodyTypes.includes(type.label)} onClick={() => pickBodyType(type.label)}>{type.label}</Chip>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {reqStep === 3 && (
            <div className="space-y-4 animate-slide-up">
              <Field label="Пальне / двигун">
                <div className="grid grid-cols-2 gap-2">
                  {fuelOptions.map(type => (
                    <Chip key={type.id} selected={reqFuel === type.label} onClick={() => setReqFuel(type.label)}>{type.label}</Chip>
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
                  {cityOptions.map(city => (
                    <Chip key={city.id} selected={reqData.city === city.label} onClick={() => setReqData({ ...reqData, city: city.label })}>{city.label}</Chip>
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
                  ['Кузов', selectedBodyTypes.join(', ') || 'Не обрано'],
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
                  <div>{telegramWriteUnavailableMessage || 'Відкрийте Mini App з Telegram-бота, щоб надіслати запит.'}</div>
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
