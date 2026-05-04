import { prisma } from './prisma.js';
import { ShowcaseService } from '../modules/Marketing/showcase/showcase.service.js';
import { getWorkspaceBySlug } from './v41/readService.js';

const showcaseService = new ShowcaseService();

const normalizeSlug = (slug?: string | null) => {
  if (!slug) return '';
  let value = String(slug).trim();
  value = value.replace(/^@/, '');
  value = value.replace(/^https?:\/\/t\.me\//, '');
  value = value.replace(/\/app\/?$/, '');
  value = value.replace(/\/+$/, '');
  value = value.replace(/[.,;:]+$/, '');
  return value.trim();
};

export type PublicSlugResolution = {
  slug: string;
  companyId: string | null;
  botId?: string | null;
  showcase?: any | null;
  source?: 'showcase' | 'workspace_compat' | 'bot_default' | 'bot_username' | 'none';
  compatibility?: {
    kind: 'legacy_workspace_public_owner';
  };
};

export type ResolvePublicSlugOptions = {
  allowWorkspaceFallback?: boolean;
};

const resolveWorkspaceSlug = async (candidate: string) => {
  try {
    const workspace = await getWorkspaceBySlug(candidate);
    if (workspace?.id) return workspace;
  } catch {
    // ignore workspace errors and continue
  }
  return null;
};

export const resolvePublicSlug = async (slug: string, options: ResolvePublicSlugOptions = {}): Promise<PublicSlugResolution> => {
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    return { slug: '', companyId: null, source: 'none' };
  }

  const normalizedLower = normalized.toLowerCase();

  try {
    const showcase = await showcaseService.getShowcaseBySlug(normalized);
    if (showcase?.workspaceId) {
      return {
        slug: normalized,
        companyId: showcase.workspaceId,
        botId: showcase.botId || null,
        showcase,
        source: 'showcase'
      };
    }
  } catch {
    // ignore showcase errors and continue
  }
  if (normalizedLower !== normalized) {
    try {
      const showcase = await showcaseService.getShowcaseBySlug(normalizedLower);
      if (showcase?.workspaceId) {
        return {
          slug: normalizedLower,
          companyId: showcase.workspaceId,
          botId: showcase.botId || null,
          showcase,
          source: 'showcase'
        };
      }
    } catch {
      // ignore showcase errors and continue
    }
  }

  if (options.allowWorkspaceFallback) {
    const workspace = await resolveWorkspaceSlug(normalized);
    if (workspace?.id) {
      return {
        slug: normalized,
        companyId: workspace.id,
        source: 'workspace_compat',
        compatibility: {
          kind: 'legacy_workspace_public_owner'
        }
      };
    }
    if (normalizedLower !== normalized) {
      const normalizedWorkspace = await resolveWorkspaceSlug(normalizedLower);
      if (normalizedWorkspace?.id) {
        return {
          slug: normalizedLower,
          companyId: normalizedWorkspace.id,
          source: 'workspace_compat',
          compatibility: {
            kind: 'legacy_workspace_public_owner'
          }
        };
      }
    }
  }

  const bots = await prisma.botConfig.findMany({
    where: { isEnabled: true },
    select: { id: true, companyId: true, config: true, name: true }
  });

  const normalizeBotSlug = (value: string) =>
    value.replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '').trim().toLowerCase();

  const matched = bots.find(bot => {
    const config = (bot.config || {}) as any;
    const showcaseSlug = normalizeBotSlug(String(config.defaultShowcaseSlug || ''));
    const username = normalizeBotSlug(String(config.botUsername || config.username || bot.name || ''));
    return showcaseSlug === normalizedLower || username === normalizedLower;
  });

  if (matched?.companyId) {
    const config = (matched.config || {}) as any;
    const showcaseSlug = String(config.defaultShowcaseSlug || '').toLowerCase();
    return {
      slug: normalized,
      companyId: matched.companyId,
      botId: matched.id,
      source: showcaseSlug === normalizedLower ? 'bot_default' : 'bot_username'
    };
  }

  return { slug: normalized, companyId: null, source: 'none' };
};
