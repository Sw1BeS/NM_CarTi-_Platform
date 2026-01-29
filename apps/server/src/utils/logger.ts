const format = (level: string, message: any, meta?: any) => {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}]`;
  if (meta) return `${base} ${message} | ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`;
  return `${base} ${message}`;
};

export const logger = {
  info: (message: any, meta?: any) => console.log(format('INFO', message, meta)),
  warn: (message: any, meta?: any) => console.warn(format('WARN', message, meta)),
  error: (message: any, meta?: any) => console.error(format('ERROR', message, meta)),
  debug: (message: any, meta?: any) => console.debug(format('DEBUG', message, meta)),
};
