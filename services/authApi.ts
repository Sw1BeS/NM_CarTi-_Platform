
import { apiFetch } from './apiClient';
import { User } from '../types';
import { Data } from './data';
import { MockDb } from './mockDb';

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
    if (Data.getMode() === 'LOCAL') {
        const user = await MockDb.login(email);
        if (user) {
            return { token: 'mock_token_' + user.id, user };
        }
        
        // Fallback for default local admin
        if (email === 'admin@cartie.com' && password === 'admin') {
             const adminUser: User = { 
                 id: 'u_admin', 
                 name: 'Admin', 
                 email: 'admin@cartie.com', 
                 role: 'SUPER_ADMIN', 
                 username: 'admin' 
             };
             // Ensure this user exists in storage for consistency
             await Data.saveUser(adminUser);
             return { token: 'mock_admin_token', user: adminUser };
        }
        throw new Error('Invalid credentials (LOCAL)');
    }

    return await apiFetch("/auth/login", { 
        method: "POST", 
        body: JSON.stringify({ email, password }) 
    });
}

export async function me(): Promise<User> {
    if (Data.getMode() === 'LOCAL') {
        const users = await Data.getUsers();
        // Return first admin or super admin found in local storage
        const admin = users.find(u => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') || users[0];
        
        if (admin) return admin;
        
        // Final fallback if local storage is empty
        return { 
            id: 'u_admin', 
            name: 'Admin', 
            email: 'admin@cartie.com', 
            role: 'SUPER_ADMIN', 
            username: 'admin' 
        };
    }

    return await apiFetch("/auth/me", { 
        method: "GET", 
        auth: true 
    });
}
