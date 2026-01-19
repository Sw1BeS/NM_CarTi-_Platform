
import React, { useEffect, useRef } from 'react';
import { Data } from '../services/data';
import { ApiClient } from '../services/apiClient';
import { BotEngine } from '../services/botEngine';
import { Bot } from '../types';
import { useAuth } from './AuthContext';

export const WorkerProvider = ({ children }: React.PropsWithChildren) => {
    const { user } = useAuth();
    const isMounted = useRef(true);
    const pollingRef = useRef<any>(null);
    const campaignRef = useRef<any>(null);
    const instanceId = useRef(`worker_${Date.now()}_${Math.random()}`);

    // LEADER ELECTION
    const checkIsLeader = () => {
        const now = Date.now();
        const currentLeader = localStorage.getItem('cartie_worker_leader');
        const lastHeartbeat = parseInt(localStorage.getItem('cartie_worker_heartbeat') || '0');

        // If no leader or heartbeat older than 5s, take over
        if (!currentLeader || (now - lastHeartbeat > 5000)) {
            localStorage.setItem('cartie_worker_leader', instanceId.current);
            localStorage.setItem('cartie_worker_heartbeat', String(now));
            return true;
        }

        // If I am the leader, update heartbeat
        if (currentLeader === instanceId.current) {
            localStorage.setItem('cartie_worker_heartbeat', String(now));
            return true;
        }

        return false;
    };

    useEffect(() => {
        isMounted.current = true;

        const meta = import.meta as any;
        const isProdHost = typeof window !== 'undefined'
            && !['localhost', '127.0.0.1'].includes(window.location.hostname);
        const disablePolling = meta.env?.VITE_DISABLE_CLIENT_POLLING === 'true' || isProdHost;
        const disableCampaigns = meta.env?.VITE_DISABLE_CLIENT_CAMPAIGNS === 'true';

        const token = localStorage.getItem('cartie_token');
        if (!user || !token) {
            if (campaignRef.current) clearInterval(campaignRef.current);
            if (pollingRef.current) clearTimeout(pollingRef.current);
            return () => {
                if (campaignRef.current) clearInterval(campaignRef.current);
                if (pollingRef.current) clearTimeout(pollingRef.current);
            };
        }
        
        // --- WORKER 1: CAMPAIGN PROCESSOR ---
        const startCampaignWorker = () => {
            if (campaignRef.current) clearInterval(campaignRef.current);
            campaignRef.current = setInterval(async () => {
                if (!isMounted.current || !checkIsLeader()) return; // ONLY LEADER RUNS
                if (!localStorage.getItem('cartie_token')) return;
                
                try {
                    const campaigns = await Data.getCampaigns();
                    const runningCampaigns = campaigns.filter(c => c.status === 'RUNNING');
                    const bots = await Data.getBots();
                    const allContent = await Data.getContent();
                    const destinations = await Data.getDestinations();

                    for (const camp of runningCampaigns) {
                        const bot = bots.find(b => b.id === camp.botId);
                        const content = allContent.find(c => c.id === camp.contentId);
                        
                        if (!bot || !bot.active || !content) continue;

                        // Check which dests haven't been processed yet
                        const processedIds = new Set(camp.logs.map(l => l.destinationId));
                        const pendingDestIds = camp.destinationIds.filter(did => !processedIds.has(did));

                        if (pendingDestIds.length > 0) {
                            const nextId = pendingDestIds[0];
                            const dest = destinations.find(d => d.id === nextId);
                            
                            if (dest) {
                                try {
                                    let bodyText = content.body
                                        .replace(/{{name}}/g, dest.name || 'Friend')
                                        .replace(/{{manager}}/g, 'Cartie Agent');

                                    const sendRes = await ApiClient.post('messages/send', {
                                        chatId: dest.identifier,
                                        text: bodyText,
                                        imageUrl: content.mediaUrls?.[0],
                                        botId: bot.id
                                    });
                                    if (!sendRes.ok) {
                                        throw new Error(sendRes.message || 'Send failed');
                                    }

                                    // Async save log (Data service handles notification)
                                    // We need to re-fetch campaign to avoid race conditions in a real app, 
                                    // but for now relying on Data abstraction
                                    const updatedCamp = (await Data.getCampaigns()).find(c => c.id === camp.id);
                                    if (updatedCamp) {
                                        const newLog = {
                                            destinationId: nextId,
                                            status: 'SUCCESS' as const,
                                            sentAt: new Date().toISOString(),
                                            messageId: (sendRes.data as any)?.result?.message_id || 0
                                        };
                                        updatedCamp.logs.push(newLog);
                                        updatedCamp.progress.sent = updatedCamp.logs.filter(l => l.status === 'SUCCESS').length;
                                        await Data.saveCampaign(updatedCamp);
                                    }
                                } catch (e: any) {
                                    const updatedCamp = (await Data.getCampaigns()).find(c => c.id === camp.id);
                                    if (updatedCamp) {
                                        const newLog = {
                                            destinationId: nextId,
                                            status: 'FAILED' as const,
                                            sentAt: new Date().toISOString(),
                                            error: e.message
                                        };
                                        updatedCamp.logs.push(newLog);
                                        updatedCamp.progress.failed = updatedCamp.logs.filter(l => l.status === 'FAILED').length;
                                        await Data.saveCampaign(updatedCamp);
                                    }
                                }
                            }
                        } else {
                            const updatedCamp = (await Data.getCampaigns()).find(c => c.id === camp.id);
                            if (updatedCamp && updatedCamp.status !== 'COMPLETED') {
                                updatedCamp.status = 'COMPLETED';
                                await Data.saveCampaign(updatedCamp);
                            }
                        }
                    }
                } catch (err) {
                    console.error("[Campaign Worker] Error:", err);
                }
            }, 3000);
        };

        // --- WORKER 2: ROBUST POLLING ENGINE ---
        const startPollingWorker = async () => {
            const runPoll = async () => {
                if (!isMounted.current) return;
                if (!localStorage.getItem('cartie_token')) {
                    pollingRef.current = setTimeout(runPoll, 5000);
                    return;
                }
                
                let pollInterval = 4000; 

                // ONLY LEADER RUNS
                if (checkIsLeader()) {
                    try {
                        const allBots = await Data.getBots();
                        // Canonicalization Logic: Group by token, keep only 1 active per token
                        const botsByToken: Record<string, Bot[]> = {};
                        const canonicalBots: Bot[] = [];

                        allBots.forEach(b => {
                            if (!botsByToken[b.token]) botsByToken[b.token] = [];
                            botsByToken[b.token].push(b);
                        });

                        Object.values(botsByToken).forEach(async (group) => {
                            // Sort by active status then ID desc
                            group.sort((a, b) => {
                                if (a.active !== b.active) return a.active ? -1 : 1;
                                return b.id.localeCompare(a.id);
                            });

                            const winner = group[0];
                            // If winner is active, add to poll list
                            if (winner.active && winner.autoSync !== false) {
                                canonicalBots.push(winner);
                            }

                            // Deactivate losers if they were active
                            for (let i = 1; i < group.length; i++) {
                                const loser = group[i];
                                if (loser.active) {
                                    console.warn(`[Worker] Deactivating duplicate bot ${loser.name} (${loser.id}) for token overlap.`);
                                    loser.active = false;
                                    await Data.saveBot(loser);
                                }
                            }
                        });

                        if (canonicalBots.length > 0) {
                            await Promise.all(canonicalBots.map(async (bot) => {
                                if (!isMounted.current) return;
                                
                                // Triple check existence and state just before network call
                                const freshBots = await Data.getBots();
                                const freshBot = freshBots.find(b => b.id === bot.id);
                                if (!freshBot || !freshBot.active) return;
                                
                                try {
                                    await BotEngine.syncBot(freshBot);
                                } catch (e) {
                                    // Individual bot errors shouldn't crash the loop
                                }
                            }));
                        } else {
                            pollInterval = 6000; // Slow down if no bots
                        }
                    } catch (criticalError) {
                        console.error("[Worker] Critical Loop Error:", criticalError);
                        pollInterval = 15000; // Backoff on critical failure
                    }
                } else {
                    pollInterval = 5000; // Standby check
                }

                // GUARANTEE NEXT TICK
                if (isMounted.current) {
                    pollingRef.current = setTimeout(runPoll, pollInterval);
                }
            };

            if (pollingRef.current) clearTimeout(pollingRef.current);
            runPoll();
        };

        if (!disableCampaigns) startCampaignWorker();
        if (!disablePolling) startPollingWorker();

        return () => {
            isMounted.current = false;
            if (campaignRef.current) clearInterval(campaignRef.current);
            if (pollingRef.current) clearTimeout(pollingRef.current);
        };
    }, [user]);

    return <>{children}</>;
};
