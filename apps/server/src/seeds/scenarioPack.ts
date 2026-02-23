export const SCENARIO_TEMPLATE_PACK = [
  {
    id: 'tpl_buy_request',
    name: 'Запит на купівлю (UA/RU)',
    category: 'B2B',
    description: 'Збирає параметри запиту на купівлю та створює B2B-запит.',
    isPremium: false,
    structure: {
      triggerCommand: 'buy',
      keywords: ['buy', 'купити', 'купить'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'greet' },
        { id: 'greet', type: 'MESSAGE', content: { text: '👋 Вітаємо! Допоможемо підібрати авто.', text_uk: '👋 Вітаємо! Допоможемо підібрати авто.', text_ru: '👋 Здравствуйте! Поможем подобрать авто.' }, nextNodeId: 'ask_brand' },
        { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Яка марка вас цікавить?', text_uk: 'Яка марка вас цікавить?', text_ru: 'Какая марка интересует?', variableName: 'brand' }, nextNodeId: 'ask_model' },
        { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Яка модель?', text_uk: 'Яка модель?', text_ru: 'Какая модель?', variableName: 'model' }, nextNodeId: 'ask_budget' },
        { id: 'ask_budget', type: 'QUESTION_TEXT', content: { text: 'Бюджет (USD)?', text_uk: 'Бюджет (USD)?', text_ru: 'Бюджет (USD)?', variableName: 'budget' }, nextNodeId: 'ask_year' },
        { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Рік (наприклад 2019+)?', text_uk: 'Рік (наприклад 2019+)?', text_ru: 'Год (например 2019+)?', variableName: 'year' }, nextNodeId: 'ask_city' },
        { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'Місто?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_contact' },
        { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Поділіться контактом для звʼязку.', text_uk: 'Поділіться контактом для звʼязку.', text_ru: 'Поделитесь контактом для связи.' }, nextNodeId: 'create_lead' },
        { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'BUY' }, nextNodeId: 'create_request' },
        { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'BUY' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'MESSAGE', content: { text: '✅ Запит створено. Звʼяжемося найближчим часом.', text_uk: '✅ Запит створено. Звʼяжемося найближчим часом.', text_ru: '✅ Запрос создан. Свяжемся в ближайшее время.' } }
      ]
    }
  },
  {
    id: 'tpl_sell_tradein',
    name: 'Продаж / Trade-in (UA/RU)',
    category: 'B2B',
    description: 'Збирає параметри продажу/trade-in та створює B2B-запит.',
    isPremium: false,
    structure: {
      triggerCommand: 'sell',
      keywords: ['sell', 'продати', 'продать', 'trade-in'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'greet' },
        { id: 'greet', type: 'MESSAGE', content: { text: '👋 Оцінимо ваше авто.', text_uk: '👋 Оцінимо ваше авто.', text_ru: '👋 Оценим ваш автомобиль.' }, nextNodeId: 'ask_brand' },
        { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Марка?', text_uk: 'Марка?', text_ru: 'Марка?', variableName: 'brand' }, nextNodeId: 'ask_model' },
        { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Яка модель?', text_uk: 'Модель?', text_ru: 'Модель?', variableName: 'model' }, nextNodeId: 'ask_year' },
        { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Рік?', text_uk: 'Рік?', text_ru: 'Год?', variableName: 'year' }, nextNodeId: 'ask_mileage' },
        { id: 'ask_mileage', type: 'QUESTION_TEXT', content: { text: 'Пробіг (км)?', text_uk: 'Пробіг (км)?', text_ru: 'Пробег (км)?', variableName: 'mileage' }, nextNodeId: 'ask_vin' },
        { id: 'ask_vin', type: 'QUESTION_TEXT', content: { text: 'VIN (необовʼязково)?', text_uk: 'VIN (необовʼязково)?', text_ru: 'VIN (необязательно)?', variableName: 'vin' }, nextNodeId: 'ask_price' },
        { id: 'ask_price', type: 'QUESTION_TEXT', content: { text: 'Очікувана ціна (USD)?', text_uk: 'Очікувана ціна (USD)?', text_ru: 'Ожидаемая цена (USD)?', variableName: 'budget' }, nextNodeId: 'ask_city' },
        { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'Місто?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_contact' },
        { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Поділіться контактом.', text_uk: 'Поділіться контактом.', text_ru: 'Поделитесь контактом.' }, nextNodeId: 'create_lead' },
        { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'SELL' }, nextNodeId: 'create_request' },
        { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'SELL' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'MESSAGE', content: { text: '✅ Дякуємо! Звʼяжемося з пропозицією.', text_uk: '✅ Дякуємо! Звʼяжемося з пропозицією.', text_ru: '✅ Спасибо! Свяжемся с предложением.' } }
      ]
    }
  },
  {
    id: 'tpl_lead_basic',
    name: 'Базовий Lead Bot (UA/RU)',
    category: 'LEAD_GEN',
    description: 'Вибір мови, покрокова форма, згода та створення заявки.',
    isPremium: false,
    structure: {
      triggerCommand: 'lead',
      keywords: ['lead', 'contact', 'звʼязок', 'связь', 'catalog', 'каталог'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'choose_lang' },
        { id: 'choose_lang', type: 'QUESTION_CHOICE', content: { text: 'Оберіть мову', text_uk: 'Оберіть мову', text_ru: 'Выберите язык', variableName: 'language', choices: [
          { label: 'Українська', label_uk: 'Українська', label_ru: 'Украинский', value: 'UK', nextNodeId: 'set_lang' },
          { label: 'Російська', label_uk: 'Російська', label_ru: 'Русский', value: 'RU', nextNodeId: 'set_lang' }
        ] } },
        { id: 'set_lang', type: 'ACTION', content: { actionType: 'SET_LANG' }, nextNodeId: 'greet' },
        { id: 'greet', type: 'MESSAGE', content: { text: '👋 Вітаємо! Допоможу створити заявку. /back — назад, /menu — меню.', text_uk: '👋 Вітаємо! Допоможу створити заявку. /back — назад, /menu — меню.', text_ru: '👋 Здравствуйте! Помогу создать заявку. /back — назад, /menu — меню.' }, nextNodeId: 'limit_check' },
        { id: 'limit_check', type: 'ACTION', content: { actionType: 'CHECK_DAILY_REQUEST_LIMIT', limit: 3 }, nextNodeId: 'limit_gate' },
        { id: 'limit_gate', type: 'CONDITION', content: { conditionVariable: 'limit_reached', conditionOperator: 'EQUALS', conditionValue: true, trueNodeId: 'limit_msg', falseNodeId: 'ask_brand' } },
        { id: 'limit_msg', type: 'MESSAGE', content: { text: '⚠️ Ліміт заявок на сьогодні вичерпано. Спробуйте завтра.', text_uk: '⚠️ Ліміт заявок на сьогодні вичерпано. Спробуйте завтра.', text_ru: '⚠️ Лимит заявок на сегодня исчерпан. Попробуйте завтра.' } },

        { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Марка?', text_uk: 'Марка?', text_ru: 'Марка?', variableName: 'brand' }, nextNodeId: 'ask_model' },
        { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Яка модель?', text_uk: 'Модель?', text_ru: 'Модель?', variableName: 'model' }, nextNodeId: 'ask_year' },
        { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Мін. рік?', text_uk: 'Мін. рік?', text_ru: 'Мин. год?', variableName: 'year' }, nextNodeId: 'ask_budget' },
        { id: 'ask_budget', type: 'QUESTION_TEXT', content: { text: 'Макс. бюджет (USD)?', text_uk: 'Макс. бюджет (USD)?', text_ru: 'Макс. бюджет (USD)?', variableName: 'budget' }, nextNodeId: 'ask_city' },
        { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'Місто?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_name' },
        { id: 'ask_name', type: 'QUESTION_TEXT', content: { text: 'Ваше імʼя / компанія?', text_uk: 'Ваше імʼя / компанія?', text_ru: 'Ваше имя / компания?', variableName: 'clientName' }, nextNodeId: 'ask_contact' },
        { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Поділіться номером', text_uk: 'Поділіться номером', text_ru: 'Поделитесь номером' }, nextNodeId: 'consent' },
        { id: 'consent', type: 'QUESTION_CHOICE', content: { text: 'Згода на обробку даних?', text_uk: 'Згода на обробку даних?', text_ru: 'Согласие на обработку данных?', variableName: 'consent', choices: [
          { label: 'Так', label_uk: 'Так', label_ru: 'Да', value: 'yes', nextNodeId: 'normalize' },
          { label: 'Ні', label_uk: 'Ні', label_ru: 'Нет', value: 'no', nextNodeId: 'no_consent' }
        ] } },
        { id: 'no_consent', type: 'MESSAGE', content: { text: '⚠️ Без згоди не можемо продовжити.', text_uk: '⚠️ Без згоди не можемо продовжити.', text_ru: '⚠️ Без согласия мы не можем продолжить.' } },

        { id: 'normalize', type: 'ACTION', content: { actionType: 'NORMALIZE_REQUEST' }, nextNodeId: 'create_lead' },
        { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'BUY' }, nextNodeId: 'summary' },
        { id: 'summary', type: 'MESSAGE', content: { text: '📄 Підсумок:\n{brand} {model}\nРік: {year}+\nБюджет: {budget}\nМісто: {city}\nІмʼя: {clientName}\nТелефон: {phone}', text_uk: '📄 Підсумок:\n{brand} {model}\nРік: {year}+\nБюджет: {budget}\nМісто: {city}\nІмʼя: {clientName}\nТелефон: {phone}', text_ru: '📄 Итог:\n{brand} {model}\nГод: {year}+\nБюджет: {budget}\nГород: {city}\nИмя: {clientName}\nТелефон: {phone}' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'QUESTION_CHOICE', content: { text: 'Надіслати заявку?', text_uk: 'Надіслати заявку?', text_ru: 'Отправить заявку?', variableName: 'confirm', choices: [
          { label: 'Надіслати', label_uk: 'Надіслати', label_ru: 'Отправить', value: 'send', nextNodeId: 'create_request' },
          { label: 'Змінити', label_uk: 'Змінити', label_ru: 'Изменить', value: 'edit', nextNodeId: 'edit_msg' }
        ] } },
        { id: 'edit_msg', type: 'MESSAGE', content: { text: 'Давайте виправимо заявку.', text_uk: 'Давайте виправимо заявку.', text_ru: 'Давайте исправим заявку.' }, nextNodeId: 'ask_brand' },
        { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'BUY' }, nextNodeId: 'confirm_done' },
        { id: 'confirm_done', type: 'MESSAGE', content: { text: '✅ Запит створено. Звʼяжемося найближчим часом.', text_uk: '✅ Запит створено. Звʼяжемося найближчим часом.', text_ru: '✅ Запрос создан. Свяжемся в ближайшее время.' } }
      ]
    }
  },
  {
    id: 'tpl_status_support',
    name: 'Підтримка / Статус (UA/RU)',
    category: 'SUPPORT',
    description: 'Перевіряє статус заявки або створює звернення в підтримку.',
    isPremium: false,
    structure: {
      triggerCommand: 'support',
      keywords: ['status', 'support', 'статус', 'підтримка', 'поддержка'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'ask_lookup' },
        { id: 'ask_lookup', type: 'QUESTION_TEXT', content: { text: 'Введіть ID заявки або телефон.', text_uk: 'Введіть ID заявки або телефон.', text_ru: 'Введите ID заявки или телефон.', variableName: 'lookup' }, nextNodeId: 'lookup_action' },
        { id: 'lookup_action', type: 'ACTION', content: { actionType: 'LOOKUP_REQUEST', lookupVar: 'lookup' }, nextNodeId: 'check_found' },
        { id: 'check_found', type: 'CONDITION', content: { conditionVariable: 'lookup_found', conditionOperator: 'HAS_VALUE', trueNodeId: 'show_status', falseNodeId: 'not_found' } },
        { id: 'show_status', type: 'MESSAGE', content: { text: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}', text_uk: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}', text_ru: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}' } },
        { id: 'not_found', type: 'MESSAGE', content: { text: 'Не знайшли заявку. Створюємо запит у підтримку...', text_uk: 'Не знайшли заявку. Створюємо запит у підтримку...', text_ru: 'Не нашли заявку. Создаем запрос в поддержку...' }, nextNodeId: 'support_lead' },
        { id: 'support_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'SUPPORT' }, nextNodeId: 'notify_admin' },
        { id: 'notify_admin', type: 'ACTION', content: { actionType: 'NOTIFY_ADMIN', text: '🔔 Запит у підтримку від {lookup}' } }
      ]
    }
  },
  {
    id: 'tpl_info_rules',
    name: 'Інформація та правила (UA)',
    category: 'SUPPORT',
    description: 'Пояснює як працює сервіс, правила та FAQ.',
    isPremium: false,
    structure: {
      triggerCommand: 'info',
      keywords: ['info', 'інформація', 'правила', 'faq'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'info' },
        {
          id: 'info',
          type: 'MESSAGE',
          content: {
            text: 'ℹ️ CarTié: як це працює\\n\\n1) Купити авто: заповнюєте запит, отримуєте релевантні варіанти.\\n2) Продати авто: надсилаєте дані та фото, менеджер опрацьовує.\\n3) Підтримка: звернення ведеться в тікетах.\\n\\nПравила:\\n• Інвентар єдиний для платформи.\\n• Контакти не публікуються у каналі/B2B-постах; контакти тільки адміну.\\n\\nFAQ:\\n• Де статус запиту? Напишіть у Підтримку або відкрийте MiniApp.\\n• Чи можна змінити запит? Так, перед відправкою доступно редагування полів.',
            text_uk: 'ℹ️ CarTié: як це працює\\n\\n1) Купити авто: заповнюєте запит, отримуєте релевантні варіанти.\\n2) Продати авто: надсилаєте дані та фото, менеджер опрацьовує.\\n3) Підтримка: звернення ведеться в тікетах.\\n\\nПравила:\\n• Інвентар єдиний для платформи.\\n• Контакти не публікуються у каналі/B2B-постах; контакти тільки адміну.\\n\\nFAQ:\\n• Де статус запиту? Напишіть у Підтримку або відкрийте MiniApp.\\n• Чи можна змінити запит? Так, перед відправкою доступно редагування полів.',
            text_ru: 'ℹ️ CarTié: як це працює\\n\\n1) Купити авто: заповнюєте запит, отримуєте релевантні варіанти.\\n2) Продати авто: надсилаєте дані та фото, менеджер опрацьовує.\\n3) Підтримка: звернення ведеться в тікетах.\\n\\nПравила:\\n• Інвентар єдиний для платформи.\\n• Контакти не публікуються у каналі/B2B-постах; контакти тільки адміну.\\n\\nFAQ:\\n• Де статус запиту? Напишіть у Підтримку або відкрийте MiniApp.\\n• Чи можна змінити запит? Так, перед відправкою доступно редагування полів.'
          }
        }
      ]
    }
  },
  {
    id: 'tpl_lang_select',
    name: 'Вибір мови',
    category: 'SUPPORT',
    description: 'Встановлює бажану мову сесії.',
    isPremium: false,
    structure: {
      triggerCommand: 'lang',
      keywords: ['lang', 'language', 'мова', 'язык'],
      entryNodeId: 'start',
      nodes: [
        { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'choose_lang' },
        { id: 'choose_lang', type: 'QUESTION_CHOICE', content: { text: 'Оберіть мову', text_uk: 'Оберіть мову', text_ru: 'Выберите язык', variableName: 'language', choices: [
          { label: 'Українська', label_uk: 'Українська', label_ru: 'Украинский', value: 'UK', nextNodeId: 'set_lang' },
          { label: 'Російська', label_uk: 'Російська', label_ru: 'Русский', value: 'RU', nextNodeId: 'set_lang' }
        ] } },
        { id: 'set_lang', type: 'ACTION', content: { actionType: 'SET_LANG' }, nextNodeId: 'confirm' },
        { id: 'confirm', type: 'MESSAGE', content: { text: 'Мову змінено ✅', text_uk: 'Мову змінено ✅', text_ru: 'Язык обновлен ✅' } }
      ]
    }
  }
];
