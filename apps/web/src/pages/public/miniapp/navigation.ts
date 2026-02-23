export const pushViewHistory = <T extends string>(history: T[], nextView: T) => {
  const last = history[history.length - 1];
  if (last !== nextView) {
    history.push(nextView);
  }
  return history;
};

export const popViewHistory = <T extends string>(history: T[], fallback: T) => {
  if (history.length > 1) {
    history.pop();
    return history[history.length - 1] || fallback;
  }
  return fallback;
};
