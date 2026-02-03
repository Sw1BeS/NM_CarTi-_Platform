import React, { useState, useEffect } from 'react';
import { parseListingFromUrl } from '../../services/parserClient';
import { ApiClient } from '../../services/apiClient';
import { useToast } from '../../contexts/ToastContext';
import { Data } from '../../services/data';

export const QAStageA = () => {
  const [url, setUrl] = useState('');
  const [parseResult, setParseResult] = useState<any>(null);
  const [deepLink, setDeepLink] = useState<string>('');
  const [dlType, setDlType] = useState<'dealer_invite' | 'request'>('dealer_invite');
  const [dlReq, setDlReq] = useState('');
  const [dlDealer, setDlDealer] = useState('');
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [webhookInfo, setWebhookInfo] = useState<any>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCheck, setMediaCheck] = useState<any>(null);
  const { showToast } = useToast();

  useEffect(() => {
    Data.getBots().then(setBots).catch(() => setBots([]));
  }, []);

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

      <div className="panel p-4 mb-6">
        <h3 className="font-bold mb-2">Telegram Diagnostics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase">Bot</label>
            <select className="input mt-1" value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
              <option value="">Auto (first active)</option>
              {bots.map(b => (
                <option key={b.id} value={b.id}>{b.name || b.username || b.id}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              className="btn-secondary text-xs"
              onClick={async () => {
                try {
                  const res = await ApiClient.get<any>(`qa/telegram/token${selectedBotId ? `?botId=${selectedBotId}` : ''}`);
                  if (!res.ok) throw new Error(res.message);
                  setTokenInfo(res.data);
                } catch (e: any) {
                  showToast(e.message || 'Token check failed', 'error');
                }
              }}
            >
              Check Token
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={async () => {
                try {
                  const res = await ApiClient.get<any>(`qa/telegram/webhook${selectedBotId ? `?botId=${selectedBotId}` : ''}`);
                  if (!res.ok) throw new Error(res.message);
                  setWebhookInfo(res.data);
                } catch (e: any) {
                  showToast(e.message || 'Webhook check failed', 'error');
                }
              }}
            >
              Check Webhook
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[var(--text-secondary)]">
          <div className="bg-[var(--bg-input)] p-3 rounded">
            <div className="font-bold text-[var(--text-primary)] mb-2">Token Result</div>
            <pre className="text-[10px] overflow-auto">{JSON.stringify(tokenInfo, null, 2)}</pre>
          </div>
          <div className="bg-[var(--bg-input)] p-3 rounded">
            <div className="font-bold text-[var(--text-primary)] mb-2">Webhook Info</div>
            <pre className="text-[10px] overflow-auto">{JSON.stringify(webhookInfo, null, 2)}</pre>
          </div>
        </div>
      </div>

      <div className="panel p-4 mb-6">
        <h3 className="font-bold mb-2">Media Availability</h3>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={mediaUrl}
            onChange={e => setMediaUrl(e.target.value)}
            placeholder="/media/telegram/..."
          />
          <button
            className="btn-secondary text-xs"
            onClick={async () => {
              if (!mediaUrl) return showToast('Enter media URL', 'error');
              try {
                const res = await ApiClient.get<any>(`qa/media/check?url=${encodeURIComponent(mediaUrl)}`);
                if (!res.ok) throw new Error(res.message);
                setMediaCheck(res.data);
              } catch (e: any) {
                showToast(e.message || 'Media check failed', 'error');
              }
            }}
          >
            Check
          </button>
        </div>
        {mediaCheck && (
          <div className="mt-3 text-xs bg-[var(--bg-input)] p-3 rounded">
            {JSON.stringify(mediaCheck, null, 2)}
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
