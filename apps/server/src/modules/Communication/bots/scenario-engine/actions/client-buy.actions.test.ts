import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: {
    carListing: {
      findMany: vi.fn()
    }
  }
}));

vi.mock('../../../telegram/core/leadService.js', () => ({
  createOrMergeLead: vi.fn()
}));

vi.mock('../../../../Integrations/external-search/externalSearch.service.js', () => ({
  externalSearchService: {
    searchAndPersist: vi.fn()
  }
}));

vi.mock('../adapters/telegram.adapter.js', () => ({
  sendMessage: vi.fn()
}));

vi.mock('./car-card.actions.js', () => ({
  sendCarCardWithMedia: vi.fn()
}));

vi.mock('./form.actions.js', () => ({
  startFormFlow: vi.fn()
}));

import {
  aggregateLeadBuySelectedIds,
  buildLeadBuyBatch,
  updateLeadBuyFavorites
} from './client-buy.actions.js';

describe('client-buy helpers', () => {
  it('builds batch 1-3 with cursor progression for "Показати ще"', () => {
    const resultIds = ['c1', 'c2', 'c3', 'c4', 'c5'];

    const first = buildLeadBuyBatch(resultIds, 0, 3);
    expect(first.ids).toEqual(['c1', 'c2', 'c3']);
    expect(first.nextCursor).toBe(3);
    expect(first.hasMore).toBe(true);

    const second = buildLeadBuyBatch(resultIds, first.nextCursor, 3);
    expect(second.ids).toEqual(['c4', 'c5']);
    expect(second.nextCursor).toBe(5);
    expect(second.hasMore).toBe(false);
  });

  it('adds and removes favorites deterministically', () => {
    const added = updateLeadBuyFavorites(['c1'], 'c2', 'add');
    expect(added).toEqual(['c1', 'c2']);

    const duplicateAdd = updateLeadBuyFavorites(added, 'c2', 'add');
    expect(duplicateAdd).toEqual(['c1', 'c2']);

    const removed = updateLeadBuyFavorites(duplicateAdd, 'c1', 'remove');
    expect(removed).toEqual(['c2']);
  });

  it('aggregates selected favorites for single admin lead', () => {
    const aggregated = aggregateLeadBuySelectedIds(['c1', 'c2', 'c1', '', 'c3']);
    expect(aggregated).toEqual(['c1', 'c2', 'c3']);
  });
});
