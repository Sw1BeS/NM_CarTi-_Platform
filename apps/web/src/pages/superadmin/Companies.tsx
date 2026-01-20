import React, { useState, useEffect } from 'react';
import { SuperadminApi, CompanySummary } from '../../services/superadminApi';
import { useToast } from '../../contexts/ToastContext';
import { Plus, Search, Building2, MoreHorizontal, CheckCircle, XCircle } from 'lucide-react';

export const Companies: React.FC = () => {
    const [companies, setCompanies] = useState<CompanySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const [search, setSearch] = useState('');

    useEffect(() => {
        loadCompanies();
    }, []);

    const loadCompanies = async () => {
        try {
            setLoading(true);
            const data = await SuperadminApi.listCompanies();
            setCompanies(data);
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleStatus = async (id: string, currentStatus: boolean) => {
        try {
            await SuperadminApi.toggleCompanyStatus(id, !currentStatus);
            loadCompanies();
            showToast('Status updated', 'success');
        } catch (e: any) {
            showToast('Failed to update status', 'error');
        }
    };

    const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.includes(search.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Companies</h1>
                    <p className="text-[var(--text-secondary)]">Manage tenants and subscriptions</p>
                </div>
                <button className="btn-primary">
                    <Plus size={18} /> New Company
                </button>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
                    <input
                        className="input pl-10"
                        placeholder="Search companies..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="panel overflow-hidden">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Name / Slug</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Stats</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="text-center py-8">Loading...</td></tr>
                        ) : filtered.map(company => (
                            <tr key={company.id} className="group">
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--bg-input)] flex items-center justify-center text-[var(--text-secondary)]">
                                            <Building2 size={20} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-[var(--text-primary)]">{company.name}</div>
                                            <div className="text-xs text-[var(--text-secondary)] font-mono">{company.slug}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${company.plan === 'ENTERPRISE' ? 'bg-purple-500/20 text-purple-400' :
                                        company.plan === 'PRO' ? 'bg-gold-500/20 text-gold-400' :
                                            'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                        }`}>
                                        {company.plan}
                                    </span>
                                </td>
                                <td>
                                    {company.isActive ? (
                                        <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium">
                                            <CheckCircle size={14} /> Active
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-red-500 text-sm font-medium">
                                            <XCircle size={14} /> Inactive
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <div className="flex gap-3 text-xs text-[var(--text-secondary)]">
                                        <div title="Users">👤 {company._count?.users || 0}</div>
                                        <div title="Bots">🤖 {company._count?.bots || 0}</div>
                                    </div>
                                </td>
                                <td className="text-right">
                                    <button className="btn-ghost p-2">
                                        <MoreHorizontal size={18} />
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
