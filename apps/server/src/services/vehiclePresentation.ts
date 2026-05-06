import { isPublicMediaUrl, normalizeMediaUrl } from './mediaUrl.service.js';

export type VehiclePresentation = {
  title: string;
  subtitle: string;
  priceLabel: string;
  mileageLabel: string;
  statusLabel: string;
  specChips: string[];
  detailRows: Array<{ label: string; value: string }>;
  badges: string[];
  mediaUrls: string[];
  hasImages: boolean;
  imageCount: number;
};

const DEFAULT_CURRENCY = 'USD';

const toNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const toString = (value: any): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
};

const unique = (items: Array<string | undefined>) =>
  Array.from(new Set(items.map((item) => toString(item)).filter((item): item is string => Boolean(item))));

export const formatVehiclePrice = (amount: any, currency = DEFAULT_CURRENCY) => {
  const value = toNumber(amount);
  if (!value) return 'Ціна за запитом';
  const rounded = Math.round(value);
  const normalizedCurrency = String(currency || DEFAULT_CURRENCY).toUpperCase();
  if (normalizedCurrency === 'USD') return `$${new Intl.NumberFormat('en-US').format(rounded)}`;
  if (normalizedCurrency === 'EUR') return `€${new Intl.NumberFormat('en-US').format(rounded)}`;
  if (normalizedCurrency === 'UAH') return `${new Intl.NumberFormat('uk-UA').format(rounded).replace(/\u00A0/g, ' ')} грн`;
  return `${new Intl.NumberFormat('en-US').format(rounded)} ${normalizedCurrency}`;
};

export const formatVehicleMileage = (mileage: any) => {
  const value = toNumber(mileage);
  if (!value) return 'Пробіг не вказано';
  return `${new Intl.NumberFormat('uk-UA').format(Math.round(value)).replace(/\u00A0/g, ' ')} км`;
};

export const normalizeVehicleSpecLabel = (
  key: 'fuel' | 'transmission' | 'drive' | 'condition' | 'damage' | 'bodyType' | 'status',
  value: any
) => {
  const raw = toString(value);
  if (!raw) return undefined;
  const norm = raw.toLowerCase().replace(/[_-]+/g, ' ');

  if (key === 'fuel') {
    if (/^(running|run|unknown|n\/a|none)$/.test(norm)) return undefined;
    if (/diesel|дизел/.test(norm)) return 'Дизель';
    if (/petrol|gasoline|бензин/.test(norm)) return 'Бензин';
    if (/hybrid|гібрид|гибрид/.test(norm)) return 'Гібрид';
    if (/electric|elektro|electro|ev|електро|электро/.test(norm)) return 'Електро';
    if (/lpg|газ/.test(norm)) return 'Газ';
  }

  if (key === 'transmission') {
    if (/automat|automatic|автомат|at\b/.test(norm)) return 'Автомат';
    if (/manual|механ|mt\b/.test(norm)) return 'Механіка';
    if (/cvt|варіатор/.test(norm)) return 'Варіатор';
    if (/robot|робот/.test(norm)) return 'Робот';
  }

  if (key === 'drive') {
    if (/awd|4wd|quattro|повн/.test(norm)) return 'Повний';
    if (/fwd|front|передн/.test(norm)) return 'Передній';
    if (/rwd|rear|задн/.test(norm)) return 'Задній';
  }

  if (key === 'condition') {
    if (/in transit|дороз|в\s+дороз/.test(norm)) return 'В дорозі';
    if (/available|наяв|в\s+наяв/.test(norm)) return 'В наявності';
    if (/running|на ходу|робоч/.test(norm)) return 'На ходу';
    if (/new|нов/.test(norm)) return 'Новий';
    if (/used|вжив|б\/у|бу/.test(norm)) return 'Вживаний';
  }

  if (key === 'damage') {
    if (/^(none|no|no damage|без|без пошкоджень|не було|clean)$/.test(norm)) return 'Без пошкоджень';
    if (/minor|small|незнач/.test(norm)) return 'Незначні пошкодження';
    if (/front|перед/.test(norm)) return 'Пошкодження спереду';
    if (/rear|зад/.test(norm)) return 'Пошкодження ззаду';
  }

  if (key === 'bodyType') {
    if (/suv|крос/.test(norm)) return 'SUV';
    if (/sedan|седан/.test(norm)) return 'Седан';
    if (/coupe|купе/.test(norm)) return 'Купе';
    if (/wagon|універсал|универсал/.test(norm)) return 'Універсал';
    if (/hatch/.test(norm)) return 'Хетчбек';
    if (/pickup|пікап/.test(norm)) return 'Пікап';
  }

  if (key === 'status') {
    if (/pending|transit|дороз/.test(norm)) return 'В дорозі';
    if (/available|active|наяв/.test(norm)) return 'В наявності';
    if (/reserved|брон/.test(norm)) return 'Заброньовано';
    if (/sold|прод/.test(norm)) return 'Продано';
    if (/hidden|hide|архів/.test(norm)) return 'Приховано';
  }

  return raw;
};

export const buildVehiclePresentation = (car: any): VehiclePresentation => {
  const specs = car?.specs && typeof car.specs === 'object' && !Array.isArray(car.specs)
    ? car.specs as Record<string, any>
    : {};
  const price = typeof car?.price === 'object' && car?.price !== null ? car.price : { amount: car?.price, currency: car?.currency };
  const statusLabel = normalizeVehicleSpecLabel('status', car?.status) || 'В наявності';
  const fuel = normalizeVehicleSpecLabel('fuel', specs.fuel || specs.engineType);
  const transmission = normalizeVehicleSpecLabel('transmission', specs.transmission);
  const drive = normalizeVehicleSpecLabel('drive', specs.drive);
  const condition = normalizeVehicleSpecLabel('condition', specs.condition);
  const damage = normalizeVehicleSpecLabel('damage', specs.damage || specs.damageLine);
  const bodyType = normalizeVehicleSpecLabel('bodyType', specs.bodyType || specs.body);
  const engine = toString(specs.engine || specs.engineVolume || specs.battery || specs.batteryKwh);
  const location = toString(car?.location);
  const year = toNumber(car?.year);
  const title = toString(car?.title) || [toString(car?.brand || specs.brand || specs.make), toString(car?.model || specs.model), year ? String(year) : undefined].filter(Boolean).join(' ') || 'Авто';
  const mediaUrls = unique([
    toString(car?.thumbnail),
    ...(Array.isArray(car?.mediaUrls) ? car.mediaUrls : []),
    ...(Array.isArray(car?.mediaItems)
      ? car.mediaItems.flatMap((item: any) => [item?.url, item?.previewUrl, item?.tgFileId, item?.fileId])
      : [])
  ]
    .map((value) => normalizeMediaUrl(value))
    .filter(isPublicMediaUrl));

  const detailRows = [
    { label: 'Рік', value: year ? String(year) : 'Не вказано' },
    { label: 'Ціна', value: formatVehiclePrice(price.amount, price.currency || DEFAULT_CURRENCY) },
    { label: 'Пробіг', value: formatVehicleMileage(car?.mileage) },
    fuel ? { label: 'Пальне', value: fuel } : null,
    engine ? { label: 'Двигун / батарея', value: engine } : null,
    transmission ? { label: 'КПП', value: transmission } : null,
    drive ? { label: 'Привід', value: drive } : null,
    bodyType ? { label: 'Кузов', value: bodyType } : null,
    condition ? { label: 'Стан', value: condition } : null,
    damage ? { label: 'Пошкодження', value: damage } : null,
    location ? { label: 'Локація', value: location } : null,
    { label: 'Статус', value: statusLabel }
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  const subtitle = [year ? String(year) : undefined, location, statusLabel].filter(Boolean).join(' • ');
  const badges = unique([
    statusLabel,
    condition && condition !== statusLabel ? condition : undefined,
    damage === 'Без пошкоджень' ? damage : undefined
  ]);

  return {
    title,
    subtitle,
    priceLabel: formatVehiclePrice(price.amount, price.currency || DEFAULT_CURRENCY),
    mileageLabel: formatVehicleMileage(car?.mileage),
    statusLabel,
    specChips: unique([fuel, transmission, drive, bodyType, damage]).slice(0, 6),
    detailRows,
    badges,
    mediaUrls,
    hasImages: mediaUrls.length > 0,
    imageCount: mediaUrls.length
  };
};
