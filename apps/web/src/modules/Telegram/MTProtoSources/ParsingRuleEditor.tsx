import React, { useState } from 'react';
import { ApiClient } from '../../../services/apiClient';
import { X, Play, Plus, Trash, Save } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

interface ParsingRule {
    method: 'REGEX' | 'LINE_INDEX' | 'KEYWORD_AFTER' | 'BETWEEN';
    pattern?: string;
    groupIndex?: number;
    lineIndex?: number;
    keyword?: string;
    startMarker?: string;
    endMarker?: string;
}

interface ParsingTemplate {
    name: string;
    rules: Record<string, ParsingRule>;
}

interface Props {
    initialRules?: ParsingTemplate;
    onSave: (rules: ParsingTemplate) => void;
    onClose: () => void;
    sampleText?: string;
}

export const ParsingRuleEditor: React.FC<Props> = ({ initialRules, onSave, onClose, sampleText = '' }) => {
    const [text, setText] = useState(sampleText);
    const [template, setTemplate] = useState<ParsingTemplate>(initialRules || { name: 'Custom Rules', rules: {} });
    const [testResult, setTestResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    // Editor State
    const [editingField, setEditingField] = useState<string>('');
    const [editingRule, setEditingRule] = useState<ParsingRule>({ method: 'REGEX', groupIndex: 1 });

    const handleTest = async () => {
        setLoading(true);
        try {
            const res = await ApiClient.post('integrations/parsing/preview', { text, template });
            if (res.ok) {
                setTestResult(res.data.result);
                showToast('Parsing test successful', 'success');
            } else {
                showToast(res.data?.message || 'Parsing failed', 'error');
            }
        } catch (e) {
            showToast('Network error', 'error');
        } finally {
            setLoading(false);
        }
    };

    const saveRule = () => {
        if (!editingField) return;
        setTemplate(prev => ({
            ...prev,
            rules: {
                ...prev.rules,
                [editingField]: editingRule
            }
        }));
        setEditingField('');
        setEditingRule({ method: 'REGEX', groupIndex: 1 });
    };

    const deleteRule = (field: string) => {
        const newRules = { ...template.rules };
        delete newRules[field];
        setTemplate({ ...template, rules: newRules });
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl">

                {/* Header */}
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">Parsing Rule Editor</h2>
                        <p className="text-xs text-[var(--text-secondary)]">Define how to extract data from raw text</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => onSave(template)} className="btn btn-primary flex items-center gap-2">
                            <Save size={16} /> Save Rules
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-[var(--bg-input)] rounded-lg text-[var(--text-secondary)]">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 flex overflow-hidden">

                    {/* Left: Sample Text & Results */}
                    <div className="w-1/3 flex flex-col border-r border-[var(--border-color)]">
                        <div className="p-2 bg-[var(--bg-input)] border-b border-[var(--border-color)] font-bold text-xs uppercase text-[var(--text-secondary)]">
                            Sample Text
                        </div>
                        <textarea
                            value={text}
                            onChange={e => setText(e.target.value)}
                            className="flex-1 w-full bg-[var(--bg-app)] p-4 text-xs font-mono resize-none focus:outline-none"
                            placeholder="Paste a full Telegram message example here..."
                        />
                        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-panel)] shrink-0">
                            <button
                                onClick={handleTest}
                                disabled={loading}
                                className="w-full btn btn-secondary flex items-center justify-center gap-2 mb-4"
                            >
                                <Play size={16} /> {loading ? 'Testing...' : 'Test Rules'}
                            </button>

                            <div className="text-xs font-bold uppercase text-[var(--text-secondary)] mb-2">Extraction Result</div>
                            <div className="bg-[var(--bg-app)] rounded p-2 h-40 overflow-auto border border-[var(--border-color)]">
                                {testResult ? (
                                    <pre className="text-xs text-green-400 font-mono">
                                        {JSON.stringify(testResult, null, 2)}
                                    </pre>
                                ) : (
                                    <div className="text-[var(--text-muted)] text-xs italic">Run test to see results</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Middle: Rules List */}
                    <div className="w-1/3 flex flex-col border-r border-[var(--border-color)] bg-[var(--bg-app)]">
                        <div className="p-2 bg-[var(--bg-input)] border-b border-[var(--border-color)] font-bold text-xs uppercase text-[var(--text-secondary)] flex justify-between items-center">
                            <span>Active Rules</span>
                            <button onClick={() => setEditingField('new_field')} className="text-xs text-gold-500 hover:underline">+ Add</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {Object.entries(template.rules).map(([field, rule]) => (
                                <div key={field} className="p-3 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg flex justify-between group">
                                    <div>
                                        <div className="font-bold text-sm text-[var(--text-primary)]">{field}</div>
                                        <div className="text-xs text-[var(--text-secondary)] mt-1">
                                            <span className="bg-[var(--bg-input)] px-1 rounded text-[10px] uppercase mr-1">{rule.method}</span>
                                            {rule.method === 'REGEX' && <span className="font-mono">{rule.pattern}</span>}
                                            {rule.method === 'LINE_INDEX' && <span>Line #{rule.lineIndex}</span>}
                                            {rule.method === 'KEYWORD_AFTER' && <span>After "{rule.keyword}"</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setEditingField(field); setEditingRule(rule); }} className="p-1 hover:text-blue-500"><SettingsIcon size={14} /></button>
                                        <button onClick={() => deleteRule(field)} className="p-1 hover:text-red-500"><Trash size={14} /></button>
                                    </div>
                                </div>
                            ))}
                            {Object.keys(template.rules).length === 0 && (
                                <div className="text-center p-8 text-[var(--text-muted)] text-sm">
                                    No rules defined. <br />Add a rule to extract data.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Rule Editor Form */}
                    <div className="w-1/3 flex flex-col bg-[var(--bg-panel)]">
                        <div className="p-2 bg-[var(--bg-input)] border-b border-[var(--border-color)] font-bold text-xs uppercase text-[var(--text-secondary)]">
                            {editingField ? `Editing "${editingField}"` : 'Select a rule to edit'}
                        </div>

                        {editingField ? (
                            <div className="p-4 flex-1 overflow-y-auto space-y-4">
                                <div>
                                    <label className="label">Target Field</label>
                                    <input
                                        type="text"
                                        value={editingField === 'new_field' ? '' : editingField}
                                        onChange={e => setEditingField(e.target.value)}
                                        placeholder="e.g. price, year, mileage"
                                        className="input"
                                    />
                                    <p className="text-[10px] text-[var(--text-muted)] mt-1">Standard fields: price, year, mileage, make, title</p>
                                </div>

                                <div>
                                    <label className="label">Extraction Method</label>
                                    <select
                                        value={editingRule.method}
                                        onChange={e => setEditingRule({ ...editingRule, method: e.target.value as any })}
                                        className="input"
                                    >
                                        <option value="REGEX">Regular Expression (Regex)</option>
                                        <option value="LINE_INDEX">Specific Line Number</option>
                                        <option value="KEYWORD_AFTER">Text After Keyword</option>
                                        <option value="BETWEEN">Text Between Markers</option>
                                    </select>
                                </div>

                                <div className="p-3 bg-[var(--bg-input)] rounded border border-[var(--border-color)] space-y-3">
                                    {editingRule.method === 'REGEX' && (
                                        <>
                                            <div>
                                                <label className="label">Regex Pattern</label>
                                                <input
                                                    type="text"
                                                    value={editingRule.pattern || ''}
                                                    onChange={e => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                                    placeholder="Price:\s*(\d+)"
                                                    className="input font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="label">Group Index</label>
                                                <input
                                                    type="number"
                                                    value={editingRule.groupIndex || 0}
                                                    onChange={e => setEditingRule({ ...editingRule, groupIndex: parseInt(e.target.value) })}
                                                    className="input"
                                                />
                                            </div>
                                        </>
                                    )}

                                    {editingRule.method === 'LINE_INDEX' && (
                                        <div>
                                            <label className="label">Line Number (0-based)</label>
                                            <input
                                                type="number"
                                                value={editingRule.lineIndex || 0}
                                                onChange={e => setEditingRule({ ...editingRule, lineIndex: parseInt(e.target.value) })}
                                                className="input"
                                            />
                                            <p className="text-[10px] text-[var(--text-muted)]">Check the line numbers in the Sample Text view</p>
                                        </div>
                                    )}

                                    {editingRule.method === 'KEYWORD_AFTER' && (
                                        <div>
                                            <label className="label">Keyword</label>
                                            <input
                                                type="text"
                                                value={editingRule.keyword || ''}
                                                onChange={e => setEditingRule({ ...editingRule, keyword: e.target.value })}
                                                placeholder="e.g. Price:"
                                                className="input"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4">
                                    <button onClick={saveRule} className="btn btn-primary w-full">
                                        {editingField === 'new_field' ? 'Add Rule' : 'Update Rule'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm p-8 text-center">
                                Select an existing rule from the list or click "+ Add" to create a new one.
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

const SettingsIcon = ({ size }: { size: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.09a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.09a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
);
