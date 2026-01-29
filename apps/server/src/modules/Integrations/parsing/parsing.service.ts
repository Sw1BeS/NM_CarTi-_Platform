import { logger } from '../../../utils/logger.js';

export type ExtractionMethod = 'REGEX' | 'LINE_INDEX' | 'KEYWORD_AFTER' | 'BETWEEN';

export interface FieldRule {
    method: ExtractionMethod;
    // For REGEX
    pattern?: string;
    groupIndex?: number;
    // For LINE_INDEX
    lineIndex?: number;
    // For KEYWORD_AFTER
    keyword?: string; // e.g. "Price:"
    // For BETWEEN
    startMarker?: string;
    endMarker?: string;
}

export interface ParsingTemplate {
    name: string;
    rules: Record<string, FieldRule>;
}

export class ParsingService {

    /**
     * Executes a parsing template against raw text.
     */
    static extract(text: string, template: ParsingTemplate): Record<string, any> {
        const result: Record<string, any> = {};
        const lines = text.split('\n');

        for (const [field, rule] of Object.entries(template.rules)) {
            try {
                let value: string | null = null;

                switch (rule.method) {
                    case 'REGEX':
                        if (rule.pattern) {
                            const re = new RegExp(rule.pattern, 'i');
                            const match = text.match(re);
                            if (match) {
                                value = match[rule.groupIndex || 0] || match[0];
                            }
                        }
                        break;

                    case 'LINE_INDEX':
                        if (rule.lineIndex !== undefined && lines[rule.lineIndex]) {
                            value = lines[rule.lineIndex].trim();
                        }
                        break;

                    case 'KEYWORD_AFTER':
                        if (rule.keyword) {
                            const escaped = rule.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const re = new RegExp(`${escaped}\\s*([^\\n]+)`, 'i');
                            const match = text.match(re);
                            if (match) {
                                value = match[1].trim();
                            }
                        }
                        break;

                    case 'BETWEEN':
                        if (rule.startMarker && rule.endMarker) {
                            const startIndex = text.indexOf(rule.startMarker);
                            if (startIndex !== -1) {
                                const contentStart = startIndex + rule.startMarker.length;
                                const endIndex = text.indexOf(rule.endMarker, contentStart);
                                if (endIndex !== -1) {
                                    value = text.substring(contentStart, endIndex).trim();
                                } else {
                                    // If end marker not found, take until end of line?
                                    // Or assume failed. Let's assume failed for strictness.
                                    // Actually usually "until end of string" if undefined.
                                    // But let's support explicit markers only for now.
                                }
                            }
                        }
                        break;
                }

                // Post-processing for common fields
                if (value) {
                    if (field === 'price' || field === 'mileage' || field === 'year') {
                        // Keep only digits and dots if strictly numeric field intended?
                        // Or let the service caller handle it.
                        // Best to return raw string here, but "price" usually implies number.
                        // Let's implement basic numeric cleaning if field name implies it.

                        if (field === 'price' || field === 'year' || field === 'mileage') {
                            const num = parseInt(value.replace(/\D/g, ''), 10);
                            if (!isNaN(num)) result[field] = num;
                            else result[field] = value; // fallback
                        } else {
                            result[field] = value;
                        }
                    } else {
                        result[field] = value;
                    }
                }
            } catch (e: any) {
                logger.warn(`Parsing error for field ${field}: ${e.message}`);
            }
        }
        return result;
    }
}
