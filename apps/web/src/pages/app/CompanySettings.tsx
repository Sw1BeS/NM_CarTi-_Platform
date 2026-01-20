import React, { useState, useEffect } from 'react';
import { useCompany } from '../../contexts/CompanyContext';
import { useToast } from '../../contexts/ToastContext';
import {
    Building2, Palette, Globe, Users, Crown, Upload, X,
    Mail, Shield, Trash2, UserPlus
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    name?: string;
    role: string;
    isActive: boolean;
    createdAt: string;
}

export const CompanySettingsPage = () => {
    const { company, refreshCompany } = useCompany();
    const { showToast } = useToast();

    const [branding, setBranding] = useState({
        name: '',
        logo: '',
        primaryColor: '#D4AF37',
        domain: ''
    });

    const [users, setUsers] = useState<User[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteData, setInviteData] = useState({
        email: '',
        name: '',
        role: 'MANAGER'
    });

    useEffect(() => {
        if (company) {
            setBranding({
                name: company.name,
                logo: company.logo || '',
                primaryColor: company.primaryColor,
                domain: company.domain || ''
            });
        }
    }, [company]);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const response = await fetch('/api/companies/current/users', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('cartie_token')}` }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            }
        } catch (e) {
            console.error('Failed to load users:', e);
        }
    };

    const saveBranding = async () => {
        try {
            const response = await fetch('/api/companies/current/branding', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('cartie_token')}`
                },
                body: JSON.stringify(branding)
            });

            if (response.ok) {
                showToast('Branding updated!', 'success');
                refreshCompany();
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to update', 'error');
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const inviteUser = async () => {
        try {
            const response = await fetch('/api/companies/current/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('cartie_token')}`
                },
                body: JSON.stringify(inviteData)
            });

            if (response.ok) {
                showToast('User invited!', 'success');
                setShowInviteModal(false);
                setInviteData({ email: '', name: '', role: 'MANAGER' });
                loadUsers();
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to invite', 'error');
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const removeUser = async (userId: string) => {
        if (!confirm('Are you sure you want to remove this user?')) return;

        try {
            const response = await fetch(`/api/companies/current/users/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('cartie_token')}` }
            });

            if (response.ok) {
                showToast('User removed', 'success');
                loadUsers();
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to remove', 'error');
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'OWNER': return 'bg-purple-500/20 text-purple-500';
            case 'ADMIN': return 'bg-blue-500/20 text-blue-500';
            case 'MANAGER': return 'bg-green-500/20 text-green-500';
            case 'VIEWER': return 'bg-gray-500/20 text-gray-500';
            default: return 'bg-gray-500/20 text-gray-500';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Company Settings</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Manage branding and team</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded text-xs font-bold ${company?.plan === 'ENTERPRISE' ? 'bg-purple-500/20 text-purple-500' :
                            company?.plan === 'PRO' ? 'bg-blue-500/20 text-blue-500' :
                                'bg-gray-500/20 text-gray-500'
                        }`}>
                        {company?.plan || 'FREE'}
                    </div>
                </div>
            </div>

            {/* Branding Section */}
            <div className="panel p-6 space-y-6">
                <div className="flex items-center gap-3 border-b border-[var(--border-color)] pb-4">
                    <Palette size={20} className="text-gold-500" />
                    <h3 className="font-bold text-[var(--text-primary)]">Branding</h3>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            Company Name
                        </label>
                        <input
                            className="input"
                            value={branding.name}
                            onChange={e => setBranding({ ...branding, name: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            Primary Color
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="color"
                                className="w-12 h-10 rounded cursor-pointer"
                                value={branding.primaryColor}
                                onChange={e => setBranding({ ...branding, primaryColor: e.target.value })}
                            />
                            <input
                                className="input flex-1"
                                value={branding.primaryColor}
                                onChange={e => setBranding({ ...branding, primaryColor: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            Logo URL
                        </label>
                        <input
                            className="input"
                            placeholder="https://..."
                            value={branding.logo}
                            onChange={e => setBranding({ ...branding, logo: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            Custom Domain
                        </label>
                        <input
                            className="input"
                            placeholder="your-domain.com"
                            value={branding.domain}
                            onChange={e => setBranding({ ...branding, domain: e.target.value })}
                        />
                    </div>
                </div>

                <button onClick={saveBranding} className="btn-primary px-6">
                    Save Branding
                </button>
            </div>

            {/* Team Section */}
            <div className="panel p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-4">
                    <div className="flex items-center gap-3">
                        <Users size={20} className="text-gold-500" />
                        <h3 className="font-bold text-[var(--text-primary)]">Team Members</h3>
                    </div>
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="btn-primary px-4 py-2 flex items-center gap-2"
                    >
                        <UserPlus size={16} /> Invite User
                    </button>
                </div>

                <div className="space-y-3">
                    {users.map(user => (
                        <div key={user.id} className="bg-[var(--bg-input)] rounded-xl p-4 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-gold-500/20 flex items-center justify-center">
                                    <span className="font-bold text-gold-500">{user.name?.[0] || user.email[0].toUpperCase()}</span>
                                </div>
                                <div>
                                    <div className="font-bold text-[var(--text-primary)]">{user.name || user.email}</div>
                                    <div className="text-xs text-[var(--text-secondary)]">{user.email}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded text-xs font-bold ${getRoleBadgeColor(user.role)}`}>
                                    {user.role}
                                </span>
                                {user.role !== 'OWNER' && (
                                    <button
                                        onClick={() => removeUser(user.id)}
                                        className="text-red-500 hover:bg-red-500/10 p-2 rounded"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md p-6 animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">Invite Team Member</h3>
                            <button onClick={() => setShowInviteModal(false)}>
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                    Email
                                </label>
                                <input
                                    className="input"
                                    type="email"
                                    placeholder="user@example.com"
                                    value={inviteData.email}
                                    onChange={e => setInviteData({ ...inviteData, email: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                    Name (Optional)
                                </label>
                                <input
                                    className="input"
                                    placeholder="John Doe"
                                    value={inviteData.name}
                                    onChange={e => setInviteData({ ...inviteData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                    Role
                                </label>
                                <select
                                    className="input"
                                    value={inviteData.role}
                                    onChange={e => setInviteData({ ...inviteData, role: e.target.value })}
                                >
                                    <option value="ADMIN">Admin</option>
                                    <option value="MANAGER">Manager</option>
                                    <option value="VIEWER">Viewer</option>
                                </select>
                            </div>

                            <button
                                onClick={inviteUser}
                                disabled={!inviteData.email}
                                className="btn-primary w-full py-3"
                            >
                                Send Invitation
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
