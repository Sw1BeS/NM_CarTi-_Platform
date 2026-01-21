import { Language } from './types';

/**
 * Empty State, Loading, and Error translations
 * Organized separately for better maintainability
 */
export const EMPTY_STATE_TRANSLATIONS: Record<Language, Record<string, string>> = {
    EN: {
        // Empty States
        'empty.no_requests': 'No requests yet',
        'empty.no_requests_desc': 'Create your first B2B request to get started',
        'empty.no_leads': 'No leads captured yet',
        'empty.no_leads_desc': 'Leads will appear here when customers interact with your bots',
        'empty.no_inventory': 'Your inventory is empty',
        'empty.no_inventory_desc': 'Add your first car to start showcasing your vehicles',
        'empty.no_content': 'No content scheduled',
        'empty.no_content_desc': 'Create and schedule posts for your Telegram channels',
        'empty.no_bots': 'No bots configured',
        'empty.no_bots_desc': 'Set up your first Telegram bot to automate customer interactions',
        'empty.no_scenarios': 'No scenarios available',
        'empty.no_scenarios_desc': 'Create custom bot scenarios or use templates from marketplace',
        'empty.no_templates': 'No templates found',
        'empty.no_templates_desc': 'Browse the marketplace to find useful templates',
        'empty.no_channels': 'No channel posts',
        'empty.no_channels_desc': 'Publish your first post to your Telegram channel',
        'empty.click_to_create': 'Click the button below to create one',
        'empty.get_started': 'Get started by creating your first item',

        // Loading States
        'loading.requests': 'Loading requests...',
        'loading.leads': 'Loading leads...',
        'loading.inventory': 'Loading inventory...',
        'loading.content': 'Loading content...',
        'loading.bots': 'Loading bots...',
        'loading.scenarios': 'Loading scenarios...',
        'loading.templates': 'Loading templates...',
        'loading.please_wait': 'Please wait...',
        'loading.data': 'Loading data...',

        // Error Messages
        'error.load_failed': 'Failed to load data',
        'error.load_failed_desc': 'Unable to load the requested information. Please check your connection and try again.',
        'error.save_failed': 'Failed to save changes',
        'error.delete_failed': 'Failed to delete item',
        'error.try_again': 'Try again',
        'error.network': 'Network error',
        'error.network_desc': 'Unable to reach the server. Please check your internet connection.',
        'error.unexpected': 'Something went wrong',
        'error.unexpected_desc': 'An unexpected error occurred. Please try refreshing the page.',
        'error.refresh_page': 'Refresh page',
    },

    UK: {
        // Empty States
        'empty.no_requests': 'Ще немає запитів',
        'empty.no_requests_desc': 'Створіть перший B2B запит для початку роботи',
        'empty.no_leads': 'Ще не зібрано лідів',
        'empty.no_leads_desc': 'Ліди з\'являться тут після взаємодії клієнтів з ботами',
        'empty.no_inventory': 'Ваш інвентар порожній',
        'empty.no_inventory_desc': 'Додайте перший автомобіль для демонстрації',
        'empty.no_content': 'Немає запланованого контенту',
        'empty.no_content_desc': 'Створіть та заплануйте пости для Telegram каналів',
        'empty.no_bots': 'Не налаштовано ботів',
        'empty.no_bots_desc': 'Налаштуйте першого Telegram бота для автоматизації',
        'empty.no_scenarios': 'Немає доступних сценаріїв',
        'empty.no_scenarios_desc': 'Створіть власні сценарії або використайте шаблони',
        'empty.no_templates': 'Шаблони не знайдено',
        'empty.no_templates_desc': 'Переглядайте marketplace для корисних шаблонів',
        'empty.no_channels': 'Немає постів в каналі',
        'empty.no_channels_desc': 'Опублікуйте перший пост у ваш Telegram канал',
        'empty.click_to_create': 'Натисніть кнопку нижче для створення',
        'empty.get_started': 'Почніть зі створення першого елементу',

        // Loading States
        'loading.requests': 'Завантаження запитів...',
        'loading.leads': 'Завантаження лідів...',
        'loading.inventory': 'Завантаження інвентарю...',
        'loading.content': 'Завантаження контенту...',
        'loading.bots': 'Завантаження ботів...',
        'loading.scenarios': 'Завантаження сценаріїв...',
        'loading.templates': 'Завантаження шаблонів...',
        'loading.please_wait': 'Зачекайте, будь ласка...',
        'loading.data': 'Завантаження даних...',

        // Error Messages
        'error.load_failed': 'Не вдалось завантажити дані',
        'error.load_failed_desc': 'Не можемо завантажити інформацію. Перевірте підключення та спробуйте ще раз.',
        'error.save_failed': 'Не вдалось зберегти зміни',
        'error.delete_failed': 'Не вдалось видалити елемент',
        'error.try_again': 'Спробувати ще раз',
        'error.network': 'Помилка мережі',
        'error.network_desc': 'Не можемо зв\'язатися з сервером. Перевірте інтернет-з\'єднання.',
        'error.unexpected': 'Щось пішло не так',
        'error.unexpected_desc': 'Виникла несподівана помилка. Спробуйте оновити сторінку.',
        'error.refresh_page': 'Оновити сторінку',
    },

    RU: {
        // Empty States
        'empty.no_requests': 'Нет запросов',
        'empty.no_requests_desc': 'Создайте первый B2B запрос для начала работы',
        'empty.no_leads': 'Лиды не собраны',
        'empty.no_leads_desc': 'Лиды появятся после взаимодействия клиентов с ботами',
        'empty.no_inventory': 'Ваш инвентарь пуст',
        'empty.no_inventory_desc': 'Добавьте первый автомобиль для демонстрации',
        'empty.no_content': 'Нет запланированного контента',
        'empty.no_content_desc': 'Создайте и запланируйте посты для Telegram каналов',
        'empty.no_bots': 'Боты не настроены',
        'empty.no_bots_desc': 'Настройте первого Telegram бота для автоматизации',
        'empty.no_scenarios': 'Нет доступных сценариев',
        'empty.no_scenarios_desc': 'Создайте свои сценарии или используйте шаблоны',
        'empty.no_templates': 'Шаблоны не найдены',
        'empty.no_templates_desc': 'Просмотрите marketplace для полезных шаблонов',
        'empty.no_channels': 'Нет постов в канале',
        'empty.no_channels_desc': 'Опубликуйте первый пост в ваш Telegram канал',
        'empty.click_to_create': 'Нажмите кнопку ниже для создания',
        'empty.get_started': 'Начните с создания первого элемента',

        // Loading States
        'loading.requests': 'Загрузка запросов...',
        'loading.leads': 'Загрузка лидов...',
        'loading.inventory': 'Загрузка инвентаря...',
        'loading.content': 'Загрузка контента...',
        'loading.bots': 'Загрузка ботов...',
        'loading.scenarios': 'Загрузка сценариев...',
        'loading.templates': 'Загрузка шаблонов...',
        'loading.please_wait': 'Пожалуйста, подождите...',
        'loading.data': 'Загрузка данных...',

        // Error Messages
        'error.load_failed': 'Не удалось загрузить данные',
        'error.load_failed_desc': 'Не можем загрузить информацию. Проверьте подключение и попробуйте снова.',
        'error.save_failed': 'Не удалось сохранить изменения',
        'error.delete_failed': 'Не удалось удалить элемент',
        'error.try_again': 'Попробовать снова',
        'error.network': 'Ошибка сети',
        'error.network_desc': 'Не можем связаться с сервером. Проверьте интернет-соединение.',
        'error.unexpected': 'Что-то пошло не так',
        'error.unexpected_desc': 'Произошла неожиданная ошибка. Попробуйте обновить страницу.',
        'error.refresh_page': 'Обновить страницу',
    }
};
