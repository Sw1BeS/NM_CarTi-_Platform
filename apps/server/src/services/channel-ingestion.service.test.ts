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
    updateCar = vi.fn();
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
  if (state.lastCarRepo) state.lastCarRepo.updateCar.mockReset();
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
    expect(result.reason).toBe('MERGED');
    expect(state.lastCarRepo.createFromChannelMessage).not.toHaveBeenCalled();
  });

  it('marks non-autopublished inventory for review without treating review as transit', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue(null);

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 43,
      text: 'BMW X5 2020\n50 000 $\n90 000 км',
      date: new Date('2026-05-15T00:00:00.000Z'),
      mediaUrls: [],
      sourceType: 'MTPROTO'
    });

    const result = await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: false } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(result.created).toBe(true);
    expect(state.lastCarRepo.createFromChannelMessage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING',
      availabilityState: 'IN_STOCK',
      publicationStatus: 'REVIEW'
    }));
  });

  it('keeps explicit transit signal separate from publication review state', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue(null);

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 44,
      text: 'Audi Q7 2021 #вдорозі\n65 000 $\n40 000 км',
      date: new Date('2026-05-15T00:00:00.000Z'),
      mediaUrls: [],
      sourceType: 'MTPROTO'
    });

    await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: false } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(state.lastCarRepo.createFromChannelMessage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING',
      availabilityState: 'IN_TRANSIT',
      publicationStatus: 'REVIEW'
    }));
  });
});
