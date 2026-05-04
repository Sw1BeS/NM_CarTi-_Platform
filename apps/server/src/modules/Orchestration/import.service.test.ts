import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sourceCreate: vi.fn(),
  batchCreate: vi.fn(),
  itemCreateMany: vi.fn(),
  batchFindUnique: vi.fn(),
  batchFindMany: vi.fn(),
  batchUpdate: vi.fn(),
  sourceUpdate: vi.fn(),
  itemUpdate: vi.fn(),
  linkageCreate: vi.fn(),
  recommendedCreateMany: vi.fn(),
  reviewQueueCreate: vi.fn(),
  carListingCreate: vi.fn(),
  carListingUpdate: vi.fn()
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: {
    $transaction: async (fn: any) => fn({
      importSource: { create: state.sourceCreate },
      importBatch: { create: state.batchCreate },
      importItem: { createMany: state.itemCreateMany }
    }),
    importBatch: {
      findUnique: state.batchFindUnique,
      findMany: state.batchFindMany,
      update: state.batchUpdate
    },
    importSource: {
      update: state.sourceUpdate
    },
    importItem: {
      update: state.itemUpdate
    },
    importLinkageCandidate: {
      create: state.linkageCreate
    },
    importRecommendedAction: {
      createMany: state.recommendedCreateMany
    },
    automationReviewQueue: {
      create: state.reviewQueueCreate
    },
    carListing: {
      create: state.carListingCreate,
      update: state.carListingUpdate
    }
  }
}));

vi.mock('../../services/integrationEventLog.service.js', () => ({
  logIntegrationEvent: vi.fn(async () => undefined)
}));

vi.mock('../Communication/telegram/core/events/eventEmitter.js', () => ({
  emitPlatformEvent: vi.fn(async () => undefined)
}));

vi.mock('./activity.service.js', () => ({
  recordOrchestrationActivity: vi.fn(async () => undefined)
}));

describe('importService', () => {
  beforeEach(() => {
    Object.values(state).forEach((mockFn) => mockFn.mockReset());
  });

  it('keeps registered imports in staging and returns the created batch', async () => {
    state.sourceCreate.mockResolvedValue({ id: 'source_1', companyId: 'company_1' });
    state.batchCreate.mockResolvedValue({ id: 'batch_1', importSourceId: 'source_1' });
    state.itemCreateMany.mockResolvedValue({ count: 2 });
    state.batchFindUnique.mockResolvedValue({
      id: 'batch_1',
      status: 'REGISTERED',
      items: [{ id: 'item_1' }, { id: 'item_2' }]
    });

    const { importService } = await import('./import.service.js');
    const result = await importService.registerImport({
      companyId: 'company_1',
      name: 'Chat export',
      sourceType: 'DATA_SOURCE',
      items: [
        { externalId: '1', title: 'Prompt ideas' },
        { externalId: '2', title: 'Repository notes' }
      ]
    });

    expect(result.batch?.status).toBe('REGISTERED');
    expect(state.itemCreateMany).toHaveBeenCalledTimes(1);
    expect(state.carListingCreate).not.toHaveBeenCalled();
    expect(state.carListingUpdate).not.toHaveBeenCalled();
  });

  it('analyzes staged items into review queue entries without canonical writes', async () => {
    state.batchFindMany.mockResolvedValue([
      {
        id: 'batch_2',
        companyId: 'company_1',
        importSourceId: 'source_2',
        importSource: {
          sourceType: 'DATA_SOURCE',
          intakeId: 'intake_1'
        },
        items: [
          {
            id: 'item_prompt',
            sourceUrl: 'https://example.com/prompt-guide',
            title: 'промпт guide',
            contentText: 'prompt engineering notes'
          }
        ]
      }
    ]);

    const { importService } = await import('./import.service.js');
    const results = await importService.processPendingBatches();

    expect(results).toHaveLength(1);
    expect(state.itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'item_prompt' },
      data: expect.objectContaining({ status: 'ANALYZED' })
    }));
    expect(state.reviewQueueCreate).toHaveBeenCalledTimes(1);
    expect(state.carListingCreate).not.toHaveBeenCalled();
    expect(state.carListingUpdate).not.toHaveBeenCalled();
  });
});
