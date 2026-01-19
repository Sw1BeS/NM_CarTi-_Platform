/**
 * Read Service - v4.1 Read Abstraction Layer
 * 
 * Provides unified interface for reading from v4.1 tables.
 * Legacy tables (Company, User) - REMOVED.
 * 
 * All read functions return normalized UnifiedWorkspace/UnifiedUser types
 */

import { prisma } from '../../services/prisma.js';
import { Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface UnifiedWorkspace {
    id: string;           // ULID (v4.1) or cuid (legacy)
    slug: string;
    name: string;
    primaryColor: string;
    plan: string;
    domain?: string;
    isActive: boolean;
}

export interface UnifiedUser {
    id: string;           // ULID (v4.1) or cuid (legacy)
    globalUserId?: string; // v4.1 GlobalUser ID (if from v4.1)
    email: string;
    name: string;
    role: string;
    password?: string;    // Hashed password
    isActive: boolean;
    workspace?: UnifiedWorkspace;
    username?: string | null;
    telegramUserId?: string | null;
    companyId?: string;   // Legacy company ID (for backward compat)
}

// ============================================================================
// Workspace Functions
// ============================================================================

/**
 * Get workspace by slug from v4.1
 */
export async function getWorkspaceBySlug(
    slug: string
): Promise<UnifiedWorkspace | null> {

    const workspace = await prisma.workspace.findUnique({
        where: { slug, deleted_at: null }
    });

    if (!workspace) return null;

    const settings = workspace.settings as any || {};

    return {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        primaryColor: settings.primaryColor || '#3B82F6',
        plan: settings.plan || 'FREE',
        domain: settings.domain, // Type inference handles undefined
        isActive: true
    };
}

/**
 * Get workspace by ID from v4.1
 */
export async function getWorkspaceById(
    id: string
): Promise<UnifiedWorkspace | null> {

    const workspace = await prisma.workspace.findUnique({
        where: { id, deleted_at: null }
    });

    if (!workspace) return null;

    const settings = workspace.settings as any || {};

    return {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        primaryColor: settings.primaryColor || '#3B82F6',
        plan: settings.plan || 'FREE',
        domain: settings.domain,
        isActive: true
    };
}

/**
 * Get all workspaces
 */
export async function getAllWorkspaces(): Promise<UnifiedWorkspace[]> {

    const workspaces = await prisma.workspace.findMany({
        where: { deleted_at: null },
        orderBy: { created_at: 'asc' }
    });

    return workspaces.map(w => {
        const settings = w.settings as any || {};
        return {
            id: w.id,
            slug: w.slug,
            name: w.name,
            primaryColor: settings.primaryColor || '#3B82F6',
            plan: settings.plan || 'FREE',
            domain: settings.domain,
            isActive: true
        };
    });
}

// ============================================================================
// User Functions
// ============================================================================

/**
 * Get user by email from v4.1
 */
export async function getUserByEmail(
    email: string,
    includePassword = false
): Promise<UnifiedUser | null> {

    const globalUser = await prisma.globalUser.findUnique({
        where: { email },
        include: {
            memberships: {
                where: { deleted_at: null },
                include: {
                    workspace: true
                },
                take: 1,
                orderBy: { created_at: 'asc' }
            }
        }
    });

    if (!globalUser) return null;

    const membership = globalUser.memberships?.[0];
    const settings = (membership?.workspace?.settings as any) || {};

    return {
        id: globalUser.id,
        globalUserId: globalUser.id,
        email: globalUser.email,
        name: globalUser.name || globalUser.email,
        role: membership?.role_id?.toUpperCase() || 'USER',
        password: includePassword ? (globalUser.password_hash || undefined) : undefined,
        isActive: globalUser.global_status === 'active',
        telegramUserId: globalUser.telegram_user_id,
        workspace: membership?.workspace ? {
            id: membership.workspace.id,
            slug: membership.workspace.slug,
            name: membership.workspace.name,
            primaryColor: settings.primaryColor || '#3B82F6',
            plan: settings.plan || 'FREE',
            isActive: true
        } : undefined,
        companyId: membership?.workspace_id
    };
}

/**
 * Get user by ID from v4.1
 */
export async function getUserById(
    id: string,
    includePassword = false
): Promise<UnifiedUser | null> {

    const globalUser = await prisma.globalUser.findUnique({
        where: { id },
        include: {
            memberships: {
                where: { deleted_at: null },
                include: {
                    workspace: true
                },
                take: 1,
                orderBy: { created_at: 'asc' }
            }
        }
    });

    if (!globalUser) return null;

    const membership = globalUser.memberships?.[0];
    const settings = (membership?.workspace?.settings as any) || {};

    return {
        id: globalUser.id,
        globalUserId: globalUser.id,
        email: globalUser.email,
        name: globalUser.name || globalUser.email,
        role: membership?.role_id?.toUpperCase() || 'USER',
        password: includePassword ? (globalUser.password_hash || undefined) : undefined,
        isActive: globalUser.global_status === 'active',
        telegramUserId: globalUser.telegram_user_id,
        workspace: membership?.workspace ? {
            id: membership.workspace.id,
            slug: membership.workspace.slug,
            name: membership.workspace.name,
            primaryColor: settings.primaryColor || '#3B82F6',
            plan: settings.plan || 'FREE',
            isActive: true
        } : undefined,
        companyId: membership?.workspace_id
    };
}

/**
 * Get all users (optionally filtered by workspace)
 */
export async function getAllUsers(
    workspaceId?: string
): Promise<UnifiedUser[]> {

    const where: any = {};

    if (workspaceId) {
        where.memberships = {
            some: {
                workspace_id: workspaceId,
                deleted_at: null
            }
        };
    }

    const globalUsers = await prisma.globalUser.findMany({
        where,
        include: {
            memberships: {
                where: { deleted_at: null },
                include: { workspace: true },
                take: 1
            }
        },
        orderBy: { created_at: 'desc' }
    });

    return globalUsers.map(gu => {
        const membership = gu.memberships?.[0];
        const settings = (membership?.workspace?.settings as any) || {};

        return {
            id: gu.id,
            globalUserId: gu.id,
            email: gu.email,
            name: gu.name || gu.email,
            role: membership?.role_id?.toUpperCase() || 'USER',
            isActive: gu.global_status === 'active',
            telegramUserId: gu.telegram_user_id,
            workspace: membership?.workspace ? {
                id: membership.workspace.id,
                slug: membership.workspace.slug,
                name: membership.workspace.name,
                primaryColor: settings.primaryColor || '#3B82F6',
                plan: settings.plan || 'FREE',
                isActive: true
            } : undefined,
            companyId: membership?.workspace_id
        };
    });
}

/**
 * Get user by Telegram user ID (v4.1)
 */
export async function getUserByTelegramId(
    telegramUserId: number | string
): Promise<UnifiedUser | null> {
    const globalUser = await prisma.globalUser.findUnique({
        where: { telegram_user_id: String(telegramUserId) },
        include: {
            memberships: {
                where: { deleted_at: null },
                include: {
                    workspace: true
                },
                take: 1,
                orderBy: { created_at: 'asc' }
            }
        }
    });

    if (!globalUser) return null;

    const membership = globalUser.memberships?.[0];
    const settings = (membership?.workspace?.settings as any) || {};

    return {
        id: globalUser.id,
        globalUserId: globalUser.id,
        email: globalUser.email,
        name: globalUser.name || globalUser.email,
        role: membership?.role_id?.toUpperCase() || 'USER',
        isActive: globalUser.global_status === 'active',
        username: undefined,
        telegramUserId: globalUser.telegram_user_id,
        workspace: membership?.workspace ? {
            id: membership.workspace.id,
            slug: membership.workspace.slug,
            name: membership.workspace.name,
            primaryColor: settings.primaryColor || '#3B82F6',
            plan: settings.plan || 'FREE',
            isActive: true
        } : undefined,
        companyId: membership?.workspace_id
    };
}
