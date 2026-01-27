import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { signJwt } from '../config/jwt.js';

const {
  getInstalledMock,
  getByIdMock,
  getMarketplaceMock,
  installTemplateMock,
  uninstallTemplateMock
} = vi.hoisted(() => {
  return {
    getInstalledMock: vi.fn(),
    getByIdMock: vi.fn(),
    getMarketplaceMock: vi.fn(),
    installTemplateMock: vi.fn(),
    uninstallTemplateMock: vi.fn()
  };
});

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      $connect: vi.fn(),
      workspace: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn()
      },
      globalUser: {
        findUnique: vi.fn(),
        findFirst: vi.fn()
      },
      membership: {
        findFirst: vi.fn()
      },
      systemLog: {
        create: vi.fn()
      }
    }
  };
});

vi.mock('../services/prisma.js', () => ({
  prisma: mockPrisma
}));

vi.mock('../modules/Core/templates/template.service.js', () => {
  class TemplateService {
    getMarketplace = getMarketplaceMock;
    getById = getByIdMock;
    getInstalled = getInstalledMock;
    installTemplate = installTemplateMock;
    uninstallTemplate = uninstallTemplateMock;
  }

  return { TemplateService };
});

// Import app AFTER mocks
import { app } from '../index.js';

describe('Template Routes - Installed List Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstalledMock.mockResolvedValue([{ id: 'installed-1' }]);
  });

  it('routes /installed/list to getInstalled (not getById)', async () => {
    const token = signJwt({
      userId: 'user-1',
      globalUserId: 'user-1',
      role: 'ADMIN',
      companyId: 'company-1',
      workspaceId: 'company-1'
    });

    const res = await request(app)
      .get('/api/templates/installed/list')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(getInstalledMock).toHaveBeenCalledTimes(1);
    expect(getInstalledMock).toHaveBeenCalledWith('company-1');
    expect(getByIdMock).not.toHaveBeenCalled();
  });
});
