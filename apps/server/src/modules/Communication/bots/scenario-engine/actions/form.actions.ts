import { sendMessage } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';

export const FORM_SKIP_TEXT = 'Пропустити';
const FORM_DONE_TEXT = 'Готово';

const SKIP_TOKENS = new Set(['пропустити', 'skip', '/skip']);
const DONE_TOKENS = new Set(['готово', 'done', '/done']);

export type FormFieldType = 'text' | 'contact' | 'photo';

export type FormFieldDefinition = {
  key: string;
  label: string;
  prompt: string;
  optional?: boolean;
  type?: FormFieldType;
  minPhotos?: number;
  maxPhotos?: number;
  quickReplies?: string[];
  manualLabel?: string;
};

export type ActiveFormState = {
  formId: string;
  namespace: string;
  title: string;
  fields: FormFieldDefinition[];
  values: Record<string, any>;
  index: number;
  mode: 'fill' | 'summary' | 'edit_select' | 'edit_field';
  editKey?: string;
  confirmAction?: string;
  cancelAction?: string;
  createdAt: string;
  updatedAt: string;
};

export type FormSubmission = {
  formId: string;
  namespace: string;
  values: Record<string, any>;
  confirmAction?: string;
  cancelAction?: string;
  status: 'CONFIRMED' | 'CANCELLED';
  at: string;
};

type FormContext = {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
};

type FormResult = {
  handled: boolean;
  confirmed?: boolean;
  cancelled?: boolean;
  submission?: FormSubmission;
};

const nowIso = () => new Date().toISOString();

const getTextInput = (update: any) => String(update?.message?.text || '').trim();
const getContactInput = (update: any) => String(update?.message?.contact?.phone_number || '').trim();
const getPhotoInput = (update: any) => String(update?.message?.photo?.[update.message.photo.length - 1]?.file_id || '').trim();

const normalizeToken = (value: string) => value.trim().toLowerCase();

const isSkip = (value: string) => SKIP_TOKENS.has(normalizeToken(value));
const isDone = (value: string) => DONE_TOKENS.has(normalizeToken(value));

const getActiveForm = (vars: Record<string, any>): ActiveFormState | null => {
  const form = vars.__form;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return null;
  if (!Array.isArray(form.fields)) return null;
  return form as ActiveFormState;
};

const setForm = (vars: Record<string, any>, form: ActiveFormState | null) => {
  if (!form) {
    delete vars.__form;
    return;
  }
  vars.__form = form;
};

const findField = (form: ActiveFormState, key?: string) => {
  if (!key) return null;
  return form.fields.find((field) => field.key === key) || null;
};

const currentField = (form: ActiveFormState) => {
  if (form.mode === 'edit_field' && form.editKey) {
    return findField(form, form.editKey);
  }
  return form.fields[form.index] || null;
};

const formatValue = (field: FormFieldDefinition, value: any) => {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'photo') {
    const count = Array.isArray(value) ? value.length : 0;
    return count > 0 ? `${count} фото` : '—';
  }
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value);
};

const buildSummaryText = (form: ActiveFormState) => {
  const lines = form.fields.map((field) => `• ${field.label}: ${formatValue(field, form.values[field.key])}`);
  return [
    `📋 ${form.title}`,
    '',
    ...lines,
    '',
    'Підтвердити відправку?'
  ].join('\n');
};

const summaryKeyboard = {
  inline_keyboard: [[
    { text: 'Підтвердити', callback_data: 'FORM:CONFIRM' },
    { text: 'Змінити', callback_data: 'FORM:EDIT' },
    { text: 'Скасувати', callback_data: 'FORM:CANCEL' }
  ]]
};

const editKeyboard = (form: ActiveFormState) => ({
  inline_keyboard: [
    ...form.fields.map((field) => [
      { text: `Змінити ${field.label}`, callback_data: `FORM:EDIT:${field.key}` }
    ]),
    [{ text: '⬅️ Назад до підсумку', callback_data: 'FORM:SUMMARY' }]
  ]
});

const buildFieldKeyboard = (field: FormFieldDefinition) => {
  const rows: any[][] = [];

  const quickReplies = Array.isArray(field.quickReplies)
    ? field.quickReplies.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 9)
    : [];

  for (let i = 0; i < quickReplies.length; i += 3) {
    rows.push(quickReplies.slice(i, i + 3).map((label) => ({ text: label })));
  }

  if (field.manualLabel) {
    rows.push([{ text: field.manualLabel }]);
  }

  if (field.type === 'contact') {
    rows.push([{ text: 'Надіслати контакт', request_contact: true }]);
  }

  if (field.type === 'photo') {
    rows.push([{ text: FORM_DONE_TEXT }]);
  }

  if (field.optional) {
    rows.push([{ text: FORM_SKIP_TEXT }]);
  }

  return rows.length ? { keyboard: rows, resize_keyboard: true } : undefined;
};

const LEADBUY_POPULAR_MODELS: Record<string, string[]> = {
  bmw: ['X5', 'X3', '3 Series'],
  audi: ['Q7', 'Q5', 'A6'],
  mercedes: ['GLE', 'E-Class', 'C-Class'],
  toyota: ['Camry', 'RAV4', 'Corolla'],
  volkswagen: ['Passat', 'Touareg', 'Tiguan'],
  skoda: ['Octavia', 'Kodiaq', 'Superb'],
  honda: ['CR-V', 'Civic', 'Accord'],
  nissan: ['Qashqai', 'X-Trail', 'Leaf'],
  kia: ['Sportage', 'Sorento', 'Ceed'],
  hyundai: ['Tucson', 'Santa Fe', 'Elantra']
};

const applyDynamicFieldOptions = (form: ActiveFormState, field: FormFieldDefinition) => {
  if (form.namespace !== 'LEADBUY' || field.key !== 'model') return field;
  if (field.quickReplies && field.quickReplies.length > 0) return field;

  const brand = String(form.values.brand || '').trim().toLowerCase();
  const matched = Object.entries(LEADBUY_POPULAR_MODELS).find(([key]) => brand.includes(key));
  if (!matched) return field;

  field.quickReplies = matched[1];
  field.manualLabel = field.manualLabel || 'Ввести вручну';
  return field;
};

const sendFieldPrompt = async (ctx: FormContext, form: ActiveFormState, field: FormFieldDefinition) => {
  applyDynamicFieldOptions(form, field);
  const keyboard = buildFieldKeyboard(field);
  await sendMessage(ctx.bot, ctx.chatId, field.prompt, keyboard);
};

const sendSummary = async (ctx: FormContext, form: ActiveFormState) => {
  await sendMessage(ctx.bot, ctx.chatId, buildSummaryText(form), summaryKeyboard);
};

const commitSubmission = (ctx: FormContext, form: ActiveFormState, status: 'CONFIRMED' | 'CANCELLED') => {
  const submission: FormSubmission = {
    formId: form.formId,
    namespace: form.namespace,
    values: { ...form.values },
    confirmAction: form.confirmAction,
    cancelAction: form.cancelAction,
    status,
    at: nowIso()
  };
  ctx.vars.__formSubmission = submission;
  setForm(ctx.vars, null);
  return submission;
};

const goNext = async (ctx: FormContext, form: ActiveFormState): Promise<FormResult> => {
  if (form.mode === 'edit_field') {
    form.mode = 'summary';
    form.editKey = undefined;
    form.updatedAt = nowIso();
    setForm(ctx.vars, form);
    await sendSummary(ctx, form);
    return { handled: true };
  }

  const nextIndex = form.index + 1;
  if (nextIndex >= form.fields.length) {
    form.mode = 'summary';
    form.updatedAt = nowIso();
    setForm(ctx.vars, form);
    await sendSummary(ctx, form);
    return { handled: true };
  }

  form.index = nextIndex;
  form.updatedAt = nowIso();
  setForm(ctx.vars, form);

  const field = currentField(form);
  if (field) {
    await sendFieldPrompt(ctx, form, field);
  }
  return { handled: true };
};

export const startFormFlow = async (
  ctx: FormContext,
  input: {
    formId: string;
    namespace: string;
    title: string;
    fields: FormFieldDefinition[];
    initialValues?: Record<string, any>;
    confirmAction?: string;
    cancelAction?: string;
  }
) => {
  const form: ActiveFormState = {
    formId: input.formId,
    namespace: input.namespace,
    title: input.title,
    fields: input.fields,
    values: { ...(input.initialValues || {}) },
    index: 0,
    mode: 'fill',
    confirmAction: input.confirmAction,
    cancelAction: input.cancelAction,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  setForm(ctx.vars, form);

  const field = currentField(form);
  if (!field) {
    form.mode = 'summary';
    setForm(ctx.vars, form);
    await sendSummary(ctx, form);
    return;
  }

  await sendFieldPrompt(ctx, form, field);
};

export const hasActiveForm = (vars: Record<string, any>) => Boolean(getActiveForm(vars));

export const consumeFormSubmission = (vars: Record<string, any>): FormSubmission | null => {
  const raw = vars.__formSubmission;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  delete vars.__formSubmission;
  return raw as FormSubmission;
};

export const handleFormMessageInput = async (ctx: FormContext & { update: any }): Promise<FormResult> => {
  const form = getActiveForm(ctx.vars);
  if (!form) return { handled: false };

  if (form.mode === 'summary' || form.mode === 'edit_select') {
    await sendMessage(ctx.bot, ctx.chatId, 'Скористайтеся кнопками: Підтвердити / Змінити / Скасувати.');
    return { handled: true };
  }

  const field = currentField(form);
  if (!field) {
    form.mode = 'summary';
    setForm(ctx.vars, form);
    await sendSummary(ctx, form);
    return { handled: true };
  }

  const textInput = getTextInput(ctx.update);
  const contactInput = getContactInput(ctx.update);
  const photoInput = getPhotoInput(ctx.update);

  if (field.type === 'photo') {
    const maxPhotos = Math.max(1, Number(field.maxPhotos || 8));
    const minPhotos = Math.max(0, Number(field.minPhotos || (field.optional ? 0 : 1)));
    const currentPhotos = Array.isArray(form.values[field.key]) ? [...form.values[field.key]] : [];

    if (photoInput) {
      if (!currentPhotos.includes(photoInput)) {
        currentPhotos.push(photoInput);
      }
      form.values[field.key] = currentPhotos.slice(0, maxPhotos);
      form.updatedAt = nowIso();
      setForm(ctx.vars, form);

      if (form.values[field.key].length >= maxPhotos) {
        return goNext(ctx, form);
      }

      await sendMessage(ctx.bot, ctx.chatId, `Фото збережено (${form.values[field.key].length}/${maxPhotos}). Надішліть ще або натисніть "${FORM_DONE_TEXT}".`);
      return { handled: true };
    }

    if (textInput && isSkip(textInput) && field.optional) {
      form.values[field.key] = [];
      form.updatedAt = nowIso();
      setForm(ctx.vars, form);
      return goNext(ctx, form);
    }

    if (textInput && isDone(textInput)) {
      const count = Array.isArray(form.values[field.key]) ? form.values[field.key].length : 0;
      if (count < minPhotos) {
        await sendMessage(ctx.bot, ctx.chatId, `Потрібно щонайменше ${minPhotos} фото.`);
        return { handled: true };
      }
      return goNext(ctx, form);
    }

    await sendMessage(ctx.bot, ctx.chatId, `Надішліть фото та натисніть "${FORM_DONE_TEXT}".`);
    return { handled: true };
  }

  if (field.type === 'contact') {
    if (contactInput) {
      form.values[field.key] = contactInput;
      form.updatedAt = nowIso();
      setForm(ctx.vars, form);
      return goNext(ctx, form);
    }

    if (textInput && isSkip(textInput) && field.optional) {
      form.values[field.key] = null;
      form.updatedAt = nowIso();
      setForm(ctx.vars, form);
      return goNext(ctx, form);
    }

    if (textInput && textInput.length >= 6) {
      form.values[field.key] = textInput;
      form.updatedAt = nowIso();
      setForm(ctx.vars, form);
      return goNext(ctx, form);
    }

    await sendMessage(ctx.bot, ctx.chatId, 'Надішліть контакт або введіть номер телефону.');
    return { handled: true };
  }

  if (textInput && isSkip(textInput) && field.optional) {
    form.values[field.key] = null;
    form.updatedAt = nowIso();
    setForm(ctx.vars, form);
    return goNext(ctx, form);
  }

  if (!textInput) {
    await sendMessage(ctx.bot, ctx.chatId, 'Введіть значення поля.');
    return { handled: true };
  }

  if (field.manualLabel && textInput === field.manualLabel) {
    await sendMessage(ctx.bot, ctx.chatId, 'Введіть значення вручну.');
    return { handled: true };
  }

  form.values[field.key] = textInput;
  form.updatedAt = nowIso();
  setForm(ctx.vars, form);
  return goNext(ctx, form);
};

export const handleFormCallbackInput = async (ctx: FormContext & { callbackData: string }): Promise<FormResult> => {
  const form = getActiveForm(ctx.vars);
  if (!form) return { handled: false };
  if (!ctx.callbackData.startsWith('FORM:')) return { handled: false };

  if (ctx.callbackData === 'FORM:CONFIRM') {
    const submission = commitSubmission(ctx, form, 'CONFIRMED');
    await sendMessage(ctx.bot, ctx.chatId, '✅ Підтверджено. Дякуємо!');
    return { handled: true, confirmed: true, submission };
  }

  if (ctx.callbackData === 'FORM:CANCEL') {
    const submission = commitSubmission(ctx, form, 'CANCELLED');
    await sendMessage(ctx.bot, ctx.chatId, '❌ Скасовано.');
    return { handled: true, cancelled: true, submission };
  }

  if (ctx.callbackData === 'FORM:EDIT') {
    form.mode = 'edit_select';
    form.updatedAt = nowIso();
    setForm(ctx.vars, form);
    await sendMessage(ctx.bot, ctx.chatId, 'Оберіть поле для редагування:', editKeyboard(form));
    return { handled: true };
  }

  if (ctx.callbackData === 'FORM:SUMMARY') {
    form.mode = 'summary';
    form.editKey = undefined;
    form.updatedAt = nowIso();
    setForm(ctx.vars, form);
    await sendSummary(ctx, form);
    return { handled: true };
  }

  if (ctx.callbackData.startsWith('FORM:EDIT:')) {
    const key = ctx.callbackData.slice('FORM:EDIT:'.length);
    const field = findField(form, key);
    if (!field) {
      await sendMessage(ctx.bot, ctx.chatId, 'Поле не знайдено.');
      return { handled: true };
    }

    form.mode = 'edit_field';
    form.editKey = field.key;
    form.updatedAt = nowIso();
    setForm(ctx.vars, form);
    await sendFieldPrompt(ctx, form, field);
    return { handled: true };
  }

  return { handled: false };
};
