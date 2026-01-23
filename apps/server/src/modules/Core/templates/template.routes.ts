
import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { companyMiddleware } from '../../../middleware/company.middleware.js';

const router = Router();

router.use(companyMiddleware);

// Define realistic templates
const TEMPLATES = [
  {
    id: 'tpl_lead_gen',
    name: 'Lead Generation',
    category: 'LEAD_GEN',
    description: 'Capture client details: Name, Car, Budget, Phone.',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
    isPublic: true,
    structure: {
        entryNodeId: 'start',
        nodes: [
            { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'welcome', position: { x: 100, y: 300 } },
            { id: 'welcome', type: 'MESSAGE', content: { text: 'Welcome! Looking for a car?' }, nextNodeId: 'ask_name', position: { x: 300, y: 300 } },
            { id: 'ask_name', type: 'QUESTION', content: { text: 'What is your name?', variable: 'name' }, nextNodeId: 'ask_car', position: { x: 500, y: 300 } },
            { id: 'ask_car', type: 'QUESTION', content: { text: 'Which car do you need?', variable: 'car' }, nextNodeId: 'ask_phone', position: { x: 700, y: 300 } },
            { id: 'ask_phone', type: 'QUESTION', content: { text: 'Please share your phone number.', inputType: 'phone', variable: 'phone' }, nextNodeId: 'thank_you', position: { x: 900, y: 300 } },
            { id: 'thank_you', type: 'MESSAGE', content: { text: 'Thanks! We will contact you soon.' }, nextNodeId: '', position: { x: 1100, y: 300 } }
        ]
    }
  },
  {
    id: 'tpl_catalog',
    name: 'Catalog Browser',
    category: 'E_COMMERCE',
    description: 'Allow users to search inventory by brand, model, and price.',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/2331/2331970.png',
    isPublic: true,
    structure: {
        entryNodeId: 'start',
        nodes: [
            { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'menu', position: { x: 100, y: 300 } },
            { id: 'menu', type: 'CHOICE', content: { text: 'Main Menu', choices: [{ label: 'Find Car', nextNodeId: 'search' }, { label: 'Sell Car', nextNodeId: 'sell' }] }, nextNodeId: '', position: { x: 300, y: 300 } },
            { id: 'search', type: 'MESSAGE', content: { text: 'Starting search...' }, nextNodeId: '', position: { x: 500, y: 200 } },
            { id: 'sell', type: 'MESSAGE', content: { text: 'To sell, please contact support.' }, nextNodeId: '', position: { x: 500, y: 400 } }
        ]
    }
  },
  {
    id: 'tpl_support',
    name: 'Customer Support',
    category: 'SUPPORT',
    description: 'Simple FAQ and ticket creation flow.',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/4233/4233830.png',
    isPublic: true,
    structure: {
        entryNodeId: 'start',
        nodes: [
            { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'welcome', position: { x: 100, y: 300 } },
            { id: 'welcome', type: 'MESSAGE', content: { text: 'How can we help?' }, nextNodeId: 'options', position: { x: 300, y: 300 } },
            { id: 'options', type: 'CHOICE', content: { text: 'Choose topic:', choices: [{ label: 'Hours', nextNodeId: 'hours' }, { label: 'Location', nextNodeId: 'loc' }, { label: 'Talk to human', nextNodeId: 'human' }] }, nextNodeId: '', position: { x: 500, y: 300 } },
            { id: 'hours', type: 'MESSAGE', content: { text: 'We are open 9-18 Mon-Fri.' }, nextNodeId: '', position: { x: 700, y: 100 } },
            { id: 'loc', type: 'MESSAGE', content: { text: 'We are located at Downtown 123.' }, nextNodeId: '', position: { x: 700, y: 300 } },
            { id: 'human', type: 'MESSAGE', content: { text: 'A manager has been notified.' }, nextNodeId: '', position: { x: 700, y: 500 } }
        ]
    }
  }
];

router.get('/', async (req, res) => {
    // Return static templates mixed with DB templates if any
    try {
        const dbTemplates = await prisma.scenarioTemplate.findMany({
            where: { isPublic: true }
        });

        // Merge dbTemplates with static ones if ID not present
        const dbIds = new Set(dbTemplates.map(t => t.id));
        const final = [...dbTemplates];

        TEMPLATES.forEach(t => {
            if (!dbIds.has(t.id)) {
                final.push(t as any);
            }
        });

        res.json(final);
    } catch (e) {
        console.error('Templates error:', e);
        // Fallback to static
        res.json(TEMPLATES);
    }
});

router.post('/:id/install', async (req, res) => {
    const { id } = req.params;
    const companyId = (req as any).user?.companyId;
    if (!companyId) return res.status(400).json({ error: 'Company required' });

    const tpl = TEMPLATES.find(t => t.id === id) || await prisma.scenarioTemplate.findUnique({ where: { id } });
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    try {
        const structure = tpl.structure as any;
        const scenario = await prisma.scenario.create({
            data: {
                name: `${tpl.name} (Copy)`,
                triggerCommand: `start_${Date.now()}`,
                companyId,
                nodes: structure?.nodes || [],
                entryNodeId: structure?.entryNodeId || null,
                status: 'DRAFT',
                isActive: false
            }
        });
        res.json(scenario);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Install failed' });
    }
});

export default router;
