import type { PipelineContext } from '../types.js';

export type Lang = 'EN' | 'UK' | 'RU';

export const normalizeInput = (text?: string | null) =>
  String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const resolveLang = (ctx: PipelineContext): Lang => {
  const raw = String(ctx.locale || '').toUpperCase();
  if (raw.startsWith('UK') || raw.startsWith('UA')) return 'UK';
  if (raw.startsWith('RU')) return 'RU';
  return 'UK';
};

const TEXT: Record<string, Record<Lang, string>> = {
  clientMenu: {
    EN: '👋 <b>{bot}</b>\nChoose an option:',
    UK: '👋 <b>{bot}</b>\nОберіть опцію:',
    RU: '👋 <b>{bot}</b>\nВыберите опцию:'
  },
  catalogMenu: {
    EN: '🔍 <b>{bot}</b>\nChoose an action:',
    UK: '🔍 <b>{bot}</b>\nОберіть дію:',
    RU: '🔍 <b>{bot}</b>\nВыберите действие:'
  },
  b2bMenu: {
    EN: '🤝 <b>{bot}</b>\nChoose an action:',
    UK: '🤝 <b>{bot}</b>\nОберіть дію:',
    RU: '🤝 <b>{bot}</b>\nВыберите действие:'
  },
  askName: {
    EN: 'What is your name?',
    UK: "Як до вас звертатися?",
    RU: 'Как к вам обращаться?'
  },
  askCar: {
    EN: 'What car are you looking for? Brand/model/year.',
    UK: 'Яке авто шукаєте? Марка/модель/рік.',
    RU: 'Какое авто ищете? Марка/модель/год.'
  },
  askBudget: {
    EN: 'Your budget (USD)? You can type "skip".',
    UK: 'Ваш бюджет (USD)? Можна "skip".',
    RU: 'Ваш бюджет (USD)? Можно "skip".'
  },
  askCity: {
    EN: 'City (or type "skip"):',
    UK: 'Місто (або "skip"):',
    RU: 'Город (или "skip"):'
  },
  askContact: {
    EN: 'Share your contact or type a phone number:',
    UK: 'Поділіться контактом або введіть номер:',
    RU: 'Поделитесь контактом или введите номер:'
  },
  invalidName: {
    EN: 'Please enter a valid name.',
    UK: "Вкажіть коректне ім'я.",
    RU: 'Укажите корректное имя.'
  },
  invalidCar: {
    EN: 'Please add a few details about the car.',
    UK: 'Додайте трохи деталей про авто.',
    RU: 'Добавьте немного деталей про авто.'
  },
  invalidBudget: {
    EN: 'Budget looks incorrect. Try again or type "skip".',
    UK: 'Бюджет некоректний. Спробуйте ще раз або "skip".',
    RU: 'Бюджет некорректный. Попробуйте еще раз или "skip".'
  },
  invalidPhone: {
    EN: 'Phone looks invalid. Try again or share contact.',
    UK: 'Телефон некоректний. Спробуйте ще раз або поділіться контактом.',
    RU: 'Телефон некорректный. Попробуйте еще раз или поделитесь контактом.'
  },
  leadConfirm: {
    EN: 'Please confirm:',
    UK: 'Будь ласка, підтвердіть:',
    RU: 'Пожалуйста, подтвердите:'
  },
  leadReceived: {
    EN: '✅ Request received! Our manager will contact you soon.',
    UK: '✅ Заявку прийнято! Менеджер скоро зв’яжеться.',
    RU: '✅ Заявка принята! Менеджер скоро свяжется.'
  },
  leadDuplicate: {
    EN: '✅ We already have your request. A manager will follow up.',
    UK: '✅ Ми вже отримували заявку. Менеджер з вами зв’яжеться.',
    RU: '✅ Мы уже получили заявку. Менеджер с вами свяжется.'
  },
  supportAsk: {
    EN: 'Describe your question and we will respond soon.',
    UK: 'Опишіть питання, і ми скоро відповімо.',
    RU: 'Опишите вопрос, и мы скоро ответим.'
  },
  supportReceived: {
    EN: '✅ Thanks! We forwarded your message.',
    UK: '✅ Дякуємо! Ми передали ваше повідомлення.',
    RU: '✅ Спасибо! Мы передали ваше сообщение.'
  },
  cancelled: {
    EN: '❌ Cancelled.',
    UK: '❌ Скасовано.',
    RU: '❌ Отменено.'
  },
  catalogAskBrand: {
    EN: 'Brand? (or "skip")',
    UK: 'Марка? (або "skip")',
    RU: 'Марка? (или "skip")'
  },
  catalogAskModel: {
    EN: 'Model? (or "skip")',
    UK: 'Модель? (або "skip")',
    RU: 'Модель? (или "skip")'
  },
  catalogAskYear: {
    EN: 'Year range? (e.g., 2018-2022 or "skip")',
    UK: 'Роки? (напр., 2018-2022 або "skip")',
    RU: 'Годы? (например, 2018-2022 или "skip")'
  },
  catalogAskPrice: {
    EN: 'Price range USD? (e.g., 15000-30000 or "skip")',
    UK: 'Ціна USD? (напр., 15000-30000 або "skip")',
    RU: 'Цена USD? (например, 15000-30000 или "skip")'
  },
  catalogAskCity: {
    EN: 'City? (or "skip")',
    UK: 'Місто? (або "skip")',
    RU: 'Город? (или "skip")'
  },
  catalogNoResults: {
    EN: 'No cars found. Try different filters or open the MiniApp.',
    UK: 'Нічого не знайдено. Спробуйте інші фільтри або відкрийте MiniApp.',
    RU: 'Ничего не найдено. Попробуйте другие фильтры или откройте MiniApp.'
  },
  catalogResults: {
    EN: 'Top results:',
    UK: 'Топ результатів:',
    RU: 'Лучшие результаты:'
  },
  catalogSellContact: {
    EN: 'Share your contact to sell a car:',
    UK: 'Поділіться контактом для продажу авто:',
    RU: 'Поделитесь контактом для продажи авто:'
  },
  catalogSellCar: {
    EN: 'Describe your car (brand/model/year/price).',
    UK: 'Опишіть авто (марка/модель/рік/ціна).',
    RU: 'Опишите авто (марка/модель/год/цена).'
  },
  catalogSellConfirm: {
    EN: 'Confirm the sell request:',
    UK: 'Підтвердьте заявку на продаж:',
    RU: 'Подтвердите заявку на продажу:'
  },
  catalogSellReceived: {
    EN: '✅ Your sell request was sent. We will contact you soon.',
    UK: '✅ Заявку на продаж надіслано. Ми зв’яжемося.',
    RU: '✅ Заявка на продаж отправлена. Мы свяжемся.'
  },
  b2bAskTitle: {
    EN: 'What car is needed? (brand/model)',
    UK: 'Яке авто потрібно? (марка/модель)',
    RU: 'Какое авто нужно? (марка/модель)'
  },
  b2bAskYear: {
    EN: 'Year range? (e.g., 2016-2022 or "skip")',
    UK: 'Роки? (напр., 2016-2022 або "skip")',
    RU: 'Годы? (например, 2016-2022 или "skip")'
  },
  b2bAskBudget: {
    EN: 'Budget USD? (e.g., 20000-35000 or "skip")',
    UK: 'Бюджет USD? (напр., 20000-35000 або "skip")',
    RU: 'Бюджет USD? (например, 20000-35000 или "skip")'
  },
  b2bAskMileage: {
    EN: 'Desired mileage? (e.g., 80-150k km or "skip")',
    UK: 'Бажаний пробіг? (напр., 80-150 тис. км або "skip")',
    RU: 'Желаемый пробег? (например, 80-150 тыс. км или "skip")'
  },
  b2bAskFuel: {
    EN: 'Fuel type? (petrol/diesel/hybrid or "skip")',
    UK: 'Тип пального? (бензин/дизель/гібрид або "skip")',
    RU: 'Тип топлива? (бензин/дизель/гибрид или "skip")'
  },
  b2bAskDesc: {
    EN: 'Additional requirements / comment (color, trim, etc).',
    UK: 'Додаткові вимоги / коментар (колір, комплектація, інше).',
    RU: 'Доп. требования / комментарий (цвет, комплектация, другое).'
  },
  b2bAskContact: {
    EN: 'Share your contact or type a phone number:',
    UK: 'Поділіться контактом або введіть номер:',
    RU: 'Поделитесь контактом или введите номер:'
  },
  b2bAskCompany: {
    EN: 'Company name? (or "skip")',
    UK: 'Назва компанії? (або "skip")',
    RU: 'Название компании? (или "skip")'
  },
  b2bConfirm: {
    EN: 'Confirm the request:',
    UK: 'Підтвердьте запит:',
    RU: 'Подтвердите запрос:'
  },
  b2bSent: {
    EN: '✅ Request created! We will notify the network.',
    UK: '✅ Запит створено! Ми сповістимо мережу.',
    RU: '✅ Запрос создан! Мы уведомим сеть.'
  },
  miniappReceived: {
    EN: '✅ Thanks! We received your submission.',
    UK: '✅ Дякуємо! Ми отримали вашу заявку.',
    RU: '✅ Спасибо! Мы получили вашу заявку.'
  },
  miniappInvalid: {
    EN: '⚠️ Could not process MiniApp data. Please try again.',
    UK: '⚠️ Не вдалося обробити дані MiniApp. Спробуйте ще раз.',
    RU: '⚠️ Не удалось обработать данные MiniApp. Попробуйте еще раз.'
  },
  fallback: {
    EN: 'Use the menu below to continue.',
    UK: 'Скористайтесь меню нижче.',
    RU: 'Используйте меню ниже.'
  }
};

const BUTTONS = {
  clientLead: {
    lead: { EN: '🚗 Leave a request', UK: '🚗 Залишити заявку', RU: '🚗 Оставить заявку' },
    support: { EN: '📞 Contact manager', UK: '📞 Звʼязатися з менеджером', RU: '📞 Связаться с менеджером' }
  },
  catalog: {
    find: { EN: '🔎 Find', UK: '🔎 Пошук', RU: '🔎 Поиск' },
    sell: { EN: '💵 Sell', UK: '💵 Продати', RU: '💵 Продать' }
  },
  b2b: {
    request: { EN: '📝 New Request', UK: '📝 Новий запит', RU: '📝 Новый запрос' }
  },
  common: {
    back: { EN: '⬅️ Back', UK: '⬅️ Назад', RU: '⬅️ Назад' },
    cancel: { EN: '❌ Cancel', UK: '❌ Скасувати', RU: '❌ Отмена' },
    skip: { EN: 'Skip', UK: 'Пропустити', RU: 'Пропустить' },
    contact: { EN: '📱 Share Contact', UK: '📱 Поділитися контактом', RU: '📱 Поделиться контактом' },
    openMiniApp: { EN: 'Open MiniApp', UK: 'Відкрити MiniApp', RU: 'Открыть MiniApp' },
    confirm: { EN: '✅ Confirm', UK: '✅ Підтвердити', RU: '✅ Підтвердити' }
  }
};

export const t = (lang: Lang, key: string, vars: Record<string, string> = {}) => {
  const template = TEXT[key]?.[lang] || TEXT[key]?.EN || '';
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] || '');
};

export const button = (lang: Lang, keyPath: string) => {
  const [group, key] = keyPath.split('.');
  const groupMap = (BUTTONS as any)[group] || {};
  const entry = groupMap[key];
  return entry?.[lang] || entry?.EN || '';
};

export const isCommand = (input: string, candidates: string[]) => {
  const normalized = normalizeInput(input);
  return candidates.some(cmd => normalized === normalizeInput(cmd));
};
