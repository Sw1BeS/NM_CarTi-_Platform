export type RequestSuccessSurfaceMode = 'LEAD' | 'B2B';

export type RequestSuccessActionId =
  | 'MY_REQUESTS'
  | 'CATALOG'
  | 'MANAGER'
  | 'B2B_ACTIVITY'
  | 'B2B_REQUESTS'
  | 'B2B_SUPPORT'
  | 'HOME';

export type RequestSuccessAction = {
  id: RequestSuccessActionId;
  label: string;
  description: string;
  primary?: boolean;
};

export type RequestSuccessContent = {
  title: string;
  message: string;
  actions: RequestSuccessAction[];
};

export type RequestSuccessOptions = {
  canViewPrivateRequests?: boolean;
};

export const resolveRequestSuccessContent = (
  surfaceMode: RequestSuccessSurfaceMode,
  options: RequestSuccessOptions = {}
): RequestSuccessContent => {
  if (surfaceMode === 'B2B') {
    return {
      title: 'Запит відправлено',
      message: 'B2B запит збережено. Ви можете відстежити статус, повернутись до запитів мережі або написати підтримці.',
      actions: [
        {
          id: 'B2B_ACTIVITY',
          label: 'Активність / статуси',
          description: 'Мої B2B запити, пропозиції і коментарі',
          primary: true
        },
        {
          id: 'B2B_REQUESTS',
          label: 'Запити на авто',
          description: 'Повернутись до active dealer exchange'
        },
        {
          id: 'B2B_SUPPORT',
          label: 'Підтримка',
          description: 'Написати адміністратору мережі'
        },
        {
          id: 'HOME',
          label: 'На головну',
          description: 'Повернутись до порталу'
        }
      ]
    };
  }

  if (options.canViewPrivateRequests === false) {
    return {
      title: 'Запит відправлено',
      message: 'Ми зберегли заявку. Далі можна повернутись до каталогу або написати менеджеру.',
      actions: [
        {
          id: 'CATALOG',
          label: 'Повернутись до каталогу',
          description: 'Авто в наявності та в дорозі',
          primary: true
        },
        {
          id: 'MANAGER',
          label: 'Написати менеджеру',
          description: 'Контакти і прямий зв’язок'
        },
        {
          id: 'HOME',
          label: 'На головну',
          description: 'Повернутись до головного меню'
        }
      ]
    };
  }

  return {
    title: 'Запит відправлено',
    message: 'Ми зберегли заявку. Далі можна перевірити статус, повернутись до каталогу або написати менеджеру.',
    actions: [
      {
        id: 'MY_REQUESTS',
        label: 'Переглянути мої запити',
        description: 'Статуси, історія і відповіді менеджера',
        primary: true
      },
      {
        id: 'CATALOG',
        label: 'Повернутись до каталогу',
        description: 'Авто в наявності та в дорозі'
      },
      {
        id: 'MANAGER',
        label: 'Написати менеджеру',
        description: 'Контакти і прямий зв’язок'
      },
      {
        id: 'HOME',
        label: 'На головну',
        description: 'Повернутись до головного меню'
      }
    ]
  };
};
