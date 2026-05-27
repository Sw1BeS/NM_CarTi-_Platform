export type LeadIntentResponse = {
  ok?: boolean;
  closeMiniApp?: boolean;
  contactRequested?: boolean;
  contactActionRequired?: boolean;
  contactRequestFailed?: boolean;
  contactKnown?: boolean;
  openBotUrl?: string;
};

export type LeadIntentOutcome = {
  shouldCloseMiniApp: boolean;
  message?: string;
  openBotUrl?: string;
  contactActionRequired?: boolean;
};

export const resolveLeadIntentOutcome = (response: LeadIntentResponse): LeadIntentOutcome => {
  if (response.contactRequestFailed) {
    return {
      shouldCloseMiniApp: false,
      message: 'Запит збережено. Відкрийте чат з ботом, щоб передати контакт через Telegram.',
      openBotUrl: response.openBotUrl
    };
  }

  if (response.contactRequested || response.contactActionRequired) {
    return {
      shouldCloseMiniApp: Boolean(response.closeMiniApp),
      contactActionRequired: true,
      message: 'Запит збережено. Перейдіть у чат з ботом і натисніть кнопку передачі контакту, щоб менеджер отримав заявку.',
      openBotUrl: response.openBotUrl
    };
  }

  return {
    shouldCloseMiniApp: Boolean(response.closeMiniApp)
  };
};
