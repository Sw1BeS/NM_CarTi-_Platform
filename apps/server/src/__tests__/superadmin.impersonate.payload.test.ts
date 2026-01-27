import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { signJwt, verifyJwt } from '../config/jwt.js';

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

// Import app AFTER mocking
import { app } from '../index.js';

describe('Superadmin Impersonate Payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a canonical token payload including workspaceId', async () => {
    const adminId = 'admin-1';
    const targetUserId = 'user-1';
    const targetWorkspaceId = 'ws-1';

    mockPrisma.globalUser.findUnique.mockResolvedValue({
      id: targetUserId,
      email: 'target@example.com',
      name: 'Target User',
      global_status: 'active',
      memberships: [
        {
          role_id: 'ADMIN',
          workspace_id: targetWorkspaceId,
          workspace: {
            id: targetWorkspaceId,
            slug: 'target-ws',
            name: 'Target Workspace',
            settings: {}
          }
        }
      ]
    } as any);

    mockPrisma.workspace.findUnique.mockImplementation(async ({ where }: any) => {
      if (where?.id === targetWorkspaceId || where?.id === 'company_system') {
        return {
          id: where.id,
          slug: where.id === 'company_system' ? 'system' : 'target-ws',
          name: where.id === 'company_system' ? 'System Workspace' : 'Target Workspace',
          settings: {},
          deleted_at: null
        } as any;
      }
      return null;
    });

    const adminToken = signJwt({
      userId: adminId,
      role: 'SUPER_ADMIN',
      globalUserId: adminId,
      companyId: 'admin-workspace',
      workspaceId: 'admin-workspace'
    });

    const res = await request(app)
      .post('/api/superadmin/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: targetUserId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');

    const decoded = verifyJwt(res.body.token);
    expect(decoded.userId).toBe(targetUserId);
    expect(decoded.globalUserId).toBe(targetUserId);
    expect(decoded.role).toBe('ADMIN');
    expect(decoded.companyId).toBe(targetWorkspaceId);
    expect(decoded.workspaceId).toBe(targetWorkspaceId);
  });
});
