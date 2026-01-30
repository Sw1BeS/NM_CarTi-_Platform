import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { pipeline } from 'stream/promises';

const STORAGE_ROOT = process.env.MEDIA_STORAGE_PATH || '/srv/cartie/storage';
const TELEGRAM_DIR = path.join(STORAGE_ROOT, 'telegram');

const ensureDir = async (dir: string) => {
    await fs.promises.mkdir(dir, { recursive: true });
};

const sanitizeName = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, '_');

const buildPublicUrl = (subdir: string, filename: string) =>
    `/media/${subdir}/${filename}`;

export async function saveBufferToStorage(buffer: Buffer, filename: string, subdir = 'telegram') {
    const safeName = sanitizeName(filename);
    const dir = path.join(STORAGE_ROOT, subdir);
    await ensureDir(dir);
    const filePath = path.join(dir, safeName);
    await fs.promises.writeFile(filePath, buffer);
    return {
        url: buildPublicUrl(subdir, safeName),
        path: filePath
    };
}

export async function saveTelegramBotFile(botToken: string, fileId: string, prefix = 'tg') {
    const fileRes = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
        params: { file_id: fileId },
        timeout: 15000
    });

    if (!fileRes.data?.ok) {
        throw new Error(fileRes.data?.description || 'Telegram getFile failed');
    }

    const filePath = fileRes.data.result.file_path as string;
    const ext = path.extname(filePath) || '.jpg';
    const filename = `${prefix}_${Date.now()}_${sanitizeName(fileId)}${ext}`;

    await ensureDir(TELEGRAM_DIR);
    const destPath = path.join(TELEGRAM_DIR, filename);

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const response = await axios.get(fileUrl, { responseType: 'stream', timeout: 20000 });
    await pipeline(response.data, fs.createWriteStream(destPath));

    return {
        url: buildPublicUrl('telegram', filename),
        path: destPath,
        fileId,
        filePath
    };
}
