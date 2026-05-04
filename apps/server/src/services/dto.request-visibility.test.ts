import { describe, expect, it } from 'vitest';

import { mapAdminFitQueueItemOutput, mapReceivedVariantContractOutput } from './dto.js';

describe('dto request visibility contracts', () => {
  it('keeps received variants redacted while exposing mediation metadata', () => {
    const output = mapReceivedVariantContractOutput({
      id: 'variant_1',
      requestId: 'req_1',
      request: { publicId: 'REQ-1', status: 'CONTACT_SHARED' },
      status: 'APPROVED',
      requesterDecision: 'FIT',
      fitQueueStatus: 'NEW',
      title: 'BMW X5',
      price: 55000,
      currency: 'USD',
      contact: '+380501112233',
      companyName: 'Seller Co',
      sellerPartner: { name: 'Seller Co' }
    });

    expect(output.contactShared).toBe(true);
    expect(output.contactAvailable).toBe(true);
    expect(output.sellerCompany).toBe('Seller Co');
    expect(output).not.toHaveProperty('contact');
  });

  it('keeps admin fit queue item redacted until explicit contact share', () => {
    const output = mapAdminFitQueueItemOutput({
      id: 'variant_1',
      requestId: 'req_1',
      request: {
        publicId: 'REQ-1',
        status: 'SHORTLIST',
        payload: {
          request: {
            phone: '+380671234567'
          }
        }
      },
      fitQueueStatus: 'NEW',
      requesterDecisionAt: new Date().toISOString(),
      fitQueuedAt: new Date().toISOString(),
      title: 'BMW X5',
      companyName: 'Seller Co',
      sellerPartner: { name: 'Seller Co' },
      price: 55000,
      currency: 'USD',
      contact: '+380501112233'
    });

    expect(output.requestStatus).toBe('SHORTLIST');
    expect(output.requesterContactAvailable).toBe(true);
    expect(output.sellerContactAvailable).toBe(true);
    expect(output.contactAvailable).toBe(true);
    expect(output).not.toHaveProperty('contact');
  });
});
