
import { B2BRequest, Variant } from '../types';

export const ContentGenerator = {
    // Advanced templates
    templates: {
        CHANNEL_POST: `🔥 <b>{title}</b>\n\n💰 PRICE: {price} {currency}\n\n📍 {city} | 🗓 {year} | 🛣 {mileage} km\n\n⚙️ {specs}\n\n{notes}\n\n👇 Details:\n{link}\n\n#cartie #{brand} #{model} {hashtag_year}`,
        CLIENT_PROPOSAL: `👋 Hello! Found a great option for you:\n\n🚗 {title}\n💵 {price} {currency}\n🗓 {year} | {mileage} km\n\nPhotos & Details: {link}`,
        B2B_REQUEST: `🆘 <b>Looking for Car!</b>\n\n🚙 {title}\n💰 Budget: {budgetMin}-{budgetMax}\n📍 City: {city}\n📅 Year: {yearMin}+\n\n📝 Reqs: {description}\n\nTap below if you have it! 👇`
    },

    generate(templateStr: string, data: any): string {
        let result = templateStr;
        const keys = Object.keys(data);
        
        keys.forEach(key => {
            const val = data[key];
            const placeholder = `{${key}}`;
            // Safe replacement, handle null/undefined
            const replacement = (val !== undefined && val !== null) ? String(val) : '';
            result = result.replace(new RegExp(placeholder, 'g'), replacement);
        });

        // Clean up empty lines
        return result.replace(/\n\s*\n/g, '\n\n').trim();
    },

    fromVariant(variant: Variant, templateKey: 'CHANNEL_POST' | 'CLIENT_PROPOSAL' = 'CHANNEL_POST'): string {
        const tpl = this.templates[templateKey];
        
        const specsObj = variant.specs || {};
        const specsList = [];
        if (specsObj.engine) specsList.push(`⛽ ${specsObj.engine}`);
        if (specsObj.transmission) specsList.push(`🕹 ${specsObj.transmission}`);
        if (specsObj.fuel) specsList.push(`⛽ ${specsObj.fuel}`);
        const specsStr = specsList.join(' | ') || 'Full Options';

        const brand = (variant.title || '').split(' ')[0] || '';
        const model = (variant.title || '').split(' ')[1] || '';

        // Extract basic data
        const data = {
            title: variant.title || 'Untitled Car',
            price: variant.price?.amount?.toLocaleString() || '0',
            currency: variant.price?.currency || 'USD',
            city: variant.location || 'Ukraine', 
            year: variant.year || new Date().getFullYear(),
            mileage: (variant.mileage || 0).toLocaleString(),
            specs: specsStr,
            notes: variant.managerNotes ? `ℹ️ ${variant.managerNotes}` : '',
            link: variant.url || variant.sourceUrl || '', 
            brand: brand.replace(/[^a-zA-Z0-9]/g, ''),
            model: model.replace(/[^a-zA-Z0-9]/g, ''),
            hashtag_year: `#y${variant.year}`
        };

        return this.generate(tpl, data);
    },

    fromRequest(req: B2BRequest): string {
        const tpl = this.templates.B2B_REQUEST;
        const data = {
            title: req.title || 'Car Request',
            budgetMin: req.budgetMin > 0 ? req.budgetMin.toLocaleString() : 'Open',
            budgetMax: req.budgetMax > 0 ? req.budgetMax.toLocaleString() : 'Open',
            city: req.city || 'Ukraine',
            yearMin: req.yearMin || 'Any',
            description: req.description || 'No special requirements'
        };
        return this.generate(tpl, data);
    }
};
