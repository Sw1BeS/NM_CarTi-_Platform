import { describe, expect, it } from 'vitest';
import {
    resolveSalesDriveConfigRows,
    summarizeSalesDriveSyncStatus
} from '../../../web/src/pages/app/integrations/salesdriveStatus';

describe('SalesDrive admin status helpers', () => {
    it('summarizes queue counts and newest safe recent events for the admin UI', () => {
        const summary = summarizeSalesDriveSyncStatus({
            counts: { queued: 2, sent: 5, failed: 1, skipped: 3 },
            lastSent: { requestPublicId: 'REQ-44', message: 'sent ok', createdAt: '2026-05-19T10:00:00Z' },
            lastError: { requestPublicId: 'REQ-45', message: 'write disabled', createdAt: '2026-05-19T11:00:00Z' },
            recent: [
                { requestPublicId: 'REQ-45', action: 'REQUEST_SYNC_QUEUED', status: 'ERROR', message: 'write disabled' },
                { requestPublicId: 'REQ-44', action: 'REQUEST_SYNC_SENT', status: 'OK', message: 'sent ok' }
            ]
        });

        expect(summary.totals).toEqual([
            { label: 'Queued', value: 2, tone: 'warn' },
            { label: 'Sent', value: 5, tone: 'success' },
            { label: 'Failed', value: 1, tone: 'danger' },
            { label: 'Skipped', value: 3, tone: 'muted' }
        ]);
        expect(summary.lastSentLabel).toBe('REQ-44 · sent ok');
        expect(summary.lastErrorLabel).toBe('REQ-45 · write disabled');
        expect(summary.recent[0].label).toBe('REQ-45 · REQUEST_SYNC_QUEUED · ERROR');
    });

    it('shows SalesDrive env flags without exposing secrets', () => {
        const rows = resolveSalesDriveConfigRows({
            configured: true,
            syncEnabled: false,
            writeEnabled: false,
            missing: ['SALESDRIVE_API_KEY'],
            apiKeyMasked: 'configured'
        });

        expect(rows).toContainEqual({ label: 'Configured', value: 'Yes', tone: 'success' });
        expect(rows).toContainEqual({ label: 'Sync queue', value: 'Disabled', tone: 'muted' });
        expect(rows).toContainEqual({ label: 'Write access', value: 'Disabled', tone: 'muted' });
        expect(rows).toContainEqual({ label: 'Missing env', value: 'SALESDRIVE_API_KEY', tone: 'warn' });
        expect(rows.map((row) => row.value).join(' ')).not.toMatch(/token|password|secret/i);
    });
});
