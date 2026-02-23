import axios from 'axios';

const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

type InviteLinkInput = {
  token: string;
  chatId: string;
  name?: string;
  createsJoinRequest?: boolean;
  expireDateUnix?: number;
  memberLimit?: number;
};

class TelegramInviteService {
  async createChatInviteLink(input: InviteLinkInput) {
    const payload: Record<string, any> = {
      chat_id: input.chatId,
      creates_join_request: input.createsJoinRequest !== false
    };
    if (input.name) payload.name = input.name;
    if (input.expireDateUnix) payload.expire_date = input.expireDateUnix;
    if (input.memberLimit) payload.member_limit = input.memberLimit;

    const response = await axios.post(`${TELEGRAM_API(input.token)}/createChatInviteLink`, payload, { timeout: 15000 });
    if (!response.data?.ok) {
      throw new Error(response.data?.description || 'createChatInviteLink failed');
    }
    return response.data.result as { invite_link: string };
  }

  async exportChatInviteLink(input: { token: string; chatId: string }) {
    const response = await axios.post(`${TELEGRAM_API(input.token)}/exportChatInviteLink`, {
      chat_id: input.chatId
    }, { timeout: 15000 });
    if (!response.data?.ok) {
      throw new Error(response.data?.description || 'exportChatInviteLink failed');
    }
    return String(response.data.result || '');
  }

  async buildBestEffortInviteLink(input: InviteLinkInput) {
    try {
      const created = await this.createChatInviteLink(input);
      return String(created?.invite_link || '').trim();
    } catch {
      return this.exportChatInviteLink({
        token: input.token,
        chatId: input.chatId
      }).catch(() => '');
    }
  }

  async approveChatJoinRequest(input: { token: string; chatId: string; userId: string }) {
    const response = await axios.post(`${TELEGRAM_API(input.token)}/approveChatJoinRequest`, {
      chat_id: input.chatId,
      user_id: input.userId
    }, { timeout: 15000 });
    if (!response.data?.ok) {
      throw new Error(response.data?.description || 'approveChatJoinRequest failed');
    }
    return true;
  }
}

export const telegramInviteService = new TelegramInviteService();
