import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  lastCarRepo: null as any,
  lastDraftRepo: null as any
}));

vi.mock('../services/prisma.js', () => ({
  prisma: {
    carListing: { findFirst: vi.fn() },
    draft: { findFirst: vi.fn() },
    mTProtoConnector: { findUnique: vi.fn() }
  }
}));

vi.mock('../repositories/car.repository.js', () => ({
  CarRepository: class {
    createFromChannelMessage = vi.fn();
    constructor() {
      state.lastCarRepo = this;
    }
  }
}));

vi.mock('../repositories/draft.repository.js', () => ({
  DraftRepository: class {
    create = vi.fn();
    constructor() {
      state.lastDraftRepo = this;
    }
  }
}));

import { channelIngestionService } from './channel-ingestion.service.js';
import { prisma } from './prisma.js';

beforeEach(() => {
  (prisma.carListing.findFirst as any).mockReset();
  (prisma.draft.findFirst as any).mockReset();
  (prisma.mTProtoConnector.findUnique as any).mockReset();
  if (state.lastCarRepo) state.lastCarRepo.createFromChannelMessage.mockReset();
  if (state.lastDraftRepo) state.lastDraftRepo.create.mockReset();
});

describe('ChannelIngestionService', () => {
  it('skips duplicate inventory messages', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue({ id: 'car1' });

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 42,
      text: 'BMW X5 2020 Price 50000',
      date: new Date(),
      mediaUrls: [],
      sourceType: 'MTPROTO'
    });

    const result = await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: {} } as any,
      sourceLabel: 'MTPROTO'
    });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('DUPLICATE');
    expect(state.lastCarRepo.createFromChannelMessage).not.toHaveBeenCalled();
  });
});
