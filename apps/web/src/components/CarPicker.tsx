import React, { useState, useEffect } from 'react';
import { Data } from '../services/data';
import { CarListing } from '../types';
import { Search, X, Check, Car } from 'lucide-react';

interface CarPickerProps {
    onSelect: (car: CarListing) => void;
    onClose: () => void;
}

export const CarPicker: React.FC<CarPickerProps> = ({ onSelect, onClose }) => {
    const [cars, setCars] = useState<CarListing[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const list = await Data.getInventory();
                setCars(list.filter(c => c.status === 'AVAILABLE'));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const filtered = cars.filter(c =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        String(c.year).includes(search)
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-[var(--bg-panel)] w-full max-w-lg rounded-xl shadow-2xl border border-[var(--border-color)] flex flex-col max-h-[80vh] animate-slide-up">
                <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
                    <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Car size={20} className="text-gold-500" /> Select Vehicle
                    </h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" /></button>
                </div>

                <div className="p-4 border-b border-[var(--border-color)]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                        <input
                            className="input pl-9"
                            placeholder="Search by title or year..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {loading && <div className="text-center p-4 text-[var(--text-muted)]">Loading inventory...</div>}
                    {!loading && filtered.length === 0 && <div className="text-center p-4 text-[var(--text-muted)]">No cars found.</div>}

                    {filtered.map(car => (
                        <div
                            key={car.id}
                            onClick={() => onSelect(car)}
                            className="p-3 rounded-lg hover:bg-[var(--bg-input)] border border-transparent hover:border-[var(--border-color)] cursor-pointer flex gap-3 group transition-colors"
                        >
                            <div className="w-16 h-12 bg-black/20 rounded overflow-hidden flex-shrink-0">
                                {car.thumbnail ? (
                                    <img src={car.thumbnail} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]"><Car size={16} /></div>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-[var(--text-primary)] truncate">{car.title}</div>
                                <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-1">
                                    <span className="bg-[var(--bg-app)] px-1.5 py-0.5 rounded border border-[var(--border-color)]">{car.year}</span>
                                    <span className="font-mono text-gold-500">{car.price.amount.toLocaleString()} {car.price.currency}</span>
                                </div>
                            </div>
                            <button className="opacity-0 group-hover:opacity-100 text-green-500 p-2"><Check size={18} /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
