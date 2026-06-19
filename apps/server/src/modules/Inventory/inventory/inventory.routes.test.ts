import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  carRepoMock,
  prismaMock,
  vehicleTaxonomyServiceMock
} = vi.hoisted(() => ({
  carRepoMock: {
    findCars: vi.fn(),
    createCar: vi.fn(),
    findById: vi.fn(),
    updateCar: vi.fn()
  },
  prismaMock: {
    partnerUser: {
      findFirst: vi.fn()
    },
    carListing: {
      updateMany: vi.fn()
    },
    botConfig: {
      findFirst: vi.fn(),
      findUnique: vi.fn()
    }
  },
  vehicleTaxonomyServiceMock: {
    canonicalizeInventoryInput: vi.fn()
  }
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 'user_1', role: 'ADMIN', companyId: 'company_1' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next()
}));

vi.mock('../../../repositories/index.js', () => ({
  CarRepository: vi.fn().mockImplementation(() => carRepoMock)
}));

vi.mock('../../VehicleTaxonomy/vehicleTaxonomy.service.js', () => ({
  vehicleTaxonomyService: vehicleTaxonomyServiceMock
}));

vi.mock('../../Communication/telegram/messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: {
    sendMediaGroup: vi.fn(),
    sendPhoto: vi.fn(),
    sendMessage: vi.fn()
  }
}));

vi.mock('../../../services/carCardRenderer.v2.js', () => ({
  renderCarCardForBot: vi.fn()
}));

const buildApp = async () => {
  const { default: inventoryRoutes } = await import('./inventory.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRoutes);
  return app;
};

describe('Inventory routes taxonomy canonicalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vehicleTaxonomyServiceMock.canonicalizeInventoryInput.mockImplementation(async (input: Record<string, unknown>) => ({
      data: input,
      issues: [],
      taxonomy: { version: 'test-taxonomy', source: 'LOCAL_SNAPSHOT' }
    }));
  });

  it('canonicalizes inventory create specs before persistence', async () => {
    vehicleTaxonomyServiceMock.canonicalizeInventoryInput.mockResolvedValueOnce({
      data: {
        title: 'Tesla Model 3',
        price: 35000,
        currency: 'USD',
        year: 2021,
        mileage: 22000,
        location: 'Київ',
        specs: {
          brand: 'Tesla',
          model: 'Model 3',
          fuel: 'Електро',
          _taxonomy: {
            issues: [{ field: 'fuel', value: 'diesel', reason: 'incompatible' }]
          }
        }
      },
      issues: [{ field: 'fuel', value: 'diesel', reason: 'incompatible' }],
      taxonomy: { version: 'test-taxonomy', source: 'LOCAL_SNAPSHOT' }
    });
    carRepoMock.createCar.mockImplementation(async (input: Record<string, unknown>) => ({
      id: 'car_1',
      ...input,
      mediaUrls: []
    }));
    const app = await buildApp();

    const res = await request(app)
      .post('/api/inventory')
      .send({
        title: 'Tesla Model 3',
        price: 35000,
        currency: 'USD',
        year: 2021,
        mileage: 22000,
        location: 'Kyiv',
        specs: {
          brand: 'tesla',
          model: 'model 3',
          fuel: 'diesel'
        }
      });

    expect(res.status).toBe(200);
    expect(vehicleTaxonomyServiceMock.canonicalizeInventoryInput).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Tesla Model 3',
      location: 'Kyiv',
      specs: expect.objectContaining({
        brand: 'tesla',
        model: 'model 3',
        fuel: 'diesel'
      })
    }), {
      companyId: 'company_1',
      source: 'INVENTORY_CREATE'
    });
    expect(carRepoMock.createCar).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Tesla Model 3',
      companyId: 'company_1',
      location: 'Київ',
      specs: expect.objectContaining({
        brand: 'Tesla',
        model: 'Model 3',
        fuel: 'Електро'
      })
    }));
  });

  it('canonicalizes inventory update specs before persistence', async () => {
    carRepoMock.findById.mockResolvedValueOnce({
      id: 'car_1',
      companyId: 'company_1',
      title: 'Tesla Model 3',
      price: 35000,
      year: 2021,
      mileage: 22000,
      mediaUrls: []
    });
    vehicleTaxonomyServiceMock.canonicalizeInventoryInput.mockResolvedValueOnce({
      data: {
        location: 'Львів',
        specs: {
          brand: 'Tesla',
          model: 'Model Y',
          fuel: 'Електро',
          _taxonomy: { issues: [] }
        }
      },
      issues: [],
      taxonomy: { version: 'test-taxonomy', source: 'LOCAL_SNAPSHOT' }
    });
    carRepoMock.updateCar.mockImplementation(async (_id: string, input: Record<string, unknown>) => ({
      id: 'car_1',
      title: 'Tesla Model Y',
      price: 42000,
      year: 2022,
      mileage: 12000,
      mediaUrls: [],
      ...input
    }));
    const app = await buildApp();

    const res = await request(app)
      .put('/api/inventory/car_1')
      .send({
        location: 'Lviv',
        specs: {
          brand: 'tesla',
          model: 'model y',
          fuel: 'electric'
        }
      });

    expect(res.status).toBe(200);
    expect(vehicleTaxonomyServiceMock.canonicalizeInventoryInput).toHaveBeenCalledWith(expect.objectContaining({
      location: 'Lviv',
      specs: expect.objectContaining({
        brand: 'tesla',
        model: 'model y',
        fuel: 'electric'
      })
    }), {
      companyId: 'company_1',
      source: 'INVENTORY_UPDATE'
    });
    expect(carRepoMock.updateCar).toHaveBeenCalledWith('car_1', expect.objectContaining({
      location: 'Львів',
      specs: expect.objectContaining({
        brand: 'Tesla',
        model: 'Model Y',
        fuel: 'Електро'
      })
    }));
  });
});
