import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { previewParsedMessage } from '../../../services/mtproto-mapping.service.js';

const PREVIEW_LIMIT = 10;
const BATCH_LIMIT = 50;
const SKIP_REASON_MESSAGES: Record<string, string> = {
    NO_CAR_DATA: 'No car data detected',
    NO_SIGNALS: 'Missing price/year/mileage signals',
    FILTERED: 'Filtered by import rules',
    ALREADY_IMPORTED: 'Already imported',
    SKIPPED: 'Skipped'
};

type ImportPayload = {
    fromDate?: string;
    toDate?: string;
    mode?: string;
};

const parseDate = (value: any, label: string) => {
    if (!value) throw new Error(`${label} is required`);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${label} is invalid`);
    }
    return parsed;
};

const normalizeMode = (value: any) => {
    const mode = String(value || 'INVENTORY').toUpperCase();
    return mode === 'DRAFT_ONLY' ? 'DRAFT_ONLY' : 'INVENTORY';
};

const buildSkipReason = (reason?: string) => {
    const code = reason || 'SKIPPED';
    return {
        code,
        message: SKIP_REASON_MESSAGES[code] || 'Skipped'
    };
};

export class MTProtoImportService {
    private async collectPreviewMessages(connectorId: string, channelId: string, fromDate: Date, toDate: Date, limit: number) {
        const results: any[] = [];

        let offsetDate = Math.floor(toDate.getTime() / 1000);
        let offsetId = 0;
        let done = false;

        while (!done && results.length < limit) {
            const batch = await MTProtoService.getHistory(connectorId, channelId, BATCH_LIMIT, offsetId, offsetDate);
            if (!batch.length) break;

            for (const msg of batch) {
                if (!msg.message) continue;
                const msgDate = new Date(msg.date * 1000);

                if (msgDate < fromDate) {
                    done = true;
                    break;
                }
                if (msgDate >= toDate) continue;

                results.push(msg);
                if (results.length >= limit) {
                    done = true;
                    break;
                }
            }

            const last = batch[batch.length - 1];
            if (!last) break;
            offsetId = last.id;
            offsetDate = last.date;
        }

        return results;
    }

    async previewImport(connectorId: string, sourceId: string, payload: ImportPayload) {
        const fromDate = parseDate(payload?.fromDate, 'fromDate');
        const toDate = parseDate(payload?.toDate, 'toDate');
        if (fromDate >= toDate) throw new Error('fromDate must be < toDate');

        const mode = normalizeMode(payload?.mode);

        const source = await prisma.channelSource.findUnique({
            where: { id: sourceId },
            include: { connector: true }
        });

        if (!source || source.connectorId !== connectorId) throw new Error('Channel source not found');
        if (source.connector.status !== 'READY') throw new Error('Connector is not ready');

        const messages = await this.collectPreviewMessages(connectorId, source.channelId, fromDate, toDate, PREVIEW_LIMIT);

        const preview = [];
        for (const msg of messages) {
            const message = {
                chatId: source.channelId,
                messageId: msg.id,
                text: msg.message,
                date: new Date(msg.date * 1000),
                mediaUrls: [],
                mediaGroupKey: msg.groupedId?.toString()
            };

            const result = await previewParsedMessage(message, source, mode);
            const mapped = result.action === 'CREATE';
            preview.push({
                messageId: msg.id,
                date: message.date,
                textPreview: (message.text || '').slice(0, 200),
                action: result.action,
                mapped,
                skipReason: mapped ? undefined : buildSkipReason(result.reason),
                reason: result.reason,
                mappedData: result.mapped
            });
        }

        return {
            mode,
            fromDate,
            toDate,
            items: preview
        };
    }

    async createImportJob(companyId: string, connectorId: string, sourceId: string, payload: ImportPayload) {
        const fromDate = parseDate(payload?.fromDate, 'fromDate');
        const toDate = parseDate(payload?.toDate, 'toDate');
        if (fromDate >= toDate) throw new Error('fromDate must be < toDate');

        const mode = normalizeMode(payload?.mode);

        const source = await prisma.channelSource.findUnique({
            where: { id: sourceId },
            include: { connector: true }
        });

        if (!source || source.connectorId !== connectorId) throw new Error('Channel source not found');
        if (source.connector.companyId !== companyId) throw new Error('Forbidden');

        return prisma.telegramImportJob.create({
            data: {
                companyId,
                connectorId,
                channelSourceId: sourceId,
                fromDate,
                toDate,
                mode,
                status: 'PENDING'
            }
        });
    }

    async listJobs(companyId: string, sourceId?: string) {
        return prisma.telegramImportJob.findMany({
            where: {
                companyId,
                ...(sourceId ? { channelSourceId: sourceId } : {})
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
    }
}
