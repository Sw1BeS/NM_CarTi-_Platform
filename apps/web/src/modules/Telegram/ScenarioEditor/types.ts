export interface ScenarioEditorProps {
    botId: string;
    initialScenario?: Scenario;
    onSave?: (scenario: Scenario) => Promise<void>;
    onDelete?: (id: string) => Promise<void>;
}

export interface MenuDesignerProps {
    bot: Bot;
    onSync?: () => Promise<void>;
}

export interface MiniAppManagerProps {
    botId: string;
    config: MiniAppConfig;
    onSave: (config: MiniAppConfig) => Promise<void>;
}

export interface MTProtoSourcesProps {
    botId: string;
    onChannelSync?: (channelId: string) => void;
}

// Re-export from main types
export type { Scenario, Bot, BotMenuButtonConfig, MiniAppConfig } from '../../../types';
