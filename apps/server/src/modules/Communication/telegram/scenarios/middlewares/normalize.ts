import type { PipelineContext, PipelineMiddleware } from '../../core/types.js';
import { normalizeBrand } from '../../../../Inventory/normalization/normalizeBrand.js';
import { normalizeCity } from '../../../../Inventory/normalization/normalizeCity.js';
import { normalizeModel } from '../../../../Inventory/normalization/normalizeModel.js';
import { normalizePhone } from '../../../../Inventory/normalization/normalizePhone.js';

const extractPhoneCandidate = (text?: string | null) => {
  if (!text) return undefined;
  const match = text.match(/\+?\d[\d\s\-]{6,}\d/);
  return match ? match[0] : undefined;
};

export const normalize: PipelineMiddleware = async (ctx: PipelineContext, next) => {
  const message = ctx.update?.message;
  const text = message?.text || message?.caption || '';
  const phoneRaw = message?.contact?.phone_number || extractPhoneCandidate(text);
  const phone = normalizePhone(phoneRaw || undefined);
  const state = ctx.session?.state || '';

  if (!ctx.normalized) ctx.normalized = {};
  if (phone) ctx.normalized.phone = phone;

  if (text && state.includes('BRAND')) {
    ctx.normalized.brand = await normalizeBrand(text, { companyId: ctx.companyId });
  }
  if (text && state.includes('MODEL')) {
    ctx.normalized.model = await normalizeModel(text, { companyId: ctx.companyId });
  }
  if (text && state.includes('CITY')) {
    ctx.normalized.city = await normalizeCity(text, { companyId: ctx.companyId });
  }

  await next();
};
