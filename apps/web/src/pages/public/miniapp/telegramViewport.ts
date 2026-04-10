const setInsetVars = (prefix: string, inset?: { top?: number; right?: number; bottom?: number; left?: number } | null) => {
  if (!inset || typeof inset !== 'object') return;
  document.documentElement.style.setProperty(`${prefix}-top`, `${Number(inset.top || 0)}px`);
  document.documentElement.style.setProperty(`${prefix}-right`, `${Number(inset.right || 0)}px`);
  document.documentElement.style.setProperty(`${prefix}-bottom`, `${Number(inset.bottom || 0)}px`);
  document.documentElement.style.setProperty(`${prefix}-left`, `${Number(inset.left || 0)}px`);
};

const setViewportVars = (tg?: any) => {
  const viewportHeight = Number(tg?.viewportHeight) > 0 ? Number(tg.viewportHeight) : window.innerHeight;
  const stableHeight = Number(tg?.viewportStableHeight) > 0 ? Number(tg.viewportStableHeight) : viewportHeight;

  document.documentElement.style.setProperty('--tg-viewport-height', `${viewportHeight}px`);
  document.documentElement.style.setProperty('--tg-viewport-stable-height', `${stableHeight}px`);
  setInsetVars('--tg-safe-area', tg?.safeAreaInset);
  setInsetVars('--tg-content-safe-area', tg?.contentSafeAreaInset || tg?.safeAreaInset);
  document.body.style.height = `${stableHeight}px`;
};

export const initTelegramViewport = (tg?: any) => {
  document.body.classList.add('telegram-miniapp');

  const onViewportChanged = () => setViewportVars(tg);
  const onResize = () => setViewportVars(tg);
  const onSafeAreaChanged = () => setViewportVars(tg);

  tg?.ready?.();
  tg?.expand?.();
  tg?.enableClosingConfirmation?.();

  setViewportVars(tg);

  tg?.onEvent?.('viewportChanged', onViewportChanged);
  tg?.onEvent?.('safeAreaChanged', onSafeAreaChanged);
  tg?.onEvent?.('contentSafeAreaChanged', onSafeAreaChanged);
  window.addEventListener('resize', onResize);

  return () => {
    tg?.offEvent?.('viewportChanged', onViewportChanged);
    tg?.offEvent?.('safeAreaChanged', onSafeAreaChanged);
    tg?.offEvent?.('contentSafeAreaChanged', onSafeAreaChanged);
    window.removeEventListener('resize', onResize);
    document.body.classList.remove('telegram-miniapp');
    document.body.style.height = '';
  };
};
