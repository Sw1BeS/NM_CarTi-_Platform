import { PrismaClient, Workspace } from '@prisma/client';
import { BaseRepository } from './base.repository.js';
import { generateULID } from '../utils/ulid.js';

export class WorkspaceRepository extends BaseRepository<Workspace> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'workspace');
  }

  async findById(id: string): Promise<Workspace | null> {
    return this.prisma.workspace.findUnique({
      where: { id, deleted_at: null }
    });
  }

  async findAllActive(): Promise<Workspace[]> {
    return this.prisma.workspace.findMany({
      where: { deleted_at: null }
    });
  }

  async createWithOwner(data: { name: string; ownerId: string; domain?: string }): Promise<Workspace> {
    return this.prisma.workspace.create({
      data: {
        id: generateULID(),
        name: data.name,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + generateULID().slice(-4).toLowerCase(),
        settings: {
          domain: data.domain
        },
        memberships: {
          create: {
            id: generateULID(),
            user_id: data.ownerId,
            role_id: 'owner'
          }
        }
      }
    });
  }

  async countWorkspaces(): Promise<number> {
    return this.prisma.workspace.count({ where: { deleted_at: null } });
  }

  async updateSettings(id: string, settings: any): Promise<Workspace> {
    const current = await this.prisma.workspace.findUnique({ where: { id } });
    const currentSettings = (current?.settings as any) || {};
    return this.prisma.workspace.update({
      where: { id },
      data: {
        settings: { ...currentSettings, ...settings }
      }
    });
  }

  async softDelete(id: string): Promise<Workspace> {
    return this.prisma.workspace.update({
      where: { id },
      data: { deleted_at: new Date() }
    });
  }
}
