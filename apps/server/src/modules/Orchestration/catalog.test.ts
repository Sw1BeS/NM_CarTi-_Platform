import { describe, expect, it } from 'vitest';
import { buildRankedSourceRefs } from './catalog.js';

describe('buildRankedSourceRefs', () => {
  it('prefers internal docs over official docs and external references', () => {
    const refs = buildRankedSourceRefs({
      sourceType: 'TASK',
      inputText: 'Build a prompt orchestration dashboard with digest workflows and repo watches'
    });

    const firstInternalRank = refs.find((ref) => ref.refType === 'INTERNAL_DOC')?.rank ?? 999;
    const firstOfficialRank = refs.find((ref) => ref.refType === 'OFFICIAL_DOC')?.rank ?? 999;
    const firstExternalRank = refs.find((ref) => ref.refType === 'EXTERNAL_REFERENCE')?.rank ?? 999;

    expect(firstInternalRank).toBeLessThan(firstOfficialRank);
    expect(firstOfficialRank).toBeLessThan(firstExternalRank);
  });

  it('marks third-party references as low trust', () => {
    const refs = buildRankedSourceRefs({
      sourceType: 'REPO',
      inputText: 'Watch digest dashboard repo patterns',
      sourceUrl: 'https://github.com/hesamsheikh/awesome-openclaw-usecases'
    });

    const thirdPartyRefs = refs.filter((ref) => ref.refType === 'EXTERNAL_REFERENCE');
    expect(thirdPartyRefs.length).toBeGreaterThan(0);
    expect(thirdPartyRefs.every((ref) => ref.trustLevel === 'LOW' || ref.label === 'User Provided Source')).toBe(true);
  });
});
