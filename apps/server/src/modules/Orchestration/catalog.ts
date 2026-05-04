import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeHumanText } from './text.utils.js';

type CatalogItem = {
  key: string;
  refType: string;
  label: string;
  location: string;
  trustLevel: string;
  keywords: string[];
  sourceTypes?: string[];
  notes?: string;
};

export type SourceRefCandidate = {
  refType: string;
  label: string;
  location: string;
  trustLevel: string;
  freshnessState: string;
  rank: number;
  metadata?: Record<string, unknown>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../../..');

const INTERNAL_DOCS: CatalogItem[] = [
  {
    key: 'architecture',
    refType: 'INTERNAL_DOC',
    label: 'Platform Architecture',
    location: 'docs/ARCHITECTURE.md',
    trustLevel: 'HIGH',
    keywords: ['architecture', 'platform', 'workflow', 'dashboard', 'orchestrator', 'intake', 'automation'],
    sourceTypes: ['TASK', 'DOC_LINK', 'REPO', 'DATA_SOURCE', 'LINK']
  },
  {
    key: 'data-flow',
    refType: 'INTERNAL_DOC',
    label: 'Release Data Flow Map',
    location: 'docs/audit/release-20260218T152454Z/50_DATA_FLOW_MAP.md',
    trustLevel: 'HIGH',
    keywords: ['flow', 'ingestion', 'pipeline', 'event', 'dashboard', 'integration', 'intake'],
    sourceTypes: ['TASK', 'DATA_SOURCE', 'LINK']
  },
  {
    key: 'findings',
    refType: 'INTERNAL_DOC',
    label: 'Release Findings And Recommendations',
    location: 'docs/audit/release-20260218T152454Z/70_FINDINGS_AND_RECOMMENDATIONS.md',
    trustLevel: 'HIGH',
    keywords: ['risk', 'migration', 'validation', 'governance', 'audit'],
    sourceTypes: ['TASK', 'DATA_SOURCE', 'REPO']
  },
  {
    key: 'ingestion-unification',
    refType: 'INTERNAL_DOC',
    label: 'Stage 2 Ingestion Unification',
    location: 'docs/stage2/30_INGESTION_UNIFICATION.md',
    trustLevel: 'HIGH',
    keywords: ['ingestion', 'import', 'channel', 'pipeline'],
    sourceTypes: ['DATA_SOURCE', 'LINK']
  },
  {
    key: 'agent-arch',
    refType: 'INTERNAL_DOC',
    label: 'Internal Agent Architecture',
    location: '.agent/ARCHITECTURE.md',
    trustLevel: 'MEDIUM',
    keywords: ['agent', 'skill', 'routing', 'governance', 'orchestrator'],
    sourceTypes: ['TASK', 'LINK']
  },
  {
    key: 'routing-skill',
    refType: 'INTERNAL_DOC',
    label: 'Intelligent Routing Skill',
    location: '.agent/skills/intelligent-routing/SKILL.md',
    trustLevel: 'MEDIUM',
    keywords: ['routing', 'orchestrator', 'prompt', 'intake', 'skill'],
    sourceTypes: ['TASK', 'LINK']
  }
];

const OFFICIAL_DOCS: CatalogItem[] = [
  {
    key: 'responses-overview',
    refType: 'OFFICIAL_DOC',
    label: 'OpenAI Responses Overview',
    location: 'https://developers.openai.com/api/reference/responses/overview/',
    trustLevel: 'HIGH',
    keywords: ['openai', 'responses', 'model', 'tool', 'orchestration', 'agent'],
    sourceTypes: ['TASK', 'DOC_LINK', 'REPO', 'LINK']
  },
  {
    key: 'responses-create',
    refType: 'OFFICIAL_DOC',
    label: 'OpenAI Create Response Reference',
    location: 'https://developers.openai.com/api/reference/resources/responses/methods/create/',
    trustLevel: 'HIGH',
    keywords: ['openai', 'responses', 'previous_response_id', 'structured', 'tool', 'background'],
    sourceTypes: ['TASK', 'DOC_LINK', 'LINK']
  },
  {
    key: 'function-calling',
    refType: 'OFFICIAL_DOC',
    label: 'OpenAI Function Calling Guide',
    location: 'https://developers.openai.com/api/docs/guides/function-calling/',
    trustLevel: 'HIGH',
    keywords: ['tool', 'function', 'schema', 'structured', 'argument', 'prompt'],
    sourceTypes: ['TASK', 'DOC_LINK', 'LINK']
  },
  {
    key: 'prompt-engineering',
    refType: 'OFFICIAL_DOC',
    label: 'OpenAI Prompt Engineering Guide',
    location: 'https://developers.openai.com/api/docs/guides/prompt-engineering/',
    trustLevel: 'HIGH',
    keywords: ['prompt', 'prompting', 'instruction', 'model', 'gpt'],
    sourceTypes: ['TASK', 'DOC_LINK', 'LINK']
  },
  {
    key: 'reasoning-best-practices',
    refType: 'OFFICIAL_DOC',
    label: 'OpenAI Reasoning Best Practices',
    location: 'https://developers.openai.com/api/docs/guides/reasoning-best-practices/',
    trustLevel: 'HIGH',
    keywords: ['prompt', 'reasoning', 'developer message', 'delimiters', 'goal'],
    sourceTypes: ['TASK', 'DOC_LINK', 'LINK']
  },
  {
    key: 'background-mode',
    refType: 'OFFICIAL_DOC',
    label: 'OpenAI Background Mode Guide',
    location: 'https://developers.openai.com/api/docs/guides/background/',
    trustLevel: 'HIGH',
    keywords: ['background', 'retention', 'zdr', 'async'],
    sourceTypes: ['TASK', 'LINK']
  }
];

const EXTERNAL_REFERENCES: CatalogItem[] = [
  {
    key: 'awesome-openclaw',
    refType: 'EXTERNAL_REFERENCE',
    label: 'Awesome OpenClaw Usecases',
    location: 'https://github.com/hesamsheikh/awesome-openclaw-usecases',
    trustLevel: 'LOW',
    keywords: ['digest', 'dashboard', 'inbox', 'repo', 'knowledge', 'watch', 'report'],
    sourceTypes: ['TASK', 'REPO', 'LINK', 'DATA_SOURCE'],
    notes: 'Idea bank only. Do not treat as audited production implementation.'
  }
];

const buildInternalCandidate = (item: CatalogItem, score: number): SourceRefCandidate | null => {
  const absolutePath = path.join(repoRoot, item.location);
  if (!existsSync(absolutePath)) return null;

  let freshnessState = 'REVIEW';
  let mtime: string | null = null;
  try {
    const stats = statSync(absolutePath);
    mtime = stats.mtime.toISOString();
    freshnessState = (Date.now() - stats.mtimeMs) < 180 * 24 * 60 * 60 * 1000 ? 'FRESH' : 'REVIEW';
  } catch {
    freshnessState = 'REVIEW';
  }

  return {
    refType: item.refType,
    label: item.label,
    location: item.location,
    trustLevel: item.trustLevel,
    freshnessState,
    rank: Math.max(1, 100 - score),
    metadata: {
      key: item.key,
      absolutePath,
      mtime,
      notes: item.notes || undefined
    }
  };
};

const buildExternalCandidate = (item: CatalogItem, score: number): SourceRefCandidate => ({
  refType: item.refType,
  label: item.label,
  location: item.location,
  trustLevel: item.trustLevel,
  freshnessState: item.refType === 'OFFICIAL_DOC' ? 'REVIEW' : 'REVIEW_REQUIRED',
  rank: Math.max(1, 100 - score),
  metadata: {
    key: item.key,
    notes: item.notes || undefined
  }
});

const scoreCatalogItem = (item: CatalogItem, normalized: string, sourceType: string) => {
  let score = 0;
  if (item.sourceTypes?.includes(sourceType)) score += 8;
  for (const keyword of item.keywords) {
    if (normalized.includes(keyword)) score += 5;
  }
  if (item.refType === 'INTERNAL_DOC') score += 6;
  if (item.refType === 'OFFICIAL_DOC') score += 3;
  if (item.refType === 'OFFICIAL_DOC' && normalized.includes('openai')) score += 4;
  if (item.refType === 'EXTERNAL_REFERENCE') score -= 2;
  return score;
};

const buildUserSourceCandidate = (sourceUrl?: string | null): SourceRefCandidate | null => {
  const raw = String(sourceUrl || '').trim();
  if (!raw) return null;

  let trustLevel = 'MEDIUM';
  let refType = 'EXTERNAL_REFERENCE';
  if (/developers\.openai\.com|platform\.openai\.com/i.test(raw)) {
    refType = 'OFFICIAL_DOC';
    trustLevel = 'HIGH';
  } else if (/github\.com/i.test(raw)) {
    trustLevel = 'LOW';
  }

  return {
    refType,
    label: 'User Provided Source',
    location: raw,
    trustLevel,
    freshnessState: refType === 'OFFICIAL_DOC' ? 'REVIEW' : 'REVIEW_REQUIRED',
    rank: 1,
    metadata: {
      userProvided: true
    }
  };
};

export const buildRankedSourceRefs = (input: {
  sourceType: string;
  title?: string | null;
  inputText?: string | null;
  sourceUrl?: string | null;
}) => {
  const normalized = normalizeHumanText(
    [input.title, input.inputText, input.sourceUrl].filter(Boolean).join(' ')
  );

  const candidates: SourceRefCandidate[] = [];
  const userCandidate = buildUserSourceCandidate(input.sourceUrl);
  if (userCandidate) candidates.push(userCandidate);

  const allCatalogItems = [...INTERNAL_DOCS, ...OFFICIAL_DOCS, ...EXTERNAL_REFERENCES];
  const scored = allCatalogItems
    .map((item) => ({ item, score: scoreCatalogItem(item, normalized, input.sourceType) }))
    .filter(({ score, item }) => score > 0 || item.sourceTypes?.includes(input.sourceType))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const { item, score } of scored) {
    if (item.refType === 'INTERNAL_DOC') {
      const candidate = buildInternalCandidate(item, score);
      if (candidate) candidates.push(candidate);
      continue;
    }
    candidates.push(buildExternalCandidate(item, score));
  }

  const deduped = new Map<string, SourceRefCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.refType}:${candidate.location}`;
    const existing = deduped.get(key);
    if (!existing || candidate.rank < existing.rank) {
      deduped.set(key, candidate);
    }
  }

  const refTypePriority = (refType: string) => {
    if (refType === 'INTERNAL_DOC') return 1;
    if (refType === 'OFFICIAL_DOC') return 2;
    if (refType === 'EXTERNAL_REFERENCE') return 3;
    return 4;
  };

  return Array.from(deduped.values())
    .sort((a, b) => {
      const priorityDiff = refTypePriority(a.refType) - refTypePriority(b.refType);
      if (priorityDiff !== 0) return priorityDiff;
      return a.rank - b.rank;
    })
    .slice(0, 8)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
};
