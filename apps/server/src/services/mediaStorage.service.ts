import fs from 'fs';
import path from 'path';
import axios from 'axios';

const STORAGE_ROOT = process.env.MEDIA_STORAGE_PATH || '/srv/cartie/storage';
const MEDIA_ROOT = path.join(STORAGE_ROOT, 'media');
const MAX_MEDIA_BYTES = Number(process.env.MEDIA_MAX_BYTES || 25 * 1024 * 1024);

export class MediaLimitError extends Error {
    code = 'MEDIA_TOO_LARGE';
    sizeBytes: number;
    limitBytes: number;

    constructor(sizeBytes: number, limitBytes: number) {
        super(`Media too large: ${sizeBytes} > ${limitBytes}`);
        this.sizeBytes = sizeBytes;
        this.limitBytes = limitBytes;
    }
}

const ensureDir = async (dir: string) => {
    await fs.promises.mkdir(dir, { recursive: true });
};

const sanitizeName = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, '_');

const buildPublicUrl = (relativePath: string) =>
    `/media/${relativePath.replace(/\\/g, '/')}`;

const ensureSizeWithinLimit = (sizeBytes: number | null | undefined) => {
    if (!sizeBytes) return;
    if (sizeBytes > MAX_MEDIA_BYTES) {
        throw new MediaLimitError(sizeBytes, MAX_MEDIA_BYTES);
    }
};

const buildMediaDir = (companyId?: string | null, sourceChatId?: string | null, sourceMessageId?: number | null) => {
    const safeCompany = sanitizeName(companyId || 'unknown');
    const safeChat = sanitizeName(sourceChatId || 'unknown');
    const safeMessage = sanitizeName(sourceMessageId !== undefined && sourceMessageId !== null ? String(sourceMessageId) : 'unknown');
    return path.join(MEDIA_ROOT, safeCompany, safeChat, safeMessage);
};

export async function saveBufferToStorage(buffer: Buffer, filename: string, subdir = 'telegram') {
    const safeName = sanitizeName(filename);
    const dir = path.join(STORAGE_ROOT, subdir);
    await ensureDir(dir);
    const filePath = path.join(dir, safeName);
    await fs.promises.writeFile(filePath, buffer);
    return {
        url: buildPublicUrl(`${subdir}/${safeName}`),
        path: filePath
    };
}

export async function saveMediaBuffer(params: {
    buffer: Buffer;
    filename: string;
    companyId?: string | null;
    sourceChatId?: string | null;
    sourceMessageId?: number | null;
}) {
    ensureSizeWithinLimit(params.buffer.length);
    const dir = buildMediaDir(params.companyId, params.sourceChatId, params.sourceMessageId);
    await ensureDir(dir);
    const safeName = sanitizeName(params.filename);
    const filePath = path.join(dir, safeName);
    await fs.promises.writeFile(filePath, params.buffer);
    const relative = path.relative(MEDIA_ROOT, filePath);
    return {
        url: buildPublicUrl(relative),
        path: filePath
    };
}

export async function saveTelegramBotFile(
    botToken: string,
    fileId: string,
    context?: {
        companyId?: string | null;
        sourceChatId?: string | null;
        sourceMessageId?: number | null;
        fileSize?: number | null;
    }
) {
    const fileRes = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
        params: { file_id: fileId },
        timeout: 15000
    });

    if (!fileRes.data?.ok) {
        throw new Error(fileRes.data?.description || 'Telegram getFile failed');
    }

    const filePath = fileRes.data.result.file_path as string;
    const reportedSize = fileRes.data.result.file_size as number | undefined;
    ensureSizeWithinLimit(context?.fileSize || reportedSize);
    const ext = path.extname(filePath) || '.jpg';
    const filename = `${sanitizeName(fileId)}${ext}`;

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const response = await axios.get(fileUrl, { responseType: 'stream', timeout: 20000 });
    const contentLength = Number(response.headers['content-length'] || 0) || undefined;
    ensureSizeWithinLimit(contentLength);

    const chunks: Buffer[] = [];
    for await (const chunk of response.data) {
        chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const saved = await saveMediaBuffer({
        buffer,
        filename,
        companyId: context?.companyId,
        sourceChatId: context?.sourceChatId,
        sourceMessageId: context?.sourceMessageId
    });

    return {
        url: saved.url,
        path: saved.path,
        fileId,
        filePath
    };
}
