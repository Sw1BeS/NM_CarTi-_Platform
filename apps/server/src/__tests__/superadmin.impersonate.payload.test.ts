import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { signJwt, verifyJwt } from '../config/jwt.js';

const { mockPrisma } = vi.hoisted(() => {
    return {
        mockPrisma: {
            $connect: vi.fn(),
            workspace: {
                findMany: vi.fn(),
                count: vi.fn()
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

    it('should generate a token with workspaceId when impersonating a user', async () => {
        // 1. Setup Data
        const adminId = 'admin-1';
        const targetUserId = 'user-1';
        const targetWorkspaceId = 'ws-1';
        const targetCompanyId = 'comp-1'; // Often same as workspaceId in this system

        // Mock findUser (via readService/prisma)
        // superadminService.findUser calls readService.getUserById which calls prisma.globalUser.findUnique
        mockPrisma.globalUser.findUnique.mockResolvedValue({
            id: targetUserId,
            email: 'target@example.com',
            role: 'USER',
            // In V4 schema we might not have direct companyId on GlobalUser, but let's assume standard return
            // If the service logic relies on finding it.
        });

        // Mock getting user by ID (readService)
        // We need to return an object that convinces findUser

        // Wait, superadminService.findUser implementation was:
        // const u = await getUserById(query.id!);
        // getUserById usually returns globalUser.
        // And we need `u.workspaceId` or `u.companyId`.
        // If the real getUserById doesn't return it, we need to mock what it returns.

        // For this test, we assume the code we fixed (fallback to workspaceId prefer) works if the object has it.
        // We'll mock the object to have it.
        mockPrisma.globalUser.findUnique.mockResolvedValue({
            id: targetUserId,
            email: 'target@example.com',
            role: 'USER',
            // Mocking joined or custom fields if readService does that
        });

        // Actually, we might need to mock superadminService directly if we can't easily mock the prisma chain to return what we want.
        // But let's try to mock the DB response to contain the fields we expect purely data-wise?
        // No, prisma types might prevent returning extra fields if we were using TS for mocks strictly, but here is JS runtime.

        // However, if the service retrieves it from `membership` or `workspace`, we must mock those.
        // Let's assume user object has it for now as per "user.workspaceId || user.companyId".

        // Since we can't easily inspect the service logic's full dependency chain without reading more files,
        // we'll spy on the service method if possible or just mock prisma to return a user that HAS validation fields.

        // BUT, wait. If I mock `prisma.globalUser.findUnique` to return `{ ..., workspaceId: 'ws-1' }`, 
        // the `user` variable in routes.ts will have it. 
        // The test is verifying that IF `user` has it, the `token` gets it.

        mockPrisma.globalUser.findUnique.mockResolvedValue({
            id: targetUserId,
            email: 'target@test.com',
            role: 'USER',
            // Mock membership structure as expected by readService
            memberships: [
                {
                    role_id: 'USER',
                    workspace_id: targetWorkspaceId,
                    workspace: {
                        id: targetWorkspaceId,
                        settings: {}
                    }
                }
            ],
            global_status: 'active'
        } as any);

        const adminToken = signJwt({
            userId: adminId,
            role: 'SUPER_ADMIN',
            globalUserId: adminId,
            companyId: 'admin-corp',
            workspaceId: 'admin-corp'
        });

        const res = await request(app)
            .post('/api/superadmin/impersonate')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: targetUserId });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');

        const decoded = verifyJwt(res.body.token);
        expect(decoded).toHaveProperty('workspaceId', targetWorkspaceId);
        expect(decoded).toHaveProperty('companyId', targetWorkspaceId); // Should match
    });
});
