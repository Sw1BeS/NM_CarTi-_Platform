
import { Data } from './data';
import { CarListing, B2BRequest, RequestStatus } from '../types';

export const MatchingService = {
    findMatchesForCar: async (car: CarListing): Promise<{ req: B2BRequest, score: number }[]> => {
        const requests = await Data.getRequests();
        const matches: { req: B2BRequest, score: number }[] = [];

        requests.forEach(req => {
            if (req.status === RequestStatus.CLOSED || req.status === RequestStatus.PUBLISHED) return;

            let score = 0;
            let totalWeight = 0;

            // 1. Title/Brand Match (Crucial)
            const carTitle = car.title.toLowerCase();
            const reqTitle = req.title.toLowerCase();
            const brand = reqTitle.split(' ')[0]; // Simple assumption

            if (carTitle.includes(brand)) {
                score += 40;
                // Model fuzzy match
                const reqModel = reqTitle.replace(brand, '').trim();
                if (reqModel && carTitle.includes(reqModel)) {
                    score += 20;
                }
            }
            totalWeight += 60;

            // 2. Budget Match
            if (req.budgetMax > 0) {
                totalWeight += 20;
                if (car.price.amount <= req.budgetMax) score += 20;
                else if (car.price.amount <= req.budgetMax * 1.1) score += 10;
            }

            // 3. Year Match
            if (req.yearMin > 0) {
                totalWeight += 20;
                if (car.year >= req.yearMin) score += 20;
                else if (car.year >= req.yearMin - 1) score += 10;
            }

            const percentage = Math.round((score / totalWeight) * 100);
            if (percentage >= 70) {
                matches.push({ req, score: percentage });
            }
        });

        return matches.sort((a, b) => b.score - a.score);
    },

    notifyIfMatch: async (car: CarListing) => {
        const matches = await MatchingService.findMatchesForCar(car);
        if (matches.length > 0) {
            const topMatch = matches[0];
            await Data.addNotification({
                type: 'SUCCESS',
                title: 'Smart Match Found! 🎯',
                message: `New inventory "${car.title}" matches request ${topMatch.req.publicId} (${topMatch.score}%)`,
                link: `/requests?id=${topMatch.req.id}`
            } as any);
            return true;
        }
        return false;
    }
};
