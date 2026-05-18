import { describe, expect, it } from 'vitest';
import {
  CLEANUP_CONFIRM_PHRASE,
  parseCleanupTestDataArgs,
  validateCleanupTestDataOptions
} from './cleanup_test_data.helpers.js';

describe('cleanup test data helpers', () => {
  it('defaults to dry-run and requires an explicit company scope', () => {
    const options = parseCleanupTestDataArgs([]);

    expect(options.execute).toBe(false);
    expect(options.includePartners).toBe(false);
    expect(options.includeLogs).toBe(false);
    expect(validateCleanupTestDataOptions(options)).toContain('Pass --companyId=<workspaceId> or --all-companies.');
  });

  it('requires an exact confirmation phrase for execute mode', () => {
    const options = parseCleanupTestDataArgs(['--companyId=company_1', '--execute']);

    expect(options.execute).toBe(true);
    expect(validateCleanupTestDataOptions(options)).toContain(`Destructive mode requires --confirm=${CLEANUP_CONFIRM_PHRASE}.`);
  });

  it('accepts scoped destructive mode only with confirmation', () => {
    const options = parseCleanupTestDataArgs([
      '--companyId=company_1',
      '--execute',
      `--confirm=${CLEANUP_CONFIRM_PHRASE}`,
      '--include-partners',
      '--include-logs'
    ]);

    expect(options).toEqual({
      execute: true,
      companyId: 'company_1',
      allCompanies: false,
      includePartners: true,
      includeLogs: true,
      confirm: CLEANUP_CONFIRM_PHRASE
    });
    expect(validateCleanupTestDataOptions(options)).toEqual([]);
  });

  it('does not allow destructive all-companies cleanup', () => {
    const options = parseCleanupTestDataArgs([
      '--all-companies',
      '--execute',
      `--confirm=${CLEANUP_CONFIRM_PHRASE}`
    ]);

    expect(validateCleanupTestDataOptions(options)).toContain('Destructive mode is allowed only with --companyId, not --all-companies.');
  });
});
