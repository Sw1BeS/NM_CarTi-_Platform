import { NormalizationType, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { extractAutoRiaIdentityFromSourceUrl, normalizeVehicleSpecLabel } from './vehiclePresentation.js';
import { detectMake } from './taxonomy.js';

export type VehicleTaxonomyOption = {
  id: string;
  label: string;
  aliases?: string[];
};

export type VehicleTaxonomyModel = VehicleTaxonomyOption & {
  brandId?: string;
};

export type VehicleTaxonomyBrand = VehicleTaxonomyOption & {
  models: VehicleTaxonomyModel[];
};

export type VehicleTaxonomyResponse = {
  brands: VehicleTaxonomyBrand[];
  bodyTypes: VehicleTaxonomyOption[];
  fuels: VehicleTaxonomyOption[];
  transmissions: VehicleTaxonomyOption[];
  drives: VehicleTaxonomyOption[];
  cities: VehicleTaxonomyOption[];
};

const CURATED_BRANDS = [
  { label: 'BMW', models: ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'X7', 'M3', 'M4', 'M5', 'i4', 'iX'] },
  { label: 'Mercedes-Benz', models: ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'G-Class', 'GLA', 'GLC', 'GLE', 'GLS', 'CLA', 'EQE', 'EQS'] },
  { label: 'Audi', models: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'RS6', 'RS Q8', 'e-tron GT'] },
  { label: 'Porsche', models: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', '718 Cayman', '718 Boxster'] },
  { label: 'Tesla', models: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'] },
  { label: 'Land Rover', models: ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Defender', 'Discovery'] },
  { label: 'Toyota', models: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser 300', 'Land Cruiser Prado', 'Highlander', 'Hilux'] },
  { label: 'Volkswagen', models: ['Golf', 'Passat', 'Tiguan', 'Touareg', 'Arteon', 'ID.4', 'ID.Buzz'] },
  { label: 'Lexus', models: ['ES', 'LS', 'NX', 'RX', 'LX', 'GX'] },
  { label: 'Hyundai', models: ['Tucson', 'Santa Fe', 'Palisade', 'Sonata', 'IONIQ 5', 'IONIQ 6'] },
  { label: 'Kia', models: ['Sportage', 'Sorento', 'Telluride', 'K5', 'EV6', 'EV9'] },
  { label: 'Jeep', models: ['Grand Cherokee', 'Wrangler', 'Compass', 'Gladiator'] },
  { label: 'Nissan', models: ['Rogue', 'Qashqai', 'X-Trail', 'Pathfinder', 'Leaf', 'GT-R'] },
  { label: 'Volvo', models: ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'EX30', 'EX90'] }
];

const STATIC_BODY_TYPES = ['SUV', 'Седан', 'Універсал', 'Купе', 'Хетчбек', 'Пікап', 'Мінівен', 'Кабріолет', 'Ліфтбек'];
const FUEL_CANONICALS = [
  { label: 'Бензин', aliases: ['petrol', 'gasoline', 'benzin', 'бенз'] },
  { label: 'Дизель', aliases: ['diesel'] },
  { label: 'Гібрид', aliases: ['hybrid', 'гібрид', 'гибрид'] },
  { label: 'Plug-in гібрид', aliases: ['plug-in hybrid', 'plug in hybrid', 'plug-in', 'phev'] },
  { label: 'Електро', aliases: ['electric', 'electro', 'ev'] },
  { label: 'Газ', aliases: ['lpg', 'gas'] }
];
const STATIC_FUELS = FUEL_CANONICALS.map(entry => entry.label);
const STATIC_TRANSMISSIONS = ['Автомат', 'Механіка', 'Варіатор', 'Робот'];
const STATIC_DRIVES = ['Повний', 'Передній', 'Задній'];
const CITY_CANONICALS = [
  { id: 'kyiv', label: 'Київ', aliases: ['Kyiv', 'Kiev', 'Киев'] },
  { id: 'lviv', label: 'Львів', aliases: ['Lviv', 'Львов'] },
  { id: 'odesa', label: 'Одеса', aliases: ['Odesa', 'Odessa', 'Одесса'] },
  { id: 'dnipro', label: 'Дніпро', aliases: ['Dnipro', 'Dnipropetrovsk', 'Днепр'] },
  { id: 'kharkiv', label: 'Харків', aliases: ['Kharkiv', 'Харьков'] },
  { id: 'ivano-frankivsk', label: 'Івано-Франківськ', aliases: ['Ivano-Frankivsk'] },
  { id: 'ternopil', label: 'Тернопіль', aliases: ['Ternopil'] },
  { id: 'cherkasy', label: 'Черкаси', aliases: ['Cherkasy'] },
  { id: 'chernivtsi', label: 'Чернівці', aliases: ['Chernivtsi'] },
  { id: 'lutsk', label: 'Луцьк', aliases: ['Lutsk'] },
  { id: 'poltava', label: 'Полтава', aliases: ['Poltava'] },
  { id: 'rivne', label: 'Рівне', aliases: ['Rivne'] },
  { id: 'vinnytsia', label: 'Вінниця', aliases: ['Vinnytsia', 'Винница'] },
  { id: 'zaporizhzhia', label: 'Запоріжжя', aliases: ['Zaporizhzhia', 'Запорожье'] },
  { id: 'zhytomyr', label: 'Житомир', aliases: ['Zhytomyr'] },
  { id: 'all-ukraine', label: 'Вся Україна', aliases: ['All Ukraine'] },
  { id: 'import-to-order', label: 'Під замовлення', aliases: ['Import to order'] }
];
const STATIC_CITIES = CITY_CANONICALS.map(entry => entry.label);

const normalizeLabel = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');

const idOverrides: Record<string, string> = {
  'інша марка': 'other',
  'інша модель': 'other',
  'інше': 'other',
  'other': 'other',
  'plug-in гібрид': 'plug-in-hybrid',
  'повний': 'awd',
  'передній': 'fwd',
  'задній': 'rwd',
  'вся україна': 'all-ukraine',
  'під замовлення': 'import-to-order',
  ...Object.fromEntries(CITY_CANONICALS.flatMap(entry => [
    [entry.label.toLowerCase(), entry.id],
    ...entry.aliases.map(alias => [alias.toLowerCase(), entry.id] as const)
  ]))
};

export const vehicleTaxonomyId = (label: unknown) => {
  const normalized = normalizeLabel(label).toLowerCase();
  if (idOverrides[normalized]) return idOverrides[normalized];
  return normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
};

const addAlias = (aliases: Map<string, Set<string>>, canonical: unknown, alias: unknown) => {
  const key = normalizeLabel(canonical);
  const value = normalizeLabel(alias);
  if (!key || !value || key.toLowerCase() === value.toLowerCase()) return;
  const set = aliases.get(key) || new Set<string>();
  set.add(value);
  aliases.set(key, set);
};

const canonicalByAlias = (entries: Array<{ label: string; aliases: string[] }>) => {
  const map = new Map<string, string>();
  entries.forEach(entry => {
    map.set(entry.label.toLowerCase(), entry.label);
    entry.aliases.forEach(alias => map.set(alias.toLowerCase(), entry.label));
  });
  return map;
};

const fuelByAlias = canonicalByAlias(FUEL_CANONICALS);
const cityByAlias = canonicalByAlias(CITY_CANONICALS);

const canonicalizeFuelLabel = (value: unknown) => {
  const raw = normalizeLabel(value);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (/plug\s*in|phev/.test(normalized)) return 'Plug-in гібрид';
  return fuelByAlias.get(normalized)
    || normalizeVehicleSpecLabel('fuel', raw)
    || raw;
};

const canonicalizeCityLabel = (value: unknown) => {
  const raw = normalizeLabel(value);
  if (!raw) return undefined;
  return cityByAlias.get(raw.toLowerCase()) || raw;
};

const seedCanonicalAliases = (
  aliases: Map<string, Set<string>>,
  entries: Array<{ label: string; aliases: string[] }>
) => {
  entries.forEach(entry => {
    entry.aliases.forEach(alias => addAlias(aliases, entry.label, alias));
  });
};

const option = (label: string, aliases?: Map<string, Set<string>>): VehicleTaxonomyOption => ({
  id: vehicleTaxonomyId(label),
  label,
  aliases: Array.from(aliases?.get(label) || []).sort((a, b) => a.localeCompare(b))
});

const buildOptionList = (labels: Iterable<string>, aliases?: Map<string, Set<string>>) =>
  Array.from(new Set(Array.from(labels).map(normalizeLabel).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((label) => option(label, aliases));

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readSpec = (specs: unknown, keys: string[]) => {
  if (!isJsonObject(specs)) return undefined;
  for (const key of keys) {
    const value = normalizeLabel(specs[key]);
    if (value) return value;
  }
  return undefined;
};

const addBrandModel = (
  brands: Map<string, Set<string>>,
  brandValue?: unknown,
  modelValue?: unknown
) => {
  const brand = normalizeLabel(brandValue);
  const model = normalizeLabel(modelValue);
  if (!brand) return;
  const models = brands.get(brand) || new Set<string>();
  if (model) models.add(model);
  brands.set(brand, models);
};

export class VehicleTaxonomyService {
  async getTaxonomy(params: { companyId?: string | null } = {}): Promise<VehicleTaxonomyResponse> {
    const brandModels = new Map<string, Set<string>>();
    const brandAliases = new Map<string, Set<string>>();
    const modelAliases = new Map<string, Set<string>>();
    const cityAliases = new Map<string, Set<string>>();
    const fuelAliases = new Map<string, Set<string>>();
    const bodyTypes = new Set(STATIC_BODY_TYPES);
    const fuels = new Set(STATIC_FUELS);
    const transmissions = new Set(STATIC_TRANSMISSIONS);
    const drives = new Set(STATIC_DRIVES);
    const cities = new Set(STATIC_CITIES);

    CURATED_BRANDS.forEach((brand) => {
      addBrandModel(brandModels, brand.label);
      brand.models.forEach((model) => addBrandModel(brandModels, brand.label, model));
    });
    seedCanonicalAliases(fuelAliases, FUEL_CANONICALS);
    seedCanonicalAliases(cityAliases, CITY_CANONICALS);

    const aliases = await prisma.normalizationAlias.findMany({
      where: {
        type: { in: [NormalizationType.brand, NormalizationType.model, NormalizationType.city] },
        OR: [
          { companyId: null },
          ...(params.companyId ? [{ companyId: params.companyId }] : [])
        ]
      },
      select: { type: true, alias: true, canonical: true }
    });

    aliases.forEach((entry) => {
      if (entry.type === NormalizationType.brand) {
        addBrandModel(brandModels, entry.canonical);
        addAlias(brandAliases, entry.canonical, entry.alias);
      } else if (entry.type === NormalizationType.model) {
        addAlias(modelAliases, entry.canonical, entry.alias);
      } else if (entry.type === NormalizationType.city) {
        const canonicalCity = canonicalizeCityLabel(entry.canonical) || canonicalizeCityLabel(entry.alias) || entry.canonical;
        cities.add(canonicalCity);
        addAlias(cityAliases, canonicalCity, entry.canonical);
        addAlias(cityAliases, canonicalCity, entry.alias);
      }
    });

    const observed = await prisma.carListing.findMany({
      where: params.companyId ? { companyId: params.companyId } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 300,
      select: {
        title: true,
        year: true,
        location: true,
        specs: true,
        sourceUrl: true,
        originalRaw: true
      }
    });

    observed.forEach((car) => {
      const specs = isJsonObject(car.specs) ? car.specs : {};
      const sourceIdentity = extractAutoRiaIdentityFromSourceUrl(car.sourceUrl, car.year || undefined);
      const detectedBrand = readSpec(specs, ['brand', 'make', 'марка'])
        || sourceIdentity?.brand
        || detectMake(car.title)
        || undefined;
      const detectedModel = readSpec(specs, ['model', 'модель'])
        || sourceIdentity?.model
        || undefined;

      addBrandModel(brandModels, detectedBrand, detectedModel);

      const bodyType = readSpec(specs, ['bodyType', 'body', 'кузов']);
      const fuel = canonicalizeFuelLabel(readSpec(specs, ['fuel', 'engineType', 'пальне']));
      const transmission = readSpec(specs, ['transmission', 'gearbox', 'кпп']);
      const drive = readSpec(specs, ['drive', 'drivetrain', 'привід']);
      const city = canonicalizeCityLabel(normalizeLabel(car.location)
        || readSpec(specs, ['city', 'location', 'місто'])
        || (isJsonObject(car.originalRaw) ? normalizeLabel(car.originalRaw.location) : undefined));

      if (bodyType) bodyTypes.add(bodyType);
      if (fuel) fuels.add(fuel);
      if (transmission) transmissions.add(transmission);
      if (drive) drives.add(drive);
      if (city) cities.add(city);
    });

    addBrandModel(brandModels, 'Other');

    const brands = Array.from(brandModels.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, models]) => {
        const brandId = vehicleTaxonomyId(label);
        const modelOptions = buildOptionList(models.size ? models : ['Other'], modelAliases);
        if (!modelOptions.some((model) => model.id === 'other')) {
          modelOptions.push(option('Other'));
        }
        return {
          ...option(label, brandAliases),
          models: modelOptions.map((model) => ({ ...model, brandId }))
        };
      });

    return {
      brands,
      bodyTypes: buildOptionList(bodyTypes),
      fuels: buildOptionList(fuels, fuelAliases),
      transmissions: buildOptionList(transmissions),
      drives: buildOptionList(drives),
      cities: buildOptionList(cities, cityAliases)
    };
  }
}

export const vehicleTaxonomyService = new VehicleTaxonomyService();
