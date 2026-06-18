import type {
  VehicleTaxonomySnapshotMake,
  VehicleTaxonomySnapshotPlace,
  VehicleTaxonomySnapshotSpecOption
} from './vehicleTaxonomy.types.js';

const make = (label: string, models: string[]): VehicleTaxonomySnapshotMake => ({
  id: label,
  slug: label,
  label,
  sourceMeta: { source: 'emergency_fallback' },
  updatedAt: null,
  models: models.map((model) => ({
    id: `${label}:${model}`,
    slug: model,
    label: model,
    sourceMeta: { source: 'emergency_fallback' },
    updatedAt: null
  }))
});

const option = (group: string, label: string): VehicleTaxonomySnapshotSpecOption => ({
  group,
  slug: label,
  label,
  sourceMeta: { source: 'emergency_fallback' },
  updatedAt: null
});

const place = (label: string): VehicleTaxonomySnapshotPlace => ({
  slug: label,
  label,
  sourceMeta: { source: 'emergency_fallback' },
  updatedAt: null
});

export const EMERGENCY_VEHICLE_MAKES: VehicleTaxonomySnapshotMake[] = [
  make('BMW', ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'X7', 'M3', 'M4', 'M5', 'i4', 'iX']),
  make('Mercedes-Benz', ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'G-Class', 'GLA', 'GLC', 'GLE', 'GLS', 'CLA', 'EQE', 'EQS']),
  make('Audi', ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'RS6', 'RS Q8', 'e-tron GT']),
  make('Porsche', ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan', '718 Cayman', '718 Boxster']),
  make('Tesla', ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck']),
  make('Land Rover', ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Defender', 'Discovery']),
  make('Toyota', ['Camry', 'Corolla', 'RAV4', 'Land Cruiser 300', 'Land Cruiser Prado', 'Highlander', 'Hilux']),
  make('Volkswagen', ['Golf', 'Passat', 'Tiguan', 'Touareg', 'Arteon', 'ID.4', 'ID.Buzz']),
  make('Lexus', ['ES', 'LS', 'NX', 'RX', 'LX', 'GX']),
  make('Hyundai', ['Tucson', 'Santa Fe', 'Palisade', 'Sonata', 'IONIQ 5', 'IONIQ 6']),
  make('Kia', ['Sportage', 'Sorento', 'Telluride', 'K5', 'EV6', 'EV9']),
  make('Jeep', ['Grand Cherokee', 'Wrangler', 'Compass', 'Gladiator']),
  make('Nissan', ['Rogue', 'Qashqai', 'X-Trail', 'Pathfinder', 'Leaf', 'GT-R']),
  make('Volvo', ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'EX30', 'EX90'])
];

export const EMERGENCY_SPEC_OPTIONS: VehicleTaxonomySnapshotSpecOption[] = [
  ...['SUV', 'Седан', 'Універсал', 'Купе', 'Хетчбек', 'Пікап', 'Мінівен', 'Кабріолет', 'Ліфтбек'].map((label) => option('bodyType', label)),
  ...['Бензин', 'Дизель', 'Гібрид', 'Plug-in гібрид', 'Електро', 'Газ'].map((label) => option('fuel', label)),
  ...['Автомат', 'Механіка', 'Варіатор', 'Робот'].map((label) => option('transmission', label)),
  ...['Повний', 'Передній', 'Задній'].map((label) => option('drive', label))
];

export const EMERGENCY_PLACES: VehicleTaxonomySnapshotPlace[] = [
  'Київ',
  'Львів',
  'Одеса',
  'Дніпро',
  'Харків',
  'Івано-Франківськ',
  'Тернопіль',
  'Вся Україна',
  'Під замовлення'
].map(place);
