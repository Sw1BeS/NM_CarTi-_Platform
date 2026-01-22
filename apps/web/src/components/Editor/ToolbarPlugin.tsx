import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND, $getSelection, $isRangeSelection } from 'lexical';
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { Bold, Italic, Code, Link as LinkIcon, List, ListOrdered, Smile } from 'lucide-react';

export function ToolbarPlugin() {
    const [editor] = useLexicalComposerContext();

    const formatBold = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
    const formatItalic = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
    const formatCode = () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
    const insertBulletList = () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    const insertNumberedList = () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);

    const insertEmoji = () => {
        // Simple emoji picker - can be extended with a full emoji picker library
        const emoji = prompt('Enter emoji or text:');
        if (emoji) {
            editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    selection.insertText(emoji);
                }
            });
        }
    };

    return (
        <div className="flex items-center gap-1 p-2 border-b border-[var(--border-color)] bg-[var(--bg-input)] flex-wrap">
            <button
                onClick={formatBold}
                className="p-2 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                title="Bold (Ctrl+B)"
                type="button"
            >
                <Bold size={16} />
            </button>
            <button
                onClick={formatItalic}
                className="p-2 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                title="Italic (Ctrl+I)"
                type="button"
            >
                <Italic size={16} />
            </button>
            <button
                onClick={formatCode}
                className="p-2 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                title="Code (Ctrl+E)"
                type="button"
            >
                <Code size={16} />
            </button>
            <div className="w-px h-6 bg-[var(--border-color)]" />
            <button
                onClick={insertBulletList}
                className="p-2 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                title="Bullet List"
                type="button"
            >
                <List size={16} />
            </button>
            <button
                onClick={insertNumberedList}
                className="p-2 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                title="Numbered List"
                type="button"
            >
                <ListOrdered size={16} />
            </button>
            <div className="w-px h-6 bg-[var(--border-color)]" />
            <button
                onClick={insertEmoji}
                className="p-2 hover:bg-[var(--bg-panel)] rounded text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                title="Insert Emoji"
                type="button"
            >
                <Smile size={16} />
            </button>
            <div className="ml-auto text-[10px] text-[var(--text-muted)] hidden sm:block">
                Telegram Formatting: **bold** *italic* `code` [link](url)
            </div>
        </div>
    );
}
