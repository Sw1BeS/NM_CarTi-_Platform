import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $convertToMarkdownString, TRANSFORMERS } from '@lexical/markdown';

interface TelegramFormatterProps {
    onChange?: (html: string, markdown: string) => void;
}

export function TelegramFormatterPlugin({ onChange }: TelegramFormatterProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const markdown = $convertToMarkdownString(TRANSFORMERS);

                // Convert to Telegram HTML
                const html = markdown
                    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')  // Bold
                    .replace(/\*(.+?)\*/g, '<i>$1</i>')      // Italic
                    .replace(/`(.+?)`/g, '<code>$1</code>')  // Code
                    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>'); // Links

                onChange?.(html, markdown);
            });
        });
    }, [editor, onChange]);

    return null;
}
