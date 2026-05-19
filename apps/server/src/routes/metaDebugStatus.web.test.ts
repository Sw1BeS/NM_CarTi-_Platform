import { describe, expect, it } from 'vitest';
import {
    resolveMetaDebugRows,
    summarizeMetaDebug
} from '../../../web/src/pages/app/integrations/metaDebugStatus';

describe('Meta debug admin status helpers', () => {
    it('summarizes CAPI status, dispatch counts and dedup contract for the admin UI', () => {
        const summary = summarizeMetaDebug({
            capiEnabled: false,
            counts: {
                byStatus: { SUCCESS: 3, ERROR: 1 },
                byAction: { Lead: 2, ViewContent: 2 }
            },
            lastSent: {
                action: 'Lead',
                status: 'SUCCESS',
                entityId: 'event_1',
                message: 'Meta CAPI event Lead sent'
            },
            lastError: {
                action: 'Lead',
                status: 'ERROR',
                entityId: 'event_2',
                message: 'Bad token [redacted-token]'
            },
            dedup: {
                eventIdField: 'event_id',
                idempotencyKey: 'IntegrationEventLog.idempotencyKey'
            }
        });

        expect(summary.statusTotals).toEqual([
            { label: 'SUCCESS', value: 3, tone: 'success' },
            { label: 'ERROR', value: 1, tone: 'danger' }
        ]);
        expect(summary.actionTotals).toEqual([
            { label: 'Lead', value: 2, tone: 'muted' },
            { label: 'ViewContent', value: 2, tone: 'muted' }
        ]);
        expect(summary.lastSentLabel).toBe('Lead · event_1 · Meta CAPI event Lead sent');
        expect(summary.lastErrorLabel).toBe('Lead · event_2 · Bad token [redacted-token]');
        expect(summary.dedupLabel).toBe('event_id + IntegrationEventLog.idempotencyKey');
    });

    it('shows feature flags without exposing Meta credentials', () => {
        const rows = resolveMetaDebugRows({
            capiEnabled: true,
            dedup: { eventIdField: 'event_id', idempotencyKey: 'IntegrationEventLog.idempotencyKey' },
            lastSent: null,
            lastError: null,
            counts: { byStatus: {}, byAction: {} }
        });

        expect(rows).toContainEqual({ label: 'CAPI dispatch', value: 'Enabled', tone: 'success' });
        expect(rows).toContainEqual({ label: 'Dedup key', value: 'event_id + IntegrationEventLog.idempotencyKey', tone: 'success' });
        expect(rows.map(row => row.value).join(' ')).not.toMatch(/access|token|secret|password/i);
    });
});
