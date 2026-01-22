import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { TelegramFormatterPlugin } from './TelegramFormatterPlugin';
import { ToolbarPlugin } from './ToolbarPlugin';

const theme = {
    paragraph: 'mb-2',
    quote: 'border-l-4 border-gold-500 pl-4 italic text-[var(--text-secondary)]',
    heading: {
        h1: 'text-2xl font-bold mb-3',
        h2: 'text-xl font-bold mb-2',
        h3: 'text-lg font-bold mb-2',
    },
    list: {
        nested: { listitem: 'list-none' },
        ol: 'list-decimal ml-4',
        ul: 'list-disc ml-4',
    },
    listitem: 'mb-1',
    link: 'text-gold-500 underline cursor-pointer',
    text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline',
        code: 'bg-[var(--bg-input)] px-1 py-0.5 rounded text-sm font-mono',
    },
    code: 'bg-[var(--bg-input)] p-2 rounded font-mono text-sm block my-2',
};

interface TelegramEditorProps {
    placeholder?: string;
    onChange?: (html: string, markdown: string) => void;
    initialValue?: string;
}

export function TelegramEditor({ placeholder = 'Write your message...', onChange, initialValue }: TelegramEditorProps) {
    const initialConfig = {
        namespace: 'TelegramEditor',
        theme,
        onError: (error: Error) => console.error(error),
        nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode],
        editorState: initialValue,
    };

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="relative border border-[var(--border-color)] rounded-lg overflow-hidden bg-[var(--bg-panel)]">
                <ToolbarPlugin />
                <div className="relative">
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable className="min-h-[200px] p-4 outline-none text-[var(--text-primary)] resize-none" />
                        }
                        placeholder={
                            <div className="absolute top-4 left-4 text-[var(--text-secondary)] pointer-events-none select-none">
                                {placeholder}
                            </div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <ListPlugin />
                    <LinkPlugin />
                    <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                    <TelegramFormatterPlugin onChange={onChange} />
                </div>
            </div>
        </LexicalComposer>
    );
}
