import { PipelineMiddleware } from '../core/types.js';
import { prisma } from '../../../../services/prisma.js';
import { logger } from '../../../../utils/logger.js';
// @ts-ignore
import { parsePrice, parseMileage } from '../../../../services/textParserUtils.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { TelegramSender } from '../messaging/telegramSender.js';

export const routeChannelPost: PipelineMiddleware = async (ctx, next) => {
  const update = ctx.update;
  const post = update.channel_post;

  if (!post) {
    return next();
  }

  logger.info(`[Telegram] Received channel post: ${post.message_id} from ${post.chat?.title} (${post.chat?.id})`);

  // We have a channel post.
  // 1. Identify Channel
  const channelId = String(post.chat.id);
  const title = post.chat.title;

  // Ensure we know this channel (Track Metadata)
  // This might be duplicate of routeMyChatMember but for posts it's good to be robust.
  try {
      // Find existing destination or create?
      // For now, let's assume routeMyChatMember handles creation, or we just log it.
      // If we want to attach to a "BotConfig" channel, we might check that.
  } catch (e) {}

  // 2. Parse Content
  const text = post.caption || post.text || '';
  if (!text) return next();

  // Basic Heuristic: If it has a price and year, it might be a car.
  const priceData = parsePrice(text);
  const mileage = parseMileage(text);

  const yearMatch = text.match(/(19|20)\d{2}/);
  const year = yearMatch ? Number(yearMatch[0]) : undefined;

  // 3. Create Draft if it looks like a listing
  if (priceData.amount && (year || mileage)) {
      try {
          // Extract first image if available
          let thumbnail = undefined;
          if (post.photo && post.photo.length > 0) {
              // Get largest photo file_id
              const largest = post.photo[post.photo.length - 1];

              if (ctx.bot?.token) {
                  try {
                      const fileInfo = await TelegramSender.getFile(ctx.bot.token, largest.file_id);
                      if (fileInfo.file_path) {
                          const url = `https://api.telegram.org/file/bot${ctx.bot.token}/${fileInfo.file_path}`;
                          const dateStr = new Date().toISOString().split('T')[0];
                          // Assuming running from apps/server
                          const uploadDir = path.join(process.cwd(), 'uploads', 'bot', dateStr);
                          if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                          const ext = path.extname(fileInfo.file_path) || '.jpg';
                          const filename = `${largest.file_id}${ext}`;
                          const filepath = path.join(uploadDir, filename);

                          const writer = fs.createWriteStream(filepath);
                          const response = await axios({
                              url,
                              method: 'GET',
                              responseType: 'stream'
                          });
                          response.data.pipe(writer);

                          await new Promise<void>((resolve, reject) => {
                              writer.on('finish', () => resolve());
                              writer.on('error', reject);
                          });

                          thumbnail = `/uploads/bot/${dateStr}/${filename}`;
                      } else {
                          thumbnail = `tg_file_id:${largest.file_id}`;
                      }
                  } catch (e) {
                      logger.error('[Telegram] Failed to download channel post image', e);
                      thumbnail = `tg_file_id:${largest.file_id}`;
                  }
              } else {
                  thumbnail = `tg_file_id:${largest.file_id}`;
              }
          }

          // Check for duplicates?
          // TODO: Add deduplication logic based on text hash or channel+message_id

          await prisma.draft.create({
              data: {
                  source: 'MANUAL', // Should be 'CHANNEL' but schema enum might restrict.
                            // Looking at schema: enum DraftSource { EXTENSION, MANUAL }
                            // We will use 'MANUAL' and add metadata or update enum later.
                            // Actually, let's stick to 'MANUAL' and put details in metadata.
                  title: title || 'Channel Post',
                  description: text,
                  price: `${priceData.amount} ${priceData.currency || 'USD'}`,
                  url: `https://t.me/c/${channelId.replace('-100', '')}/${post.message_id}`,
                  status: 'PENDING',
                  destination: channelId,
                  botId: ctx.botId ? String(ctx.botId) : null,
                  metadata: {
                      channelId,
                      messageId: post.message_id,
                      parsedYear: year,
                      parsedMileage: mileage,
                      thumbnail
                  }
              }
          });
          logger.info(`[Telegram] Imported draft from channel ${channelId}`);
      } catch (e) {
          logger.error('[Telegram] Failed to create draft from post', e);
      }
  }

  return next();
};
