export const CLEANUP_CONFIRM_PHRASE = 'RESET_TEST_DATA';

export type CleanupTestDataOptions = {
  execute: boolean;
  companyId?: string;
  allCompanies: boolean;
  includePartners: boolean;
  includeLogs: boolean;
  includeCrm: boolean;
  confirm?: string;
};

const readValueArg = (args: string[], name: string) => {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
};

export const parseCleanupTestDataArgs = (args: string[]): CleanupTestDataOptions => ({
  execute: args.includes('--execute'),
  companyId: readValueArg(args, 'companyId'),
  allCompanies: args.includes('--all-companies'),
  includePartners: args.includes('--include-partners'),
  includeLogs: args.includes('--include-logs'),
  includeCrm: args.includes('--include-crm'),
  confirm: readValueArg(args, 'confirm')
});

export const validateCleanupTestDataOptions = (options: CleanupTestDataOptions) => {
  const errors: string[] = [];

  if (!options.companyId && !options.allCompanies) {
    errors.push('Pass --companyId=<workspaceId> or --all-companies.');
  }

  if (options.companyId && options.allCompanies) {
    errors.push('Use either --companyId or --all-companies, not both.');
  }

  if (options.execute && options.allCompanies) {
    errors.push('Destructive mode is allowed only with --companyId, not --all-companies.');
  }

  if (options.execute && options.confirm !== CLEANUP_CONFIRM_PHRASE) {
    errors.push(`Destructive mode requires --confirm=${CLEANUP_CONFIRM_PHRASE}.`);
  }

  return errors;
};

export const buildCleanupTestDataUsage = () => [
  'Usage:',
  '  npm run cleanup:test-data -- --companyId=<workspaceId>',
  '  npm run cleanup:test-data -- --companyId=<workspaceId> --include-partners --include-logs --include-crm',
  `  npm run cleanup:test-data -- --companyId=<workspaceId> --execute --confirm=${CLEANUP_CONFIRM_PHRASE}`,
  '',
  'Default mode is DRY_RUN.',
  'Preserved by design: inventory/car listings, showcases, bot configs, admin users/memberships.',
  'Optional destructive scopes: --include-partners, --include-logs, --include-crm.'
].join('\n');
