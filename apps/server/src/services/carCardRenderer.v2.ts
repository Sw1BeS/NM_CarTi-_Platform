import { renderCarListingCard } from './cardRenderer.js';
import { resolveCardSettings, type CarCardSettings } from './cardSettings.resolver.js';
import { isEnvFlagEnabled } from './featureFlags.js';

const toNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const formatMileageThousands = (mileage: any) => {
  const raw = toNumber(mileage);
  if (!raw) return '—';
  const value = Math.round((raw / 1000) * 10) / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const deriveMakeModel = (car: any) => {
  const specs = (car?.specs || {}) as Record<string, any>;
  const make = String(specs.make || '').trim();
  const model = String(specs.model || '').trim();
  const year = toNumber(car?.year);

  if (make || model) {
    return {
      make: make || 'Авто',
      model: model || '',
      year: year ? String(year) : ''
    };
  }

  const title = String(car?.title || '').trim();
  if (!title) {
    return { make: 'Авто', model: '', year: year ? String(year) : '' };
  }

  const parts = title.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { make: 'Авто', model: '', year: year ? String(year) : '' };
  }

  const first = parts[0] || 'Авто';
  const rest = parts.slice(1).join(' ').replace(/\b(19|20)\d{2}\b/g, '').trim();
  return {
    make: first,
    model: rest,
    year: year ? String(year) : ''
  };
};

const derivePowertrainLine = (car: any) => {
  const specs = (car?.specs || {}) as Record<string, any>;
  const battery = specs.battery || specs.batteryKwh || specs.battery_kw || specs.battery_kwh;
  if (battery) {
    return `Батарея ${String(battery).replace(/[^\d.,]/g, '').trim() || battery} кВт.`;
  }

  const engine = String(specs.engine || '').trim();
  const fuel = String(specs.fuel || '').trim();
  if (engine && fuel) return `Двигун ${engine} ${fuel.toLowerCase()}`;
  if (engine) return `Двигун ${engine}`;
  if (fuel) return `Пальне ${fuel.toLowerCase()}`;
  return 'Двигун не вказано';
};

const deriveStatus = (car: any, settings: CarCardSettings) => {
  const raw = String(car?.status || 'AVAILABLE').toUpperCase();
  const map = settings.statusMap || {};
  const fallback = map.AVAILABLE || {
    statusTag: 'внаявності',
    statusText: 'авто в наявності',
    startStatus: 'В наявності'
  };
  return map[raw] || fallback;
};

const toPrice = (car: any) => {
  const raw = typeof car?.price === 'object' && car?.price !== null
    ? toNumber(car.price.amount)
    : toNumber(car?.price);
  return raw ? Math.round(raw) : 0;
};

export const renderCarCardV2 = (car: any, settings: CarCardSettings) => {
  const derived = deriveMakeModel(car);
  const status = deriveStatus(car, settings);
  const flag = status.flag || settings.defaultFlag || '';

  const makeModelYear = [derived.make, derived.model, derived.year].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const startStatus = status.startStatus || 'В наявності';
  const mileage = formatMileageThousands(car?.mileage);
  const powertrainLine = derivePowertrainLine(car);
  const safetyLine = String((car?.specs || {}).safety || settings.safetyLine || '—');
  const driveLine = String((car?.specs || {}).drive || settings.driveLineFallback || '—');
  const damageLine = String((car?.specs || {}).damage || settings.damageLineFallback || '—');
  const city = String(settings.city || car?.location || 'Львові');
  const price = toPrice(car);
  const priceNote = String(settings.priceNote || '');
  const address = String(settings.address || '');
  const mapLinkLine = String(settings.mapLinkLine || '').trim();
  const socialLinksLine = String(settings.socialLinksLine || '').trim();

  return `${flag}${makeModelYear}
⏳#${status.statusTag} (${status.statusText})

✅ ${startStatus}
🚙 пробіг ${mileage} тис. км
🔥 ${powertrainLine}
✔️ ${safetyLine}
🚙 ${driveLine}
🛠 Пошкодження: ${damageLine}

💵 Ціна за розмитнене авто у ${city}: ${price}$
${priceNote}

📍Головний офіс та майданчик з автомобілями:
${address}
${mapLinkLine}

☎️ Зв’язатись з нами:
Менеджери:
По авто в наявності та в дорозі:
${settings.manager1Phone} - ${settings.manager1Name}
По підбору та пригону:
${settings.manager2Phone} - ${settings.manager2Name}

Підписуйся на нас в соцмережах⬇️
${socialLinksLine}
🚗Авто в наявності`;
};

export const isCarCardV2Enabled = () => isEnvFlagEnabled('FF_CAR_CARD_V2', false);

export const renderCarCardForBot = async (params: {
  car: any;
  lang?: string;
  companyId?: string | null;
  botId?: string | null;
  showcaseId?: string | null;
  showcaseSlug?: string | null;
}) => {
  if (!isCarCardV2Enabled()) {
    return renderCarListingCard(params.car, params.lang || 'UK');
  }

  const settings = await resolveCardSettings({
    companyId: params.companyId,
    botId: params.botId,
    showcaseId: params.showcaseId,
    showcaseSlug: params.showcaseSlug
  });

  return renderCarCardV2(params.car, settings);
};
