import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { User } from '../../../types';
import { Plus, X } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useLang } from '../../../contexts/LanguageContext';
import { EmptyState } from '../../../components/EmptyState';

export const UsersTab = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'MANAGER', name: '', telegramUserId: '', companyId: '' });
    const { showToast } = useToast();
    const { user } = useAuth();
    const { t } = useLang();

    useEffect(() => {
        load();
    }, []);

    const load = () => Data.getUsers().then(setUsers);

    const handleCreate = async () => {
        if (!formData.username || !formData.password) return showToast(t('form.required'), 'error');
        const companyId = formData.companyId || user?.companyId;
        if (!companyId) {
            showToast(t('form.company_required'), 'error');
            return;
        }

        await Data.saveUser({
            id: `u_${Date.now()}`,
            name: formData.name || formData.username,
            email: `${formData.username}@cartie.local`,
            username: formData.username,
            telegramUserId: formData.telegramUserId || undefined,
            companyId,
            password: formData.password,
            role: formData.role as any
        } as any);
        setIsModalOpen(false);
        load();
        showToast("User created");
    };

    return (
        <div className="space-y-8 animate-slide-up">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('settings.team_members')}</h3>
                <button onClick={() => setIsModalOpen(true)} className="btn-primary">
                    <Plus size={18} /> {t('settings.add_user')}
                </button>
            </div>

            {users.length === 0 ? (
                <div className="panel">
                    <EmptyState
                        icon={<Plus size={28} />}
                        title={t('settings.team_members')}
                        description="Invite teammates to start assigning requests and conversations."
                        actionLabel={t('settings.add_user')}
                        action={() => setIsModalOpen(true)}
                    />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {users.map(u => (
                        <div key={u.id} className="panel p-4 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-[var(--bg-input)] flex items-center justify-center font-bold text-[var(--text-secondary)] border border-[var(--border-color)]">
                                    {u.name?.[0]?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                    <div className="font-bold text-[var(--text-primary)]">{u.name}</div>
                                    <div className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">{u.role}</div>
                                </div>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] font-mono">{u.email}</div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel p-10 w-full max-w-md animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-2xl text-[var(--text-primary)]">{t('settings.new_user')}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <input className="input" placeholder={t('form.display_name')} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            <input className="input" placeholder={t('form.username')} value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                            <input className="input" type="password" placeholder={t('form.password')} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                            <input className="input" placeholder={t('form.tg_id_opt')} value={formData.telegramUserId} onChange={e => setFormData({ ...formData, telegramUserId: e.target.value })} />
                            <input className="input" placeholder={t('form.company_id_opt')} value={formData.companyId} onChange={e => setFormData({ ...formData, companyId: e.target.value })} />
                            <select className="input" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                <option value="MANAGER">{t('role.manager')}</option>
                                <option value="ADMIN">{t('role.admin')}</option>
                                <option value="OWNER">{t('role.owner')}</option>
                                <option value="VIEWER">{t('role.viewer')}</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="btn-ghost">{t('btn.cancel')}</button>
                            <button onClick={handleCreate} className="btn-primary">{t('btn.create')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
