import { CAR_DB } from '../../../services/carDb';

export type VehicleBrandOption = {
  brand: string;
  models: string[];
};

export const OTHER_BRAND = 'Інша марка';
export const OTHER_MODEL = 'Інша модель';

const expandedBrands: VehicleBrandOption[] = [
  { brand: 'Acura', models: ['MDX', 'RDX', 'TLX'] },
  { brand: 'Alfa Romeo', models: ['Giulia', 'Stelvio', 'Tonale'] },
  { brand: 'Aston Martin', models: ['DBX', 'DB11', 'Vantage'] },
  { brand: 'Bentley', models: ['Bentayga', 'Continental GT', 'Flying Spur'] },
  { brand: 'Cadillac', models: ['Escalade', 'XT5', 'CT5'] },
  { brand: 'Chevrolet', models: ['Tahoe', 'Suburban', 'Camaro', 'Corvette', 'Bolt'] },
  { brand: 'Dodge', models: ['Charger', 'Challenger', 'Durango', 'RAM 1500'] },
  { brand: 'Ford', models: ['Explorer', 'F-150', 'Mustang', 'Bronco', 'Kuga'] },
  { brand: 'Genesis', models: ['G70', 'G80', 'GV70', 'GV80'] },
  { brand: 'Honda', models: ['Accord', 'Civic', 'CR-V', 'Pilot', 'HR-V'] },
  { brand: 'Hyundai', models: ['Tucson', 'Santa Fe', 'Palisade', 'Sonata', 'IONIQ 5', 'IONIQ 6'] },
  { brand: 'Infiniti', models: ['Q50', 'QX50', 'QX60', 'QX80'] },
  { brand: 'Jaguar', models: ['F-Pace', 'E-Pace', 'I-Pace', 'XF'] },
  { brand: 'Jeep', models: ['Grand Cherokee', 'Wrangler', 'Compass', 'Gladiator'] },
  { brand: 'Kia', models: ['Sportage', 'Sorento', 'Telluride', 'K5', 'EV6', 'EV9'] },
  { brand: 'Lincoln', models: ['Navigator', 'Aviator', 'Corsair'] },
  { brand: 'Maserati', models: ['Ghibli', 'Levante', 'Grecale', 'Quattroporte'] },
  { brand: 'Mazda', models: ['CX-5', 'CX-50', 'CX-60', 'CX-90', 'Mazda 3', 'Mazda 6'] },
  { brand: 'MINI', models: ['Cooper', 'Countryman', 'Clubman'] },
  { brand: 'Mitsubishi', models: ['Outlander', 'Pajero Sport', 'L200', 'Eclipse Cross'] },
  { brand: 'Nissan', models: ['Rogue', 'Qashqai', 'X-Trail', 'Pathfinder', 'Leaf', 'GT-R'] },
  { brand: 'Peugeot', models: ['3008', '5008', '508', '2008'] },
  { brand: 'Polestar', models: ['2', '3', '4'] },
  { brand: 'Renault', models: ['Megane', 'Kadjar', 'Koleos', 'Arkana'] },
  { brand: 'Rolls-Royce', models: ['Cullinan', 'Ghost', 'Phantom', 'Spectre'] },
  { brand: 'Skoda', models: ['Octavia', 'Superb', 'Kodiaq', 'Karoq', 'Enyaq'] },
  { brand: 'Subaru', models: ['Outback', 'Forester', 'Ascent', 'WRX'] },
  { brand: 'Suzuki', models: ['Vitara', 'S-Cross', 'Jimny', 'Swift'] },
  { brand: 'Volvo', models: ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'EX30', 'EX90'] }
];

const merged = new Map<string, Set<string>>();

[...CAR_DB.map(item => ({ brand: item.name, models: item.models })), ...expandedBrands].forEach(item => {
  const brand = item.brand.trim();
  if (!brand) return;
  const models = merged.get(brand) || new Set<string>();
  item.models.forEach(model => {
    const clean = model.trim();
    if (clean) models.add(clean);
  });
  merged.set(brand, models);
});

export const VEHICLE_BRANDS: VehicleBrandOption[] = Array.from(merged.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([brand, models]) => ({
    brand,
    models: [...models].sort((a, b) => a.localeCompare(b))
  }))
  .concat([{ brand: OTHER_BRAND, models: [OTHER_MODEL] }]);

export const BODY_TYPES = ['SUV', 'Седан', 'Універсал', 'Купе', 'Хетчбек', 'Пікап', 'Мінівен', 'Кабріолет', 'Ліфтбек'];
export const FUEL_TYPES = ['Бензин', 'Дизель', 'Гібрид', 'Plug-in гібрид', 'Електро', 'Газ'];
export const MILEAGE_OPTIONS = ['до 50 000 км', 'до 100 000 км', 'до 150 000 км', 'до 200 000 км', 'не важливо'];
export const CITY_OPTIONS = ['Київ', 'Львів', 'Одеса', 'Дніпро', 'Харків', 'Івано-Франківськ', 'Тернопіль', 'Вся Україна', 'Під замовлення'];
