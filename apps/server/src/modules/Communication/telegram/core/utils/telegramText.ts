import type { PipelineContext } from '../types.js';

export type Lang = 'EN' | 'UK' | 'RU';

export const normalizeInput = (text?: string | null) =>
  String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const resolveLang = (_ctx: PipelineContext): Lang => 'UK';

const TEXT: Record<string, Record<Lang, string>> = {
  'common.welcome_lead': {
    EN: '', RU: '',
    UK: '👋 <b>CarTié</b> — підбір, продаж та супровід авто.\n\nОберіть, що хочете зробити зараз: переглянути авто в наявності, авто в дорозі, підібрати авто під запит або звʼязатися з менеджером.'
  },
  'common.welcome_b2b_unregistered': {
    EN: '', RU: '',
    UK: '🤝 <b>CarDealer Lviv</b> — закрита B2B-платформа для автоплощадок.\n\n🚀 Швидко створюйте запити, отримуйте варіанти від партнерів та керуйте продажами з інвентаря.\n🔒 Доступ лише після реєстрації.\n📌 Контакти не публікуються в каналі — їх бачить лише адміністратор.\n\nОберіть варіант:'
  },
  'common.welcome_b2b_registered': {
    EN: '', RU: '',
    UK: '🤝 <b>CarDealer Lviv</b> — ваша B2B-мережа автоплощадок.\n\n🚀 Створюйте запити, публікуйте авто з інвентаря або через форму та отримуйте релевантні відповіді в єдиному процесі.\n🔒 Контакти в каналі приховані за правилами мережі.\n\nОберіть дію нижче:'
  },
  'common.info_lead': {
    EN: '', RU: '',
    UK: 'ℹ️ <b>Як працює CarTié</b>\n\n1️⃣ <b>Купити авто</b>\n🔘 відповідаєте на кілька питань\n🔘 отримуєте добірку авто (по 1–3 шт)\n🔘 додаєте в ⭐ обране і надсилаєте запит одразу по кількох авто\n\n2️⃣ <b>Продати авто</b>\n🔘 заповнюєте картку + фото\n🔘 заявка потрапляє менеджеру\n\n3️⃣ <b>Підтримка</b>\n🔘 залишаєте запит — ми відповімо\n\n🔐 Контакт використовується лише для звʼязку.'
  },
  'common.info_b2b': {
    EN: '', RU: '',
    UK: 'ℹ️ <b>Як працює CarDealer Lviv</b>\n\n1️⃣ Майданчик створює <b>запит</b> у боті → бот публікує пост у каналі.\n2️⃣ Інші майданчики тиснуть <b>«Є авто»</b> → надсилають <b>варіант</b> через бота.\n3️⃣ Автор бачить варіанти <b>без контактів</b>.\n4️⃣ Автор натискає <b>«Підходить / Не підходить»</b>.\n5️⃣ Варіанти <b>«Підходить»</b> потрапляють адміну.\n\n🔒 Контакти ніколи не публікуються в каналі.'
  },
  'common.rules_b2b': {
    EN: '', RU: '',
    UK: '📌 <b>Правила мережі</b>\n\n1️⃣ Усі запити — <b>тільки через бота</b>\n2️⃣ Відповідь — <b>тільки «Є авто»</b>\n3️⃣ <b>Жодних телефонів</b> у каналі/повідомленнях\n4️⃣ Контакти передає бот <b>лише адміну</b>\n5️⃣ Порушення правил = блок доступу'
  },
  'common.tariffs_b2b': {
    EN: '', RU: '',
    UK: '💳 <b>Тарифи (пілот)</b>\n\n🆓 Free — 3 запити/місяць\n⭐ PRO — 399 грн/міс — безліміт запитів\n🏢 Business — 999 грн/міс — «push-запит» (закріплення на 24 год)\n\n📌 Оплата/активація — через адміністратора (поки що).'
  },
  'common.privacy': {
    EN: '', RU: '',
    UK: '🔐 <b>Політика конфіденційності (коротко)</b>\n\n📌 Ми використовуємо ваш контакт лише для звʼязку щодо запиту.\n📌 У B2B контакти не публікуються в каналі.\n📌 Ви можете попросити видалити дані через «Підтримка».'
  },
  'common.err.too_fast': {
    EN: '', RU: '',
    UK: '⏳ Занадто швидко. Спробуйте ще раз за кілька секунд.'
  },
  'common.err.invalid_year': {
    EN: '', RU: '',
    UK: '⚠️ Рік має бути числом (наприклад 2018) або діапазоном (2018-2022).'
  },
  'common.err.invalid_budget': {
    EN: '', RU: '',
    UK: '⚠️ Бюджет введено некоректно.\nПриклад: 20000 або 20 000 або 20k або 20 тис.'
  },
  'common.err.invalid_mileage': {
    EN: '', RU: '',
    UK: '⚠️ Пробіг введено некоректно.\nПриклад: 120000 або 120 тис або 120k.'
  },
  'common.err.invalid_phone': {
    EN: '', RU: '',
    UK: '⚠️ Номер телефону некоректний.\nПриклад: +380XXXXXXXXX або 0XXXXXXXXX.\nАбо натисніть «Поділитися контактом».'
  },
  'common.err.contacts_forbidden': {
    EN: '', RU: '',
    UK: '⛔️ Контакти/телефони заборонені в цьому полі. Напишіть без номерів і посилань на месенджери.'
  },
  'common.step_hint_brand': {
    EN: '', RU: '',
    UK: 'Приклад: BMW / Audi / Toyota\nМожна натиснути кнопку або ввести вручну.'
  },
  'common.step_hint_model': {
    EN: '', RU: '',
    UK: 'Можна обрати модель кнопкою або ввести вручну.\nЯкщо не знаєте — натисніть «Пропустити».'
  },
  'common.step_hint_year': {
    EN: '', RU: '',
    UK: 'Приклад: 2018 або 2018-2022.\nАбо натисніть кнопку.'
  },
  'common.step_hint_budget': {
    EN: '', RU: '',
    UK: 'Приклад: 20000 або 20 000 або 20k.\nВалюта — USD.'
  },
  'common.step_hint_mileage': {
    EN: '', RU: '',
    UK: 'Приклад: 120000 або 120 тис або 120k.\nОдиниці — км.'
  },
  'lead.menu_title': {
    EN: '', RU: '',
    UK: 'Оберіть дію:'
  },
  'b2b.menu_title_registered': {
    EN: '', RU: '',
    UK: 'Оберіть дію:'
  },
  'lead.buy.title': {
    EN: '', RU: '',
    UK: '🛒 <b>Купити авто</b>'
  },
  'lead.sell.title': {
    EN: '', RU: '',
    UK: '💰 <b>Продати авто</b>'
  },
  'support.title': {
    EN: '', RU: '',
    UK: '🆘 <b>Підтримка</b>'
  },
  'lead.buy.review.title': {
    EN: '', RU: '',
    UK: '✅ <b>Перевірте запит</b>\n\n{summary}\n\nВсе вірно?'
  },
  'lead.sell.review.title': {
    EN: '', RU: '',
    UK: '✅ <b>Перевірте дані авто</b>\n\n{summary}\n\nНадіслати менеджеру?'
  },
  'b2b.request.review.title': {
    EN: '', RU: '',
    UK: '✅ <b>Перевірте запит</b>\n\n{summary}\n\nПублікувати в канал?'
  },
  'b2b.variant.review.title': {
    EN: '', RU: '',
    UK: '✅ <b>Перевірте варіант</b>\n\n{summary}\n\nНадіслати автору?'
  },
  'b2b.sell.choose': {
    EN: '', RU: '',
    UK: '💰 <b>Продати авто</b>\n\nОберіть спосіб публікації:'
  },
  'b2b.sell.review.title': {
    EN: '', RU: '',
    UK: '✅ <b>Перевірте дані авто</b>\n\n{summary}\n\nЗберегти в інвентар чи одразу публікувати в канал?'
  },
  'b2b.sell.saved': {
    EN: '', RU: '',
    UK: '✅ Авто додано у ваш інвентар.'
  },
  'b2b.sell.published': {
    EN: '', RU: '',
    UK: '✅ Авто додано у ваш інвентар та опубліковано в каналі.'
  },
  'lead.buy.searching': {
    EN: '', RU: '',
    UK: '🔎 Підбираю варіанти…'
  },
  'lead.buy.no_matches': {
    EN: '', RU: '',
    UK: '😕 У базі поки немає точних збігів.\n\n✅ Ми передали запит менеджеру — підберемо варіанти та звʼяжемося з вами.'
  },
  'lead.buy.next_actions': {
    EN: '', RU: '',
    UK: 'Що робимо далі?'
  },
  'lead.fav.title': {
    EN: '', RU: '',
    UK: '⭐ <b>Обране</b>'
  },
  'lead.fav.empty': {
    EN: '', RU: '',
    UK: '⭐ Обране порожнє.\nДодайте авто в обране, щоб надіслати запит по кількох варіантах.'
  },
  'support.has_open': {
    EN: '', RU: '',
    UK: 'У вас вже є відкритий запит.\nОберіть дію:'
  },
  'support.ask_text': {
    EN: '', RU: '',
    UK: 'Опишіть питання одним повідомленням:'
  },
  'support.ask_contact': {
    EN: '', RU: '',
    UK: 'Додайте контакт для відповіді:'
  },
  'support.received': {
    EN: '', RU: '',
    UK: '✅ Дякуємо! Запит передано. Ми відповімо найближчим часом.'
  },
  'miniapp.interest.ask_contact': {
    EN: '', RU: '',
    UK: '✅ Зафіксували інтерес до авто: <b>{car}</b>\n\nЩоб менеджер звʼязався з вами, поділіться контактом у Telegram.'
  },
  'b2b.reg.choose': {
    EN: '', RU: '',
    UK: 'Оберіть тип реєстрації:'
  },
  'b2b.reg.new_partner.title': {
    EN: '', RU: '',
    UK: '🏢 <b>Реєстрація партнера</b>'
  },
  'b2b.reg.agent.title': {
    EN: '', RU: '',
    UK: '👤 <b>Реєстрація представника</b>\n\nВведіть код партнера (наприклад: CDL-4F7K2Q):'
  },
  'b2b.reg.submitted': {
    EN: '', RU: '',
    UK: '✅ Заявку на реєстрацію відправлено адміну.\nМи повідомимо про рішення.'
  },
  'b2b.reg.approved': {
    EN: '', RU: '',
    UK: '✅ Реєстрацію підтверджено!\n\nВаш код партнера: <b>{code}</b>\n\nДалі приєднайтесь до каналу мережі.'
  },
  'b2b.reg.rejected': {
    EN: '', RU: '',
    UK: '❌ Реєстрацію відхилено.\nЯкщо це помилка — напишіть у «Підтримка».'
  },
  'admin.lead.help': {
    EN: '', RU: '',
    UK: '🛠 <b>CarTié — інструкція адміну</b>\n\n🟢 [LEAD BUY]\n🔘 клієнт обрав авто/попросив підбір\n🔘 відкрийте лід у CRM, звʼяжіться\n\n🟣 [LEAD SELL]\n🔘 клієнт продає авто\n🔘 кнопки: інвентар / публікація / B2B\n\n🆘 [SUPPORT]\n🔘 звернення\n\n⚠️ У цьому чаті бот працює тільки через inline-кнопки.'
  },
  'admin.b2b.help': {
    EN: '', RU: '',
    UK: '🛠 <b>CarDealer Lviv — інструкція адміну</b>\n\n🟡 [B2B REG]\n🔘 підтвердити/відхилити реєстрацію\n\n🔥 [FIT]\n🔘 варіант «Підходить»\n🔘 організувати контакт і зустріч\n\n⚠️ Контакти в каналі заборонені.'
  },
  'admin.test.panel.title': {
    EN: '', RU: '',
    UK: '🧪 <b>Тестові заявки ({bot})</b>\n\nОберіть сценарій для швидкої генерації тестового кейсу в адмін-черзі.'
  },
  'admin.test.panel.hint': {
    EN: '', RU: '',
    UK: 'Усі створені записи маркуються як <b>[TEST]</b> і зберігаються в БД.'
  },
  'admin.test.sent': {
    EN: '', RU: '',
    UK: '✅ Тестову заявку сформовано та надіслано в адмін-чат.'
  },
  'admin.test.panel.stale': {
    EN: '', RU: '',
    UK: '⚠️ Панель застаріла. Відкрийте «🧪 Тестові заявки» ще раз.'
  },
  'admin.test.panel.closed': {
    EN: '', RU: '',
    UK: '🧪 Панель тестових заявок закрито.'
  },
  'admin.test.err.group_only': {
    EN: '', RU: '',
    UK: 'Доступно лише в адмін-групі.'
  },
  'admin.test.err.admin_chat_only': {
    EN: '', RU: '',
    UK: 'Доступно лише в налаштованому admin chat.'
  },
  'admin.test.err.forbidden': {
    EN: '', RU: '',
    UK: 'Лише адміністратори групи можуть запускати тести.'
  },
  'admin.test.err.unavailable': {
    EN: '', RU: '',
    UK: 'Не вдалося перевірити права. Спробуйте ще раз.'
  },
  // Legacy / fallback strings
  fallback: {
    EN: '', RU: '',
    UK: 'Скористайтесь меню нижче або надішліть команду.'
  },
  cancelled: {
    EN: '', RU: '',
    UK: '❌ Скасовано.'
  }
};

const BUTTONS = {
  common: {
    back: { EN: '', RU: '', UK: '⬅️ Назад' },
    cancel: { EN: '', RU: '', UK: '❌ Скасувати' },
    skip: { EN: '', RU: '', UK: 'Пропустити' },
    confirm: { EN: '', RU: '', UK: '✅ Підтвердити' },
    edit: { EN: '', RU: '', UK: '✏️ Змінити' },
    more: { EN: '', RU: '', UK: 'Показати ще' },
    finish: { EN: '', RU: '', UK: 'Завершити' },
    info: { EN: '', RU: '', UK: 'ℹ️ Інформація' },
    infoShort: { EN: '', RU: '', UK: 'ℹ️ Інфо' },
    rules: { EN: '', RU: '', UK: '📌 Правила' },
    privacy: { EN: '', RU: '', UK: '🔐 Конфіденційність' },
    tariffs: { EN: '', RU: '', UK: '💳 Тарифи' },
    openMiniApp: { EN: '', RU: '', UK: 'Каталог авто' },
    shareContact: { EN: '', RU: '', UK: '📱 Поділитися контактом' },
    contact: { EN: '', RU: '', UK: '📱 Поділитися контактом' },
    supplement: { EN: '', RU: '', UK: 'Доповнити' },
    newTicket: { EN: '', RU: '', UK: 'Новий запит' }
  },
  leadMenu: {
    buy: { EN: '', RU: '', UK: '🔎 Підібрати авто' },
    stock: { EN: '', RU: '', UK: '🚘 Авто в наявності' },
    transit: { EN: '', RU: '', UK: '🚢 Авто в дорозі' },
    sell: { EN: '', RU: '', UK: '💰 Продати своє авто' },
    support: { EN: '', RU: '', UK: '👤 Звʼязатися з менеджером' }
  },
  lead: {
    interest: { EN: '', RU: '', UK: '✅ Зацікавило дане авто' },
    favAdd: { EN: '', RU: '', UK: '⭐ В обране' },
    favRemove: { EN: '', RU: '', UK: '🗑 Прибрати з обраного' },
    favorites: { EN: '', RU: '', UK: '⭐ Обране' },
    contactFavs: { EN: '', RU: '', UK: 'Звʼязатися по обраному' },
    changeFilters: { EN: '', RU: '', UK: 'Змінити фільтри' }
  },
  b2bMenu: {
    activeRequests: { EN: '', RU: '', UK: '📥 Запити на авто' },
    newRequest: { EN: '', RU: '', UK: '➕ Створити запит' },
    myInventory: { EN: '', RU: '', UK: '🏪 Моя вітрина' },
    sell: { EN: '', RU: '', UK: '🚘 Запропонувати авто' },
    team: { EN: '', RU: '', UK: '👥 Команда' },
    activity: { EN: '', RU: '', UK: '📊 Активність / статуси' },
    settings: { EN: '', RU: '', UK: '⚙️ Налаштування' }
  },
  b2b: {
    haveCar: { EN: '', RU: '', UK: 'Є авто' },
    fit: { EN: '', RU: '', UK: '✅ Підходить' },
    notFit: { EN: '', RU: '', UK: '❌ Не підходить' },
    sellFromInventory: { EN: '', RU: '', UK: '📣 З інвентаря' },
    sellByForm: { EN: '', RU: '', UK: '📝 Заповнити форму' },
    regNewPartner: { EN: '', RU: '', UK: '🏢 Я новий партнер' },
    regAgent: { EN: '', RU: '', UK: '👤 Я представник партнера' }
  },
  admin: {
    testPanel: { EN: '', RU: '', UK: '🧪 Тестові заявки' },
    refresh: { EN: '', RU: '', UK: '🔄 Оновити' },
    close: { EN: '', RU: '', UK: '✖️ Закрити' }
  }
};

export const t = (_lang: Lang, key: string, vars: Record<string, string> = {}) => {
  const template = TEXT[key]?.UK || TEXT[key]?.EN || '';
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] || '');
};

export const button = (_lang: Lang, keyPath: string) => {
  const [group, key] = keyPath.split('.');
  const groupMap = (BUTTONS as any)[group] || {};
  const entry = groupMap[key];
  return entry?.UK || entry?.EN || '';
};

export const isCommand = (input: string, candidates: string[]) => {
  const normalized = normalizeInput(input);
  return candidates.some(cmd => normalized === normalizeInput(cmd));
};
