import React, { useState } from 'react';
import { parseListingFromUrl } from '../../services/parserClient';
import { ApiClient } from '../../services/apiClient';
import { useToast } from '../../contexts/ToastContext';

export const QAStageA = () => {
  const [url, setUrl] = useState('');
  const [parseResult, setParseResult] = useState<any>(null);
  const [deepLink, setDeepLink] = useState<string>('');
  const [dlType, setDlType] = useState<'dealer_invite' | 'request'>('dealer_invite');
  const [dlReq, setDlReq] = useState('');
  const [dlDealer, setDlDealer] = useState('');
  const { showToast } = useToast();

  const handleParse = async () => {
    if (!url) {
      showToast('Enter URL', 'error');
      return;
    }
    try {
      const res = await parseListingFromUrl(url);
      setParseResult(res);
    } catch (e: any) {
      showToast(e.message || 'Parse failed', 'error');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Stage A QA</h1>

      <div className="panel p-4 mb-6">
        <h3 className="font-bold mb-2">Parse URL (anti-mismatch)</h3>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/listing"
          />
          <button className="btn-primary" onClick={handleParse}>Parse</button>
        </div>
        {parseResult && (
          <div className="mt-3 text-sm">
            <div>Confidence: {parseResult.confidence}</div>
            <div>Reason: {parseResult.reason}</div>
            <pre className="bg-[var(--bg-input)] p-3 rounded mt-2 text-xs overflow-auto">
              {JSON.stringify(parseResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="panel p-4">
        <h3 className="font-bold mb-2">Simulate /start payload</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select className="input" value={dlType} onChange={e => setDlType(e.target.value as any)}>
            <option value="dealer_invite">dealer_invite</option>
            <option value="request">request</option>
          </select>
          {dlType === 'dealer_invite' && (
            <input className="input" placeholder="Dealer ID" value={dlDealer} onChange={e => setDlDealer(e.target.value)} />
          )}
          <input className="input" placeholder="Request ID/PublicId" value={dlReq} onChange={e => setDlReq(e.target.value)} />
        </div>
        <button
          className="btn-primary mt-3"
          onClick={async () => {
            try {
              const params = new URLSearchParams({ type: dlType });
              if (dlReq) params.append('requestId', dlReq);
              if (dlDealer) params.append('dealerId', dlDealer);
              const res = await ApiClient.get<any>(`qa/simulate/start?${params.toString()}`);
              if (!res.ok) throw new Error(res.message);
              setDeepLink(res.data?.link || '');
            } catch (e: any) {
              showToast(e.message || 'Simulate failed', 'error');
            }
          }}
        >
          Generate deep-link
        </button>
        {deepLink && (
          <div className="mt-2 text-sm">
            Deep-link: <code>{deepLink}</code>
          </div>
        )}
      </div>
    </div>
  );
};

export default QAStageA;
