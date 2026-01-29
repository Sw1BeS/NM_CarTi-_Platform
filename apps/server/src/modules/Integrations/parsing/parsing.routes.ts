import { Router } from 'express';
import { ParsingService } from './parsing.service.js';
import { errorResponse } from '../../../utils/errorResponse.js';
import { requireRole } from '../../../middleware/auth.js';

const router = Router();

// POST /api/parsing/preview
// Test a parsing template against sample text
router.post('/preview', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { text, template } = req.body;

        if (!text || !template) {
            return errorResponse(res, 400, 'Missing text or template', 'VALIDATION_ERROR');
        }

        const result = ParsingService.extract(text, template);

        res.json({ success: true, result });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Parsing error', 'PARSING_ERROR');
    }
});

export default router;
