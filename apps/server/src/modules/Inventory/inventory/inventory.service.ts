// @ts-ignore
import { DraftSource } from '@prisma/client';
import { prisma } from '../../../services/prisma.js';
import { logSystem } from '../../Core/system/systemLog.service.js';

export const importDraft = async (data: any) => {
    try {
        await prisma.draft.create({
            data: {
                source: DraftSource.EXTENSION,
                title: data.title,
                price: data.price,
                url: data.url,
                description: data.description,
                status: 'PENDING'
            }
        });
        await logSystem('Extension', 'Import', 'OK', `Imported ${data.title}`);
        return true;
    } catch (e: any) {
        await logSystem('Extension', 'Import', 'ERROR', e.message);
        return false;
    }
};
