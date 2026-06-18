import { prisma as defaultPrisma } from '../../services/prisma.js';
import { normalizeTaxonomyLabel } from './vehicleTaxonomy.ids.js';

export type VehicleTaxonomyCandidateKind = 'make' | 'model' | 'city' | 'specOption';

export type VehicleTaxonomyCandidateInput = {
  kind: VehicleTaxonomyCandidateKind;
  label: string;
  makeLabel?: string | null;
  source: string;
  evidence?: Record<string, unknown>;
};

export type ObservedInventoryCandidateScanInput = {
  companyId?: string | null;
  limit?: number;
};

export type ObservedInventoryCandidateScanResult = {
  scanned: number;
  rejectedModels: number;
  recorded: number;
};

export type VehicleTaxonomyCandidateServiceDeps = {
  prisma?: any;
  now?: () => Date;
};

const noisyPublicModelPatterns = [
  /опис від продавця/i,
  /відсутній у розшуку/i,
  /офіційних відкритих/i,
  /перевірк/i,
  /vin[-\s]?код/i,
  /verified\s+vin/i
];

export const shouldRejectPublicModelLabel = (label: unknown) => {
  const normalized = normalizeTaxonomyLabel(label);
  if (!normalized) return true;
  if (normalized.length > 80) return true;
  return noisyPublicModelPatterns.some((pattern) => pattern.test(normalized));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readValue = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = normalizeTaxonomyLabel(record[key]);
    if (value) return value;
  }
  return '';
};

const evidenceEnvelope = (evidence: Record<string, unknown> | undefined, timestamp: string) => ({
  firstSeenAt: timestamp,
  lastSeenAt: timestamp,
  samples: evidence ? [evidence] : []
});

const mergeEvidence = (existing: unknown, evidence: Record<string, unknown> | undefined, timestamp: string) => {
  const current = isRecord(existing) ? existing : {};
  const samples = Array.isArray(current.samples) ? current.samples : [];
  return {
    ...current,
    lastSeenAt: timestamp,
    samples: evidence ? [...samples, evidence].slice(-20) : samples
  };
};

export class VehicleTaxonomyCandidateService {
  private readonly db: any;
  private readonly now: () => Date;

  constructor(deps: VehicleTaxonomyCandidateServiceDeps = {}) {
    this.db = deps.prisma || defaultPrisma;
    this.now = deps.now || (() => new Date());
  }

  async recordCandidate(input: VehicleTaxonomyCandidateInput) {
    const label = normalizeTaxonomyLabel(input.label);
    const makeLabel = normalizeTaxonomyLabel(input.makeLabel) || null;
    const source = normalizeTaxonomyLabel(input.source) || 'UNKNOWN';
    if (!label) return null;

    const existing = await this.db.vehicleTaxonomyCandidate.findFirst({
      where: {
        kind: input.kind,
        label,
        makeLabel,
        source,
        status: 'NEW'
      },
      orderBy: { createdAt: 'desc' }
    });
    const timestamp = this.now().toISOString();

    if (existing) {
      return this.db.vehicleTaxonomyCandidate.update({
        where: { id: existing.id },
        data: {
          evidence: mergeEvidence(existing.evidence, input.evidence, timestamp)
        }
      });
    }

    return this.db.vehicleTaxonomyCandidate.create({
      data: {
        kind: input.kind,
        label,
        makeLabel,
        source,
        evidence: evidenceEnvelope(input.evidence, timestamp),
        status: 'NEW'
      }
    });
  }

  async collectObservedInventoryCandidates(input: ObservedInventoryCandidateScanInput = {}): Promise<ObservedInventoryCandidateScanResult> {
    const listings = await this.db.carListing.findMany({
      where: input.companyId ? { companyId: input.companyId } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(input.limit || 300, 1), 1000),
      select: {
        id: true,
        companyId: true,
        title: true,
        location: true,
        specs: true,
        sourceUrl: true,
        originalRaw: true
      }
    });

    let rejectedModels = 0;
    let recorded = 0;

    for (const listing of listings) {
      const specs = isRecord(listing.specs) ? listing.specs : {};
      const brand = readValue(specs, ['brand', 'make', 'марка']);
      const model = readValue(specs, ['model', 'модель']);
      if (!model || !shouldRejectPublicModelLabel(model)) continue;

      const result = await this.recordCandidate({
        kind: 'model',
        label: model,
        makeLabel: brand || null,
        source: 'OBSERVED_INVENTORY_REJECTED_MODEL',
        evidence: {
          carListingId: listing.id,
          companyId: listing.companyId,
          title: listing.title,
          location: listing.location,
          sourceUrl: listing.sourceUrl
        }
      });
      rejectedModels += 1;
      if (result) recorded += 1;
    }

    return {
      scanned: listings.length,
      rejectedModels,
      recorded
    };
  }
}

export const vehicleTaxonomyCandidateService = new VehicleTaxonomyCandidateService();
