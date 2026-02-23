import axios from 'axios';
import { externalCache } from './cache.js';
import { withBackoff } from './backoff.js';
import { externalDomainRateLimiter } from './domainRateLimiter.js';

type RobotsRules = {
  disallowAny: string[];
  allowAny: string[];
  disallowBot: string[];
  allowBot: string[];
};

const ROBOTS_TTL_MS = 45 * 60 * 1000;

const normalizeRule = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('/')) return `/${raw}`;
  return raw;
};

const parseRobots = (raw: string): RobotsRules => {
  const rules: RobotsRules = {
    disallowAny: [],
    allowAny: [],
    disallowBot: [],
    allowBot: []
  };

  const lines = String(raw || '').split(/\r?\n/);
  let currentAgents: string[] = [];

  for (const lineRaw of lines) {
    const line = lineRaw.split('#')[0]?.trim() || '';
    if (!line) continue;

    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      continue;
    }

    if (key !== 'allow' && key !== 'disallow') {
      if (key === 'sitemap') {
        currentAgents = [];
      }
      continue;
    }

    const rule = normalizeRule(value);
    const targetsAny = currentAgents.length === 0 || currentAgents.includes('*');
    const targetsBot = currentAgents.some(agent => agent.includes('cartiebot') || agent.includes('cartie'));

    if (key === 'allow') {
      if (targetsAny) rules.allowAny.push(rule);
      if (targetsBot) rules.allowBot.push(rule);
    } else {
      if (targetsAny) rules.disallowAny.push(rule);
      if (targetsBot) rules.disallowBot.push(rule);
    }
  }

  return rules;
};

const ruleMatchLength = (path: string, rules: string[]) => {
  let longest = -1;
  for (const ruleRaw of rules) {
    const rule = normalizeRule(ruleRaw);
    if (!rule) continue;
    if (path.startsWith(rule)) {
      longest = Math.max(longest, rule.length);
    }
  }
  return longest;
};

const fetchRobotsForHost = async (host: string): Promise<RobotsRules> => {
  const cacheKey = `robots:${host}`;
  return externalCache.getOrSet(cacheKey, ROBOTS_TTL_MS, async () => {
    const url = `https://${host}/robots.txt`;
    await externalDomainRateLimiter.waitTurn(url);

    try {
      const response = await withBackoff(() => axios.get<string>(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'CartieBot/1.0 (+https://cartie.local)'
        },
        responseType: 'text',
        validateStatus: (status) => status >= 200 && status < 500
      }));

      if (!response?.data || response.status >= 400) {
        return {
          disallowAny: [],
          allowAny: [],
          disallowBot: [],
          allowBot: []
        };
      }

      return parseRobots(response.data);
    } catch {
      return {
        disallowAny: [],
        allowAny: [],
        disallowBot: [],
        allowBot: []
      };
    }
  });
};

export const isRobotsAllowed = async (targetUrl: string) => {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { allowed: false, reason: 'invalid_url' } as const;
  }

  const rules = await fetchRobotsForHost(parsed.hostname.toLowerCase());
  const path = parsed.pathname || '/';

  const allowBot = ruleMatchLength(path, rules.allowBot);
  const disallowBot = ruleMatchLength(path, rules.disallowBot);
  const allowAny = ruleMatchLength(path, rules.allowAny);
  const disallowAny = ruleMatchLength(path, rules.disallowAny);

  const bestAllow = Math.max(allowBot, allowAny);
  const bestDisallow = Math.max(disallowBot, disallowAny);

  if (bestDisallow < 0) return { allowed: true, reason: 'no_disallow' } as const;
  if (bestAllow >= bestDisallow) return { allowed: true, reason: 'allow_override' } as const;
  return { allowed: false, reason: 'disallow' } as const;
};
