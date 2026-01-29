import axios from 'axios';

type TelegramPayload = Record<string, any>;

const BASE = (token: string) => `https://api.telegram.org/bot${token}`;
const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Minimal unified sender with per-chat pacing and 429 retry support.
 * Keeps in-memory queues (no heavy broker) per chatId.
 */
class Sender {
  private queues = new Map<string, Promise<any>>();

  private schedule<T>(chatId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(chatId) || Promise.resolve();
    const next = prev.then(async () => {
      // throttle per chat (~3 msg/sec)
      await wait(350);
      return task();
    }).finally(() => {
      if (this.queues.get(chatId) === next) this.queues.delete(chatId);
    });
    this.queues.set(chatId, next);
    return next;
  }

  private async call<T>(token: string, method: string, payload: TelegramPayload, attempt = 0): Promise<T> {
    try {
      const res = await axios.post(`${BASE(token)}/${method}`, payload, { timeout: 15000 });
      if (!res.data?.ok) throw new Error(res.data?.description || 'Telegram API error');
      return res.data.result as T;
    } catch (e: any) {
      const status = e?.response?.status;
      const desc = e?.response?.data?.description || e.message;
      const retryAfter = e?.response?.data?.parameters?.retry_after;

      if (status === 429) {
        const delay = retryAfter ? (retryAfter * 1000) + 500 : 5000;
        if (attempt < 5) {
          await wait(delay);
          return this.call<T>(token, method, payload, attempt + 1);
        }
      }
      if (attempt < 3) {
        await wait(1000 * (attempt + 1));
        return this.call<T>(token, method, payload, attempt + 1);
      }
      throw new Error(desc || 'Telegram send failed');
    }
  }

  async sendMessage(token: string, chatId: string, text: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async editMessageText(token: string, chatId: string, messageId: number, text: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendPhoto(token: string, chatId: string, photo: string, caption: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendPhoto', {
      chat_id: chatId,
      photo,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendDocument(token: string, chatId: string, document: string, caption?: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendDocument', {
      chat_id: chatId,
      document,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendVideo(token: string, chatId: string, video: string, caption?: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendVideo', {
      chat_id: chatId,
      video,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendAudio(token: string, chatId: string, audio: string, caption?: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendAudio', {
      chat_id: chatId,
      audio,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendVoice(token: string, chatId: string, voice: string, caption?: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendVoice', {
      chat_id: chatId,
      voice,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendAnimation(token: string, chatId: string, animation: string, caption?: string, replyMarkup?: any) {
    return this.schedule(chatId, () => this.call(token, 'sendAnimation', {
      chat_id: chatId,
      animation,
      caption,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    }));
  }

  async sendSticker(token: string, chatId: string, sticker: string) {
    return this.schedule(chatId, () => this.call(token, 'sendSticker', {
      chat_id: chatId,
      sticker
    }));
  }

  async sendMediaGroup(token: string, chatId: string, media: any[]) {
    return this.schedule(chatId, () => this.call(token, 'sendMediaGroup', {
      chat_id: chatId,
      media
    }));
  }

  async sendChatAction(token: string, chatId: string, action: string) {
    return this.schedule(chatId, () => this.call(token, 'sendChatAction', {
      chat_id: chatId,
      action
    })).catch(() => null);
  }

  async answerCallback(token: string, callbackId: string, text?: string) {
    return this.call(token, 'answerCallbackQuery', {
      callback_query_id: callbackId,
      text
    }).catch(() => null);
  }

  async getFile(token: string, fileId: string) {
    return this.call<{ file_id: string; file_unique_id: string; file_size?: number; file_path?: string }>(
      token, 'getFile', { file_id: fileId }
    );
  }
}

export const TelegramSender = new Sender();
