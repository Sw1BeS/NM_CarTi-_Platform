import fs from 'fs';
import path from 'path';
import { prisma } from '../src/services/prisma.js';

type ReconcileOptions = {
    execute: boolean;
    deleteOrphans: boolean;
    clearMissingRefs: boolean;
    reportFile?: string;
};

const parseArgs = (): ReconcileOptions => {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const deleteOrphans = args.includes('--delete-orphans');
    const clearMissingRefs = args.includes('--clear-missing-refs');
    const reportArg = args.find((arg) => arg.startsWith('--report='));
    const reportFile = reportArg ? reportArg.split('=').slice(1).join('=') : undefined;
    return { execute, deleteOrphans, clearMissingRefs, reportFile };
};

const STORAGE_ROOT = process.env.MEDIA_STORAGE_PATH || '/srv/cartie/storage';
const MEDIA_ROOT = path.join(STORAGE_ROOT, 'media');

const normalizeRelPath = (value: string): string | null => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('/media/')) {
        return trimmed.slice('/media/'.length).replace(/\\/g, '/');
    }

    if (trimmed.startsWith('media/')) {
        return trimmed.slice('media/'.length).replace(/\\/g, '/');
    }

    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const parsed = new URL(trimmed);
            const marker = '/media/';
            const idx = parsed.pathname.indexOf(marker);
            if (idx >= 0) {
                return parsed.pathname.slice(idx + marker.length).replace(/\\/g, '/');
            }
        } catch {
            return null;
        }
    }

    return null;
};

const collectMediaRefs = (value: unknown, out: Set<string>) => {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
        const rel = normalizeRelPath(value);
        if (rel) out.add(rel);
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectMediaRefs(item, out));
        return;
    }

    if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((item) => collectMediaRefs(item, out));
    }
};

const scrubMissingRefs = (value: unknown, missingSet: Set<string>): unknown => {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        const rel = normalizeRelPath(value);
        if (rel && missingSet.has(rel)) return null;
        return value;
    }

    if (Array.isArray(value)) {
        const next = value
            .map((item) => scrubMissingRefs(item, missingSet))
            .filter((item) => item !== null && item !== undefined);
        return next;
    }

    if (typeof value === 'object') {
        const next: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
            const sanitized = scrubMissingRefs(item, missingSet);
            if (sanitized !== null && sanitized !== undefined) {
                next[key] = sanitized;
            }
        });
        return next;
    }

    return value;
};

const scrubMediaPayload = (
    thumbnail: string | null,
    mediaUrls: string[] | null,
    mediaItems: unknown,
    missingSet: Set<string>
) => {
    const nextThumbnail = (() => {
        if (!thumbnail) return null;
        const rel = normalizeRelPath(thumbnail);
        if (rel && missingSet.has(rel)) return null;
        return thumbnail;
    })();

    const nextMediaUrls = (mediaUrls || []).filter((item) => {
        const rel = normalizeRelPath(item);
        return !(rel && missingSet.has(rel));
    });

    const nextMediaItems = scrubMissingRefs(mediaItems, missingSet);

    const changed = (
        nextThumbnail !== (thumbnail || null) ||
        JSON.stringify(nextMediaUrls) !== JSON.stringify(mediaUrls || []) ||
        JSON.stringify(nextMediaItems) !== JSON.stringify(mediaItems)
    );

    return {
        changed,
        data: {
            thumbnail: nextThumbnail,
            mediaUrls: nextMediaUrls,
            mediaItems: nextMediaItems as any
        }
    };
};

const listFilesRecursive = (rootDir: string): string[] => {
    if (!fs.existsSync(rootDir)) return [];

    const output: string[] = [];
    const stack = [rootDir];

    while (stack.length) {
        const current = stack.pop() as string;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const abs = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(abs);
            } else if (entry.isFile()) {
                const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
                output.push(rel);
            }
        }
    }

    return output.sort();
};

async function main() {
    const options = parseArgs();
    const dbRefs = new Set<string>();

    console.log(`[media-reconcile] mode=${options.execute ? 'EXECUTE' : 'DRY-RUN'}`);
    console.log(`[media-reconcile] mediaRoot=${MEDIA_ROOT}`);

    const [cars, variants] = await Promise.all([
        prisma.carListing.findMany({
            select: {
                id: true,
                thumbnail: true,
                mediaUrls: true,
                mediaItems: true
            }
        }),
        prisma.requestVariant.findMany({
            select: {
                id: true,
                thumbnail: true,
                mediaUrls: true,
                mediaItems: true
            }
        })
    ]);

    for (const car of cars) {
        collectMediaRefs(car.thumbnail, dbRefs);
        collectMediaRefs(car.mediaUrls, dbRefs);
        collectMediaRefs(car.mediaItems as unknown, dbRefs);
    }

    for (const variant of variants) {
        collectMediaRefs(variant.thumbnail, dbRefs);
        collectMediaRefs(variant.mediaUrls, dbRefs);
        collectMediaRefs(variant.mediaItems as unknown, dbRefs);
    }

    const fsFiles = new Set(listFilesRecursive(MEDIA_ROOT));

    const missingRefs = Array.from(dbRefs).filter((ref) => !fsFiles.has(ref)).sort();
    const orphanFiles = Array.from(fsFiles).filter((file) => !dbRefs.has(file)).sort();
    const criticalMissingRefs = missingRefs.filter((ref) => !ref.startsWith('_smoke/'));
    const criticalOrphanFiles = orphanFiles.filter((file) => !file.startsWith('_smoke/'));

    let clearedMissingRefs = { carListing: 0, requestVariant: 0 };
    if (options.execute && options.clearMissingRefs && criticalMissingRefs.length > 0) {
        const missingSet = new Set(criticalMissingRefs);

        for (const car of cars) {
            const patched = scrubMediaPayload(
                car.thumbnail,
                (car.mediaUrls || []) as string[],
                car.mediaItems as unknown,
                missingSet
            );
            if (!patched.changed) continue;
            await prisma.carListing.update({
                where: { id: car.id },
                data: patched.data
            });
            clearedMissingRefs.carListing += 1;
        }

        for (const variant of variants) {
            const patched = scrubMediaPayload(
                variant.thumbnail,
                (variant.mediaUrls || []) as string[],
                variant.mediaItems as unknown,
                missingSet
            );
            if (!patched.changed) continue;
            await prisma.requestVariant.update({
                where: { id: variant.id },
                data: patched.data
            });
            clearedMissingRefs.requestVariant += 1;
        }
    }

    let deletedOrphans = 0;
    if (options.execute && options.deleteOrphans) {
        for (const rel of criticalOrphanFiles) {
            const abs = path.join(MEDIA_ROOT, rel);
            if (fs.existsSync(abs)) {
                fs.unlinkSync(abs);
                deletedOrphans += 1;
            }
        }
    }

    const report = {
        timestamp: new Date().toISOString(),
        mode: options.execute ? 'EXECUTE' : 'DRY-RUN',
        mediaRoot: MEDIA_ROOT,
        counts: {
            dbRefs: dbRefs.size,
            fsFiles: fsFiles.size,
            missingRefs: missingRefs.length,
            orphanFiles: orphanFiles.length,
            criticalMissingRefs: criticalMissingRefs.length,
            criticalOrphanFiles: criticalOrphanFiles.length
        },
        actions: {
            clearedMissingRefs,
            deletedOrphans
        },
        samples: {
            missingRefs: missingRefs.slice(0, 50),
            orphanFiles: orphanFiles.slice(0, 50),
            criticalMissingRefs: criticalMissingRefs.slice(0, 50),
            criticalOrphanFiles: criticalOrphanFiles.slice(0, 50)
        }
    };

    if (options.reportFile) {
        const absReport = path.resolve(options.reportFile);
        fs.mkdirSync(path.dirname(absReport), { recursive: true });
        fs.writeFileSync(absReport, JSON.stringify(report, null, 2));
        console.log(`[media-reconcile] report=${absReport}`);
    }

    console.log('[media-reconcile] summary');
    console.log(JSON.stringify(report.counts, null, 2));

    if (report.counts.criticalMissingRefs > 0) {
        console.error('[media-reconcile] critical missing references detected');
        process.exitCode = 2;
    }
}

main()
    .catch((error) => {
        console.error('[media-reconcile] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
