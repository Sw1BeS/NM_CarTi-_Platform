
export interface ConfigSnapshot {
    id: string;
    createdAt: string;
    name: string;
    note?: string;
    payload: {
        apiBase: string | null;
        theme: string | null;
        lang: string | null;
    };
}

const SNAPSHOT_KEY = 'cartie_ui_snapshots_v1';

export const VersionSnapshots = {
    list(): ConfigSnapshot[] {
        try {
            const raw = localStorage.getItem(SNAPSHOT_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },

    create(name: string, note?: string): ConfigSnapshot {
        const snapshots = this.list();
        
        const newSnapshot: ConfigSnapshot = {
            id: `snap_${Date.now()}`,
            createdAt: new Date().toISOString(),
            name,
            note,
            payload: {
                apiBase: localStorage.getItem('cartie_api_base'),
                theme: localStorage.getItem('cartie_theme'),
                lang: localStorage.getItem('cartie_lang')
            }
        };

        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify([newSnapshot, ...snapshots]));
        return newSnapshot;
    },

    restore(id: string): boolean {
        const snapshots = this.list();
        const target = snapshots.find(s => s.id === id);
        
        if (!target) return false;

        const p = target.payload;
        
        if (p.apiBase !== null) localStorage.setItem('cartie_api_base', p.apiBase);
        else localStorage.removeItem('cartie_api_base');

        if (p.theme !== null) localStorage.setItem('cartie_theme', p.theme);
        if (p.lang !== null) localStorage.setItem('cartie_lang', p.lang);
        return true;
    },

    delete(id: string) {
        const snapshots = this.list().filter(s => s.id !== id);
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
    },

    import(jsonString: string): boolean {
        try {
            const parsed = JSON.parse(jsonString);
            if (!Array.isArray(parsed)) throw new Error("Invalid format");
            
            // Merge strategy: Add imported to top, prevent ID collisions
            const current = this.list();
            const imported = parsed.map((s: any) => ({
                ...s,
                id: s.id + '_imp_' + Math.floor(Math.random() * 1000) // Simple collision avoidance
            }));
            
            localStorage.setItem(SNAPSHOT_KEY, JSON.stringify([...imported, ...current]));
            return true;
        } catch (e) {
            console.error("Snapshot import failed", e);
            return false;
        }
    },

    export(): string {
        return JSON.stringify(this.list(), null, 2);
    }
};
