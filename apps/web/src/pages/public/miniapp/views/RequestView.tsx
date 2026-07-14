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
  canViewPrivateRequests?: boolean;
  telegramWriteUnavailableMessage?: string;
  primaryColor: string;
  surfaceMode: MiniAppSurfaceMode;
  requestType: RequestType;
  taxonomy?: VehicleTaxonomyResponse | null;
  showInlineAction: boolean;
  actionLabel: string;
  actionDisabled?: boolean;
  submitError?: { message: string; openBotUrl?: string } | null;
  contactHandoff?: { message: string; openBotUrl?: string } | null;
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

const REQUEST_FORM_VISUAL_REFRESH_ENABLED = true;

const REQUEST_STEP_META: Record<number, { label: string; title: string; description: string }> = {
  1: {
    label: 'Марка і модель',
    title: 'Яке авто шукаємо?',
    description: 'Оберіть одну або кілька марок. Моделі групуються за всіма вибраними марками.'
  },
  2: {
    label: 'Рік і бюджет',
    title: 'Бюджет і роки',
    description: 'Вкажіть бажаний діапазон. Якщо точної межі немає, поле можна залишити порожнім.'
  },
  3: {
    label: 'Параметри',
    title: 'Параметри авто',
    description: 'Додайте важливі технічні побажання, щоб менеджер швидше відсіяв зайві варіанти.'
  },
  4: {
    label: 'Підтвердження',
    title: 'Перевірте заявку',
    description: 'Контакт не вводиться вручну. Після заявки бот попросить нативний контакт Telegram.'
  }
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
  canViewPrivateRequests = true,
  telegramWriteUnavailableMessage,
  primaryColor,
  surfaceMode,
  requestType,
  taxonomy,
  showInlineAction,
  actionLabel,
  actionDisabled,
  submitError,
  contactHandoff,
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
  const brandOptions: SearchableSelectOption[] = [
    ...brandSources.map(item => ({
      id: item.id,
      label: item.label === 'Other' ? OTHER_BRAND : item.label,
      aliases: item.aliases || []
    })),
    ...(brandSources.some(item => item.label === OTHER_BRAND || item.label === 'Other') ? [] : [toSelectOption(OTHER_BRAND)])
  ];
  const selectedBrands = (reqData.brands?.length ? reqData.brands : (reqData.brand ? [reqData.brand] : []))
    .filter(Boolean);
  const selectedModels = (reqData.models?.length ? reqData.models : (reqData.model ? [reqData.model] : []))
    .filter(Boolean);
  const selectedBodyTypes = (reqData.bodyTypes?.length ? reqData.bodyTypes : (reqData.bodyType ? [reqData.bodyType] : []))
    .filter(Boolean);
  const matchesOptionValue = (option: { id: string; label: string; aliases?: string[] }, value: string) => {
    const needle = value.trim().toLowerCase();
    if (!needle) return false;
    return [option.id, option.label, ...(option.aliases || [])]
      .some(item => item.toLowerCase() === needle);
  };
  const selectedBrandSources = selectedBrands
    .filter(brand => brand !== OTHER_BRAND && brand !== 'Other')
    .map(brand => brandSources.find(item => matchesOptionValue(item, brand)))
    .filter((item): item is typeof brandSources[number] => Boolean(item));
  const modelSelectOptions: SearchableSelectOption[] = selectedBrandSources
    .flatMap(brand => (brand.models || []).map(model => ({
      id: `${brand.id}:${model.id || toSelectOption(model.label).id}`,
      label: model.label === 'Other' ? OTHER_MODEL : model.label,
      description: brand.label,
      aliases: [brand.label, ...(model.aliases || [])]
    })))
    .filter(option => Boolean(option.label))
    .sort((a, b) => `${a.description || ''} ${a.label}`.localeCompare(`${b.description || ''} ${b.label}`));
  if (selectedBrands.length && !selectedBrands.includes(OTHER_BRAND) && !selectedBrands.includes('Other')) {
    modelSelectOptions.push({ ...toSelectOption(OTHER_MODEL), description: 'Своя модель' });
  }
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
  const successContent = resolveRequestSuccessContent(surfaceMode, { canViewPrivateRequests });
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
  const inputRefs = React.useRef<Array<HTMLInputElement | HTMLTextAreaElement | null>>([]);
  const registerInput = (index: number) => (node: HTMLInputElement | HTMLTextAreaElement | null) => {
    inputRefs.current[index] = node;
  };
  const focusInput = (index: number) => {
    window.setTimeout(() => {
      const input = inputRefs.current[index];
      input?.focus();
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 40);
  };
  const keepInputVisible = (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    window.setTimeout(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  };
  const blurActiveInput = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };
  const handleInputEnter = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    nextIndex?: number
  ) => {
    if (event.key !== 'Enter') return;
    if (event.currentTarget instanceof HTMLTextAreaElement && event.shiftKey) return;
    event.preventDefault();
    if (nextIndex !== undefined) {
      focusInput(nextIndex);
      return;
    }
    blurActiveInput();
  };
  const stepMeta = REQUEST_STEP_META[reqStep] || REQUEST_STEP_META[1];
  const stepItems = [1, 2, 3, 4].map(step => ({
    step,
    ...REQUEST_STEP_META[step]
  }));
  const selectedCarsLabel = selectedCarsCount > 1
    ? `Запит по ${selectedCarsCount} авто`
    : 'Запит по конкретному авто';
  const refreshedForm = REQUEST_FORM_VISUAL_REFRESH_ENABLED;

  return (
    <div className={refreshedForm ? 'animate-fade-in relative flex h-full min-h-0 flex-col bg-[#050608] text-white' : 'animate-fade-in h-full overflow-y-auto bg-black px-5 pb-24 pt-16 flex flex-col justify-start'}>
      {reqStep === 5 ? (
        <div className={refreshedForm ? 'animate-slide-up overflow-y-auto px-5 pb-24 pt-16' : 'animate-slide-up'}>
          <div className="w-20 h-20 rounded-full bg-white/10 text-white flex items-center justify-center mx-auto mb-6 border border-white/15">
            <CheckCircle size={42} />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{successContent.title}</h2>
            <p className="text-white/56 mb-8">{successContent.message}</p>
          </div>
          {contactHandoff && (
            <div className="mb-5 rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-left text-sm text-yellow-50">
              <p className="font-bold text-white">Потрібен контакт Telegram</p>
              <p className="mt-1 text-yellow-100/80">{contactHandoff.message}</p>
              {(contactHandoff.openBotUrl || openBotUrl) && (
                <button
                  type="button"
                  onClick={() => onOpenBot?.(contactHandoff.openBotUrl || openBotUrl)}
                  className="mt-3 w-full rounded-lg bg-yellow-100/12 px-3 py-2 font-bold text-yellow-100"
                >
                  Відкрити чат з ботом
                </button>
              )}
            </div>
          )}
          <div className="space-y-3">
            {successContent.actions.map(action => {
              const Icon = successActionIcons[action.id];
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSuccessAction(action.id);
                  }}
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
          <div className={refreshedForm ? 'min-h-0 flex-1 overflow-y-auto px-5 pb-36 pt-16' : ''}>
          <div className={refreshedForm ? '-mx-5 mb-5 border-b border-white/10 bg-[#050608]/94 px-5 pb-4 backdrop-blur-xl' : 'mb-5'}>
            <div className="flex justify-between items-start gap-3 mb-3">
              <div className="min-w-0">
                <h2 className={refreshedForm ? 'text-[26px] font-black leading-tight tracking-tight text-white' : 'text-2xl font-bold text-white'}>{title}</h2>
                <p className={refreshedForm ? 'mt-1 text-xs leading-relaxed text-white/45' : 'text-xs text-white/45 mt-1'}>
                  {stepMeta.description}
                </p>
              </div>
              <span className={refreshedForm ? 'shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-xs font-black text-white/80' : 'text-sm font-bold'} style={refreshedForm ? undefined : { color: primaryColor }}>{reqStep}/4</span>
            </div>
            <div className={refreshedForm ? 'grid grid-cols-4 gap-2' : 'flex gap-2'}>
              {stepItems.map(({ step, label }) => (
                <div key={step} className={refreshedForm ? 'min-w-0' : 'flex-1'}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={step <= reqStep ? metallicStyle : { background: '#2b2d31', opacity: 0.65 }}
                  />
                  {refreshedForm && (
                    <div className={`mt-1 truncate text-[9px] font-black leading-tight ${step <= reqStep ? 'text-white/78' : 'text-white/30'}`}>
                      {label}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {refreshedForm && (
            <div className="mb-5">
              <h3 className="text-[22px] font-black leading-tight text-white">{stepMeta.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/56">{stepMeta.description}</p>
            </div>
          )}

          {!hasTelegramInit && (
            <div className="mb-4 text-xs text-yellow-200 bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 text-center">
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

          {selectedCarsCount > 0 && (
            <div className={refreshedForm ? 'mb-5 rounded-[18px] border border-white/10 bg-white/[0.055] p-3 text-xs text-white/80 shadow-[0_14px_36px_rgba(0,0,0,0.28)]' : 'mb-4 bg-[#15171a] border border-white/10 rounded-xl p-3 text-xs text-white/80 space-y-2'}>
              <div className="flex items-center justify-between gap-2">
                <span className={refreshedForm ? 'font-black text-white' : undefined}>{selectedCarsLabel}</span>
                <button onClick={onClearSelectedCars} className={refreshedForm ? 'rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-white/58' : 'text-white/60 underline'}>Очистити</button>
              </div>
              {selectedCarsPreview.length > 0 && (
                <div className={refreshedForm ? 'mt-3 grid gap-2' : 'text-white/50 truncate'}>
                  {refreshedForm
                    ? selectedCarsPreview.map((carTitle, index) => (
                      <div key={`${carTitle}_${index}`} className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-black/22 p-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-[11px] font-black text-white/74">
                          {index + 1}
                        </span>
                        <span className="min-w-0 truncate text-[11px] font-semibold text-white/62">{carTitle}</span>
                      </div>
                    ))
                    : selectedCarsPreview.join(', ')}
                </div>
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
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event)}
                    enterKeyHint="done"
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
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event)}
                    enterKeyHint="done"
                  />
                )}
              </Field>
            </div>
          )}

          {reqStep === 2 && (
            <div className="space-y-4 animate-slide-up">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Рік від">
                  <input
                    ref={registerInput(0)}
                    type="number"
                    inputMode="numeric"
                    className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10"
                    placeholder="2018"
                    value={reqData.yearMin}
                    onChange={e => setReqData({ ...reqData, yearMin: e.target.value })}
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event, 1)}
                    enterKeyHint="next"
                  />
                </Field>
                <Field label="Рік до">
                  <input
                    ref={registerInput(1)}
                    type="number"
                    inputMode="numeric"
                    className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10"
                    placeholder="2024"
                    value={reqData.yearMax}
                    onChange={e => setReqData({ ...reqData, yearMax: e.target.value })}
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event, 2)}
                    enterKeyHint="next"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Бюджет від, $">
                  <input
                    ref={registerInput(2)}
                    type="number"
                    inputMode="numeric"
                    className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10"
                    placeholder="20000"
                    value={reqData.budgetMin}
                    onChange={e => setReqData({ ...reqData, budgetMin: e.target.value })}
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event, 3)}
                    enterKeyHint="next"
                  />
                </Field>
                <Field label="Бюджет до, $">
                  <input
                    ref={registerInput(3)}
                    type="number"
                    inputMode="numeric"
                    className="w-full bg-[#15171a] text-white p-3 rounded-xl outline-none border border-white/10"
                    placeholder="60000"
                    value={reqData.budgetMax}
                    onChange={e => setReqData({ ...reqData, budgetMax: e.target.value })}
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event)}
                    enterKeyHint="done"
                  />
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
                    ref={registerInput(4)}
                    className="w-full bg-[#15171a] text-white p-4 rounded-xl outline-none border border-white/10 placeholder-white/30"
                    placeholder="Назва компанії"
                    value={reqCompany}
                    onChange={e => setReqCompany(e.target.value)}
                    onFocus={keepInputVisible}
                    onKeyDown={event => handleInputEnter(event, 5)}
                    enterKeyHint="next"
                  />
                </Field>
              )}
              <Field label="Коментар">
                <textarea
                  ref={registerInput(5)}
                  className="w-full min-h-[112px] bg-[#15171a] text-white p-4 rounded-xl outline-none border border-white/10 placeholder-white/30 resize-none"
                  placeholder="Побажання щодо комплектації, кольору, строків або умов"
                  value={reqComment}
                  onChange={e => setReqComment(e.target.value)}
                  onFocus={keepInputVisible}
                  onKeyDown={event => handleInputEnter(event)}
                  enterKeyHint="done"
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

          </div>

          {showInlineAction && (
            <div className={refreshedForm ? 'absolute bottom-0 left-0 right-0 z-30 grid grid-cols-[1fr_1.25fr] gap-3 border-t border-white/10 bg-[#050608]/94 px-5 pb-5 pt-3 backdrop-blur-xl' : 'pt-6 flex gap-3'}>
              {reqStep > 1 && (
                <button
                  onClick={onBackStep}
                  className={refreshedForm ? 'flex min-h-[52px] items-center justify-center gap-2 rounded-[16px] border border-white/10 bg-white/[0.055] px-3 text-sm font-black text-white active:scale-[0.98]' : 'flex-1 py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-transform bg-[#15171a] border border-white/10'}
                >
                  <ChevronLeft size={18} />
                  Назад
                </button>
              )}
              <button
                onClick={onNextStep}
                disabled={Boolean(actionDisabled)}
                className={refreshedForm ? `${reqStep > 1 ? '' : 'col-span-2'} flex min-h-[52px] items-center justify-center gap-2 rounded-[16px] px-4 text-sm font-black active:scale-[0.98] disabled:opacity-50 disabled:scale-100` : 'flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100'}
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
