import React, { useState, useEffect } from 'react';
import { SuperadminApi } from '../../services/superadminApi';
import { useToast } from '../../contexts/ToastContext';
import { User } from '../../types';
import { Search, User as UserIcon, Shield, LogIn } from 'lucide-react';

export const Users: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await SuperadminApi.listUsers();
            setUsers(data);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleImpersonate = async (userId: string) => {
        if (!confirm('Are you sure you want to log in as this user?')) return;
        try {
            const { token } = await SuperadminApi.impersonate({ userId });
            localStorage.setItem('token', token);
            window.location.href = '/'; // Reload to apply new token
        } catch (e: any) {
            showToast(e.message || 'Impersonation failed', 'error');
        }
    };

    const filtered = users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.name?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Global Users</h1>
                    <p className="text-[var(--text-secondary)]">Search and manage users across all companies</p>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                    <input
                        className="input pl-10"
                        placeholder="Search users by email or name..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="panel overflow-hidden">
                <table className="table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Company ID</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
                        ) : filtered.map(user => (
                            <tr key={user.id} className="group">
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-[var(--bg-input)] flex items-center justify-center text-[var(--text-secondary)]">
                                            <UserIcon size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-[var(--text-primary)]">{user.name || 'No Name'}</div>
                                            <div className="text-xs text-[var(--text-secondary)]">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)] uppercase">
                                        <Shield size={12} /> {user.role}
                                    </div>
                                </td>
                                <td className="font-mono text-xs text-[var(--text-secondary)]">
                                    {user.companyId}
                                </td>
                                <td>
                                    {user.isActive ? (
                                        <span className="text-green-500 text-xs font-bold">ACTIVE</span>
                                    ) : (
                                        <span className="text-red-500 text-xs font-bold">INACTIVE</span>
                                    )}
                                </td>
                                <td className="text-right">
                                    <button
                                        onClick={() => handleImpersonate(user.id)}
                                        className="btn-ghost p-1 text-xs flex items-center gap-1 hover:text-gold-500 ml-auto"
                                        title="Login as this user"
                                    >
                                        <LogIn size={16} /> Impersonate
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
