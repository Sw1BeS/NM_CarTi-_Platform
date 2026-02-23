const setViewportVars = (tg?: any) => {
  const viewportHeight = Number(tg?.viewportHeight) > 0 ? Number(tg.viewportHeight) : window.innerHeight;
  const stableHeight = Number(tg?.viewportStableHeight) > 0 ? Number(tg.viewportStableHeight) : viewportHeight;

  document.documentElement.style.setProperty('--tg-viewport-height', `${viewportHeight}px`);
  document.documentElement.style.setProperty('--tg-viewport-stable-height', `${stableHeight}px`);
  document.body.style.height = `${stableHeight}px`;
};

export const initTelegramViewport = (tg?: any) => {
  document.body.classList.add('telegram-miniapp');

  const onViewportChanged = () => setViewportVars(tg);
  const onResize = () => setViewportVars(tg);

  tg?.ready?.();
  tg?.expand?.();
  tg?.enableClosingConfirmation?.();
  try {
    tg?.disableVerticalSwipes?.();
  } catch {
    // unsupported on old Telegram clients
  }

  setViewportVars(tg);

  tg?.onEvent?.('viewportChanged', onViewportChanged);
  window.addEventListener('resize', onResize);

  return () => {
    tg?.offEvent?.('viewportChanged', onViewportChanged);
    window.removeEventListener('resize', onResize);
    document.body.classList.remove('telegram-miniapp');
    document.body.style.height = '';
  };
};
