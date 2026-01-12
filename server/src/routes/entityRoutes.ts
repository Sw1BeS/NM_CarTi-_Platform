import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();
const adminRoles = ['ADMIN', 'SUPER_ADMIN'];
const editorRoles = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'];

router.use(authenticateToken);

const SLUG_RE = /^[a-z][a-z0-9-]{2,63}$/;
const KEY_RE  = /^[a-z][a-z0-9_]{1,63}$/;

function bad(res: any, code: number, message: string, details?: any) {
  return res.status(code).json({ ok: false, message, details });
}

async function getEntityBySlug(slug: string) {
  return prisma.entityDefinition.findFirst({
    where: { slug, status: 'ACTIVE' },
    include: { fields: { orderBy: { order: 'asc' } } }
  });
}

function coerceFieldValue(type: string, value: any) {
  if (value === null || value === undefined) return value;

  switch (type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }
    default:
      return value;
  }
}

function validateAndNormalizeData(fields: any[], inputData: any) {
  const data = (inputData && typeof inputData === 'object') ? { ...inputData } : {};
  const errors: any[] = [];

  for (const f of fields) {
    const v = data[f.key];

    if (f.required && (v === undefined || v === null || v === '')) {
      errors.push({ field: f.key, error: 'required' });
      continue;
    }

    if (v !== undefined) {
      data[f.key] = coerceFieldValue(f.type, v);
    }
  }

  return { data, errors };
}

// --- META ---
router.get('/meta', async (_req, res) => {
  const defs = await prisma.entityDefinition.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: { fields: { orderBy: { order: 'asc' } } }
  });
  res.json({ ok: true, definitions: defs });
});

// --- DEFINITIONS ---
router.post('/definitions', requireRole(adminRoles), async (req, res) => {
  const { slug, name, description, fields } = req.body || {};

  if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return bad(res, 400, 'Invalid slug. Use [a-z0-9-], min 3 chars.');
  }
  if (!name || typeof name !== 'string') {
    return bad(res, 400, 'Invalid name');
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return bad(res, 400, 'fields[] is required');
  }

  for (const f of fields) {
    if (!f.key || typeof f.key !== 'string' || !KEY_RE.test(f.key)) {
      return bad(res, 400, 'Invalid field key (use [a-z0-9_])', f);
    }
    if (!f.label || typeof f.label !== 'string') {
      return bad(res, 400, 'Invalid field label', f);
    }
    if (!f.type || typeof f.type !== 'string') {
      return bad(res, 400, 'Invalid field type', f);
    }
  }

  const created = await prisma.$transaction(async (tx: any) => {
    const def = await tx.entityDefinition.create({
      data: { slug, name, description: description || null }
    });

    await tx.entityField.createMany({
      data: fields.map((f: any, idx: number) => ({
        entityId: def.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: !!f.required,
        order: Number.isFinite(Number(f.order)) ? Number(f.order) : idx,
        config: f.config ?? null
      }))
    });

    return tx.entityDefinition.findUnique({
      where: { id: def.id },
      include: { fields: { orderBy: { order: 'asc' } } }
    });
  });

  res.json({ ok: true, definition: created });
});

router.put('/definitions/:slug', requireRole(adminRoles), async (req, res) => {
  const slug = req.params.slug;
  const { name, description, status, fields, replaceFields } = req.body || {};

  const def = await prisma.entityDefinition.findFirst({ where: { slug } });
  if (!def) return bad(res, 404, 'Definition not found');

  const updated = await prisma.$transaction(async (tx: any) => {
    const d = await tx.entityDefinition.update({
      where: { id: def.id },
      data: {
        name: (typeof name === 'string' && name) ? name : def.name,
        description: (typeof description === 'string') ? description : def.description,
        status: (typeof status === 'string') ? status : def.status
      }
    });

    if (Array.isArray(fields) && fields.length > 0) {
      if (replaceFields) {
        await tx.entityField.deleteMany({ where: { entityId: def.id } });
        await tx.entityField.createMany({
          data: fields.map((f: any, idx: number) => ({
            entityId: def.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: !!f.required,
            order: Number.isFinite(Number(f.order)) ? Number(f.order) : idx,
            config: f.config ?? null
          }))
        });
      } else {
        // upsert by (entityId, key)
        for (const f of fields) {
          await tx.entityField.upsert({
            where: { entityId_key: { entityId: def.id, key: f.key } },
            update: {
              label: f.label ?? undefined,
              type: f.type ?? undefined,
              required: (typeof f.required === 'boolean') ? f.required : undefined,
              order: Number.isFinite(Number(f.order)) ? Number(f.order) : undefined,
              config: (f.config !== undefined) ? f.config : undefined
            },
            create: {
              entityId: def.id,
              key: f.key,
              label: f.label,
              type: f.type,
              required: !!f.required,
              order: Number.isFinite(Number(f.order)) ? Number(f.order) : 0,
              config: f.config ?? null
            }
          });
        }
      }
    }

    return tx.entityDefinition.findUnique({
      where: { id: d.id },
      include: { fields: { orderBy: { order: 'asc' } } }
    });
  });

  res.json({ ok: true, definition: updated });
});

router.post('/definitions/:slug/archive', requireRole(adminRoles), async (req, res) => {
  const slug = req.params.slug;
  const def = await prisma.entityDefinition.findFirst({ where: { slug } });
  if (!def) return bad(res, 404, 'Definition not found');

  const updated = await prisma.entityDefinition.update({
    where: { id: def.id },
    data: { status: 'ARCHIVED' }
  });

  res.json({ ok: true, definition: updated });
});

// --- RECORDS ---
router.get('/:slug/records', async (req, res) => {
  const slug = req.params.slug;
  const def = await getEntityBySlug(slug);
  if (!def) return bad(res, 404, 'Entity not found');

  const limit = Math.min(Number(req.query.limit || 50), 200);
  const cursor = (req.query.cursor && typeof req.query.cursor === 'string') ? req.query.cursor : null;

  const filterKey = (req.query.filterKey && typeof req.query.filterKey === 'string') ? req.query.filterKey : null;
  const filterValue = (req.query.filterValue !== undefined) ? req.query.filterValue : undefined;

  const where: any = { entityId: def.id };
  if (filterKey && filterValue !== undefined) {
    where.data = { path: [filterKey], equals: filterValue };
  }

  const items = await prisma.entityRecord.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
  });

  const nextCursor = items.length === limit ? items[items.length - 1].id : null;
  res.json({ ok: true, items, nextCursor });
});

router.post('/:slug/records', requireRole(editorRoles), async (req, res) => {
  const slug = req.params.slug;
  const def = await getEntityBySlug(slug);
  if (!def) return bad(res, 404, 'Entity not found');

  const { data: inputData } = req.body || {};
  const { data, errors } = validateAndNormalizeData(def.fields, inputData);

  if (errors.length) return bad(res, 400, 'Validation error', errors);

  const created = await prisma.entityRecord.create({
    data: { entityId: def.id, data }
  });

  res.json({ ok: true, record: created });
});

router.get('/:slug/records/:id', async (req, res) => {
  const slug = req.params.slug;
  const id = req.params.id;
  const def = await getEntityBySlug(slug);
  if (!def) return bad(res, 404, 'Entity not found');

  const rec = await prisma.entityRecord.findFirst({ where: { id, entityId: def.id } });
  if (!rec) return bad(res, 404, 'Record not found');

  res.json({ ok: true, record: rec });
});

const updateRecord = async (req: any, res: any) => {
  const slug = req.params.slug;
  const id = req.params.id;
  const def = await getEntityBySlug(slug);
  if (!def) return bad(res, 404, 'Entity not found');

  const existing = await prisma.entityRecord.findFirst({ where: { id, entityId: def.id } });
  if (!existing) return bad(res, 404, 'Record not found');

  const patch = (req.body && typeof req.body === 'object') ? req.body : {};
  const existingData = (existing.data && typeof existing.data === 'object' && !Array.isArray(existing.data))
    ? (existing.data as Record<string, any>)
    : {};
  const patchData = (patch.data && typeof patch.data === 'object' && !Array.isArray(patch.data))
    ? (patch.data as Record<string, any>)
    : {};
  const nextData = { ...existingData, ...patchData };

  const { data, errors } = validateAndNormalizeData(def.fields, nextData);
  if (errors.length) return bad(res, 400, 'Validation error', errors);

  const updated = await prisma.entityRecord.update({
    where: { id: existing.id },
    data: { data }
  });

  res.json({ ok: true, record: updated });
};

router.patch('/:slug/records/:id', requireRole(editorRoles), updateRecord);
router.put('/:slug/records/:id', requireRole(editorRoles), updateRecord);

router.delete('/:slug/records/:id', requireRole(editorRoles), async (req, res) => {
  const slug = req.params.slug;
  const id = req.params.id;
  const def = await getEntityBySlug(slug);
  if (!def) return bad(res, 404, 'Entity not found');

  await prisma.entityRecord.deleteMany({ where: { id, entityId: def.id } });
  res.json({ ok: true });
});

export default router;
