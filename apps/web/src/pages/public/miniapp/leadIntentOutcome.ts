export type LeadIntentResponse = {
  ok?: boolean;
  closeMiniApp?: boolean;
  contactRequested?: boolean;
  contactRequestFailed?: boolean;
  openBotUrl?: string;
};

export type LeadIntentOutcome = {
  shouldCloseMiniApp: boolean;
  message?: string;
  openBotUrl?: string;
};

export const resolveLeadIntentOutcome = (response: LeadIntentResponse): LeadIntentOutcome => {
  if (response.contactRequestFailed) {
    return {
      shouldCloseMiniApp: false,
      message: 'Запит збережено. Відкрийте чат з ботом, щоб передати контакт через Telegram.',
      openBotUrl: response.openBotUrl
    };
  }

  return {
    shouldCloseMiniApp: Boolean(response.closeMiniApp)
  };
};
