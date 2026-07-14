import { isPublicMediaUrl, normalizeMediaUrl } from './mediaUrl.service.js';
import { parseCarData } from './enhanced-parsing.utils.js';
import { vehicleAvailabilityLabel } from './vehicleState.service.js';

export type VehiclePresentation = {
  title: string;
  subtitle: string;
  description: string;
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

export const KNOWN_BRANDS = [
  'Acura', 'Alfa Romeo', 'Aston Martin', 'Audi', 'Bentley', 'BMW', 'BYD', 'Cadillac', 'Chevrolet',
  'Chery', 'Chrysler', 'Citroen', 'Cupra', 'Dacia', 'Daewoo', 'Dodge', 'Ferrari', 'Fiat', 'Ford',
  'Geely', 'Genesis', 'GMC', 'Honda', 'Hummer', 'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia',
  'Lamborghini', 'Land Rover', 'Lexus', 'Lincoln', 'Maserati', 'Mazda', 'McLaren', 'Mercedes',
  'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Peugeot', 'Porsche', 'Renault',
  'Rolls-Royce', 'Seat', 'Skoda', 'Smart', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Volkswagen',
  'Volvo'
];

const knownBrandPattern = new RegExp(`\\b(${KNOWN_BRANDS.map((brand) => brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');
const normalizeBrandKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const knownBrandByKey = new Map(KNOWN_BRANDS.map((brand) => [normalizeBrandKey(brand), brand]));

export const hasKnownVehicleBrand = (value: unknown) => {
  const title = toString(value) || '';
  return knownBrandPattern.test(title);
};

const formatVehicleSlugToken = (token: string) => {
  const value = token.trim();
  if (!value) return '';
  if (/^[a-z]$/i.test(value)) return value.toUpperCase();
  if (/^[a-z]{2,3}$/i.test(value)) return value.toUpperCase();
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

export const extractAutoRiaIdentityFromSourceUrl = (sourceUrl: unknown, year?: number) => {
  const raw = toString(sourceUrl);
  if (!raw || !/auto\.ria\.com/i.test(raw)) return undefined;

  let fileName = '';
  try {
    const url = new URL(raw);
    fileName = url.pathname.split('/').pop() || '';
  } catch {
    fileName = raw.split(/[?#]/)[0].split('/').pop() || '';
  }

  const slug = fileName.replace(/\.html$/i, '').replace(/^auto_/i, '');
  const tokens = slug.split('_').map((token) => token.trim().toLowerCase()).filter(Boolean);
  if (tokens.length < 2) return undefined;
  if (/^\d{5,}$/.test(tokens[tokens.length - 1])) tokens.pop();

  let brand: string | undefined;
  let brandTokenCount = 0;
  for (let count = Math.min(3, tokens.length - 1); count >= 1; count -= 1) {
    const candidate = tokens.slice(0, count).join('');
    const known = knownBrandByKey.get(candidate);
    if (known) {
      brand = known;
      brandTokenCount = count;
      break;
    }
  }

  const model = tokens.slice(brandTokenCount).map(formatVehicleSlugToken).join(' ').trim();
  if (!brand || !model) return undefined;

  return {
    brand,
    model,
    title: [brand, model, year ? String(year) : undefined].filter(Boolean).join(' ')
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isNoisyVehicleTitle = (value: unknown) => {
  const title = toString(value) || '';
  return /перевірений\s+vin[-\s]?код|verified\s+vin|vin[-\s]?check/i.test(title);
};

const readRawVehicleText = (car: any, specs: Record<string, any>) => {
  const originalRaw = isRecord(car?.originalRaw) ? car.originalRaw : {};
  return [
    toString(car?.description),
    toString(specs.rawText),
    toString(originalRaw.rawText),
    toString(originalRaw.text)
  ].filter(Boolean).join(' ');
};

const parseNumberText = (value: string) => Number(value.replace(/[^\d]/g, ''));

const extractAutoRiaTitleFromRaw = (rawText: string) => {
  const matches = Array.from(rawText.matchAll(/\b([A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z0-9][A-Za-z0-9.'-]*){0,4})\s+((?:19|20)\d{2})\b/g));
  const candidates = matches
    .map(match => `${match[1]} ${match[2]}`.replace(/\s+/g, ' ').trim())
    .filter(title => !isNoisyVehicleTitle(title));
  return candidates.find((title) => knownBrandPattern.test(title)) || candidates[0] || undefined;
};

const extractAutoRiaPriceFromRaw = (rawText: string) => {
  const match = rawText.match(/(\d{1,3}(?:[\s\u00A0]\d{3})+|\d{4,7})\s*\$/);
  return match ? parseNumberText(match[1]) : undefined;
};

const extractAutoRiaMileageFromRaw = (rawText: string) => {
  const match = rawText.match(/(\d{1,3}(?:[\s\u00A0]\d{3})*|\d+)\s*(тис\.?|тисяч|k)?\s*км/i);
  if (!match) return undefined;
  const base = parseNumberText(match[1]);
  if (!base) return undefined;
  return match[2] ? base * 1000 : base;
};

const extractAutoRiaLocationFromRaw = (rawText: string) => {
  const match = rawText.match(/UA,\s*([^,]+),\s*([^,]+)(?:,\s*\d{4,6})?/i);
  return toString(match?.[2]);
};

export const normalizeVehicleLocation = (value: unknown) => {
  const raw = toString(value);
  if (!raw) return undefined;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  if (normalized.length < 4) return undefined;
  if (/^(ний|ній|ный)$/.test(lower)) return undefined;
  return normalized;
};

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
    if (/damaged|після дтп|после дтп|бит|пошкодж|був\s+в\s+дтп/.test(norm)) return 'Після ДТП';
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
    if (/in stock|available|active|наяв|in_stock/.test(norm)) return 'В наявності';
    if (/import to order|під замов|под заказ/.test(norm)) return 'Під замовлення';
    if (/pending|transit|дороз/.test(norm)) return 'В дорозі';
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
  const rawVehicleText = readRawVehicleText(car, specs);
  const parsed = rawVehicleText ? parseCarData(rawVehicleText) : {};
  const rawTitle = rawVehicleText ? extractAutoRiaTitleFromRaw(rawVehicleText) : undefined;
  const rawPrice = rawVehicleText ? extractAutoRiaPriceFromRaw(rawVehicleText) : undefined;
  const rawMileage = rawVehicleText ? extractAutoRiaMileageFromRaw(rawVehicleText) : undefined;
  const rawLocation = rawVehicleText ? extractAutoRiaLocationFromRaw(rawVehicleText) : undefined;
  const statusLabel = car?.availabilityState
    ? vehicleAvailabilityLabel(car.availabilityState, car?.status)
    : (normalizeVehicleSpecLabel('status', car?.status) || 'В наявності');
  const fuel = normalizeVehicleSpecLabel('fuel', specs.fuel || specs.engineType || parsed.fuel);
  const transmission = normalizeVehicleSpecLabel('transmission', specs.transmission || parsed.transmission);
  const drive = normalizeVehicleSpecLabel('drive', specs.drive || parsed.drive);
  const condition = normalizeVehicleSpecLabel('condition', specs.condition || parsed.condition);
  const damage = normalizeVehicleSpecLabel('damage', specs.damage || specs.damageLine);
  const bodyType = normalizeVehicleSpecLabel('bodyType', specs.bodyType || specs.body);
  const engine = toString(specs.engine || specs.engineVolume || specs.battery || specs.batteryKwh || parsed.engine);
  const location = normalizeVehicleLocation(car?.location) || normalizeVehicleLocation(parsed.location) || normalizeVehicleLocation(rawLocation);
  const year = toNumber(car?.year) || toNumber(parsed.year);
  const sourceUrlIdentity = extractAutoRiaIdentityFromSourceUrl(car?.sourceUrl, year);
  const sourceTitle = toString(car?.title);
  const parsedTitle = toString(parsed.title);
  const title = (sourceTitle && !isNoisyVehicleTitle(sourceTitle) && hasKnownVehicleBrand(sourceTitle) ? sourceTitle : undefined)
    || (rawTitle && hasKnownVehicleBrand(rawTitle) ? rawTitle : undefined)
    || sourceUrlIdentity?.title
    || (sourceTitle && !isNoisyVehicleTitle(sourceTitle) ? sourceTitle : undefined)
    || rawTitle
    || (parsedTitle && !isNoisyVehicleTitle(parsedTitle) ? parsedTitle : undefined)
    || [toString(car?.brand || specs.brand || specs.make || parsed.brand), toString(car?.model || specs.model || parsed.model), year ? String(year) : undefined].filter(Boolean).join(' ')
    || sourceTitle
    || 'Авто';
  const priceAmount = toNumber(price.amount) || rawPrice;
  const mileageAmount = toNumber(car?.mileage) || toNumber(parsed.mileage) || rawMileage;
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
    { label: 'Ціна', value: formatVehiclePrice(priceAmount, price.currency || DEFAULT_CURRENCY) },
    { label: 'Пробіг', value: formatVehicleMileage(mileageAmount) },
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
  const description = unique([
    [year ? String(year) : undefined, title, statusLabel].filter(Boolean).join(' • '),
    [fuel, engine, transmission, drive].filter(Boolean).join(' • '),
    damage ? `Пошкодження: ${damage}` : undefined,
    location ? `Локація: ${location}` : undefined
  ]).join('\n');

  return {
    title,
    subtitle,
    description,
    priceLabel: formatVehiclePrice(priceAmount, price.currency || DEFAULT_CURRENCY),
    mileageLabel: formatVehicleMileage(mileageAmount),
    statusLabel,
    specChips: unique([fuel, transmission, drive, bodyType, damage]).slice(0, 6),
    detailRows,
    badges,
    mediaUrls,
    hasImages: mediaUrls.length > 0,
    imageCount: mediaUrls.length
  };
};
