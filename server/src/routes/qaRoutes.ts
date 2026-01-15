import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { parseListingFromUrl } from '../services/parser.js';
import { generateRequestLink } from '../utils/deeplink.utils.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/parse', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await parseListingFromUrl(url);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'parse failed' });
  }
});

router.get('/simulate/start', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const type = req.query.type as string;
  const requestId = req.query.requestId as string;
  const dealerId = req.query.dealerId as string;
  const bot = await prisma.botConfig.findFirst({ where: { isEnabled: true } });
  const botUsername = bot?.config ? (bot.config as any).username : undefined;
  if (!bot?.token || !botUsername) return res.status(400).json({ error: 'Bot username missing' });

  if (type === 'dealer_invite' && dealerId) {
    const payload = requestId ? `dealer_invite:${dealerId}:${requestId}` : `dealer_invite:${dealerId}`;
    const link = `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
    return res.json({ link });
  }
  if (type === 'request' && requestId) {
    const link = generateRequestLink(botUsername, requestId);
    return res.json({ link });
  }
  res.status(400).json({ error: 'Invalid payload' });
});

export default router;
