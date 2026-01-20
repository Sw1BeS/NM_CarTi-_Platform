import { prisma } from '../../services/prisma.js';

export const logSystem = async (module: string, action: string, status: string, message: string) => {
    await prisma.systemLog.create({
        data: { module, action, status, message }
    });
};
