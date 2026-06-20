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

  it('publishes autopublished in-stock inventory as available', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue(null);

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 145,
      text: 'VOLVO S90 2018\nВ НАЯВНОСТІ\n17 000 $\n128 000 км',
      date: new Date('2026-05-15T00:00:00.000Z'),
      mediaUrls: ['/media/volvo.jpg'],
      sourceType: 'MTPROTO'
    });

    await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: true } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(state.lastCarRepo.createFromChannelMessage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'AVAILABLE',
      availabilityState: 'IN_STOCK',
      publicationStatus: 'PUBLISHED'
    }));
  });

  it('publishes autopublished transit inventory without marking it in stock', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue(null);

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 146,
      text: 'AUDI Q7 2022\n⏳#вдорозі (викуплена і прямує в Україну)\n37 000 $\n98 000 км',
      date: new Date('2026-05-15T00:00:00.000Z'),
      mediaUrls: ['/media/audi.jpg'],
      sourceType: 'MTPROTO'
    });

    await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: true } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(state.lastCarRepo.createFromChannelMessage).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PENDING',
      availabilityState: 'IN_TRANSIT',
      publicationStatus: 'PUBLISHED'
    }));
  });

  it('filters sold posts when channel rules skip sold statuses', () => {
    const result = channelIngestionService.applyRules(
      'AUDI Q5 2017 ❌ Продано\nЦіна - 22 500$',
      { skipStatuses: ['sold'] }
    );

    expect(result.shouldImport).toBe(false);
    expect(result.reason).toBe('FILTERED');
  });

  it('can require price, year, and media before creating inventory', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue(null);

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 45,
      text: 'BMW X5 2020\n90 000 км',
      date: new Date('2026-05-15T00:00:00.000Z'),
      mediaUrls: [],
      sourceType: 'MTPROTO'
    });

    const noPrice = await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: false, requirePrice: true } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(noPrice.created).toBe(false);
    expect(noPrice.reason).toBe('FILTERED');

    const withPriceNoMedia = channelIngestionService.normalizeMessage({
      ...message,
      messageId: 46,
      text: 'BMW X5 2020\n50 000 $\n90 000 км'
    });

    const noMedia = await channelIngestionService.upsertCarListingOrDraft({
      message: withPriceNoMedia,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: false, requirePrice: true, requireYear: true, requireMedia: true } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(noMedia.created).toBe(false);
    expect(noMedia.reason).toBe('NO_MEDIA');
  });

  it('appends media-only album messages to an existing grouped car', async () => {
    (prisma.carListing.findFirst as any).mockResolvedValue({
      id: 'car_group_1',
      mediaUrls: ['/media/telegram/old.jpg'],
      mediaItems: [{ url: '/media/telegram/old.jpg' }],
      thumbnail: '/media/telegram/old.jpg'
    });

    const message = channelIngestionService.normalizeMessage({
      chatId: '-100123',
      messageId: 47,
      text: '',
      date: new Date('2026-05-15T00:00:00.000Z'),
      mediaUrls: ['/media/telegram/new.jpg'],
      mediaGroupKey: 'album_1',
      sourceType: 'MTPROTO'
    });

    const result = await channelIngestionService.upsertCarListingOrDraft({
      message,
      mode: 'INVENTORY',
      channelSource: { id: 'src1', connectorId: 'conn1', importRules: { autoPublish: false } } as any,
      companyId: 'company_1',
      sourceLabel: 'MTPROTO'
    });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('MEDIA_GROUP_APPEND');
    expect(state.lastCarRepo.updateCar).toHaveBeenCalledWith('car_group_1', expect.objectContaining({
      mediaUrls: ['/media/telegram/old.jpg', '/media/telegram/new.jpg']
    }));
  });
});
