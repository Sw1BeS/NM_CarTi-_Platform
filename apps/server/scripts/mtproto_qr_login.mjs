import dotenv from 'dotenv';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Logger } from 'telegram/extensions/Logger.js';

dotenv.config({ path: '/srv/cartie/apps/server/.env' });

const connectorId = process.argv[2] || 'cmqesrkcm000j73wn2fvrefne';
const prisma = new PrismaClient();
const logger = new Logger({ level: 'error' });

const json = (payload) => console.log(JSON.stringify(payload));

const clearAuthAttemptData = {
  authSessionString: null,
  authPhoneCodeHash: null,
  authPhone: null,
  authApiId: null,
  authApiHash: null,
  authSentCodeType: null,
  authNextCodeType: null,
  authCodeLength: null,
  authTimeoutAt: null,
  authRequestedAt: null
};

const main = async () => {
  const connector = await prisma.mTProtoConnector.findUnique({ where: { id: connectorId } });
  if (!connector) throw new Error(`Connector not found: ${connectorId}`);

  const apiId = connector.workspaceApiId || Number(process.env.TG_API_ID);
  const apiHash = connector.workspaceApiHash || process.env.TG_API_HASH;
  if (!apiId || !apiHash) throw new Error('Missing Telegram apiId/apiHash');

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
    baseLogger: logger
  });

  await client.connect();
  json({ event: 'started', connectorId, phone: connector.phone || null });

  const user = await client.signInUserWithQrCode(
    { apiId, apiHash },
    {
      qrCode: async ({ token, expires }) => {
        const encoded = Buffer.from(token).toString('base64url');
        const url = `tg://login?token=${encoded}`;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = `/tmp/cartie-mtproto-qr-${stamp}.png`;
        execFileSync('qrencode', ['-o', file, '-s', '8', '-m', '2', url]);
        const expiresAt = new Date(Number(expires) * 1000).toISOString();
        json({ event: 'qr', file, expiresAt });
      },
      password: async () => {
        if (process.env.TG_2FA_PASSWORD) return process.env.TG_2FA_PASSWORD;
        json({ event: 'password_needed' });
        throw new Error('PASSWORD_NEEDED');
      },
      onError: async (error) => {
        json({ event: 'auth_error', message: error?.errorMessage || error?.message || String(error) });
        return false;
      }
    }
  );

  const sessionString = client.session.save();
  await prisma.mTProtoConnector.update({
    where: { id: connectorId },
    data: {
      status: 'READY',
      sessionString,
      connectedAt: new Date(),
      lastError: null,
      ...clearAuthAttemptData
    }
  });

  json({
    event: 'success',
    connectorId,
    user: {
      id: user?.id?.toString?.() || null,
      firstName: user?.firstName || null,
      username: user?.username || null,
      phone: user?.phone || null
    }
  });
  await client.disconnect().catch(() => undefined);
};

main()
  .catch(async (error) => {
    json({ event: 'fatal', message: error?.errorMessage || error?.message || String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
