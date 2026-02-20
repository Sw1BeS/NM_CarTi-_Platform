export interface BotRuntime {
  id: string;
  token: string;
  companyId?: string | null;
  config?: any;
  channelId?: string | null;
  adminChatId?: string | null;
}

export interface ScenarioRecord {
  id: string;
  botId?: string | null;
  triggerCommand: string | null;
  isActive?: boolean;
  keywords?: string[];
  nodes: any;
  flow?: any;
  entryNodeId?: string | null;
}

export interface ScenarioNode {
  id: string;
  type: string;
  text?: string;
  content?: any;
  nextNodeId?: string;
  buttons?: any[];
  next?: string | Record<string, string>;
}

export type ReplyKeyboardButton = string | { text: string; web_app?: { url: string } };
