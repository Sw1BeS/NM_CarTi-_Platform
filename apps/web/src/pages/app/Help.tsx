import React from 'react';
import { Info, Navigation, MousePointerClick, Phone, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="panel p-6 space-y-3">
    <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
      <Info size={16} className="text-gold-500" /> {title}
    </div>
    <div className="text-sm leading-relaxed text-[var(--text-primary)] space-y-2">{children}</div>
  </div>
);

export const HelpPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">Welcome to CarTié</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Use this page as your quick start. Each link opens the area you need.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => navigate('/')}>Dashboard</button>
          <button className="btn-secondary" onClick={() => navigate('/requests')}>Requests</button>
          <button className="btn-secondary" onClick={() => navigate('/inbox')}>Inbox</button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="First 5 steps">
          <ol className="list-decimal list-inside space-y-1 text-[var(--text-primary)]">
            <li>Open <button className="underline text-gold-500" onClick={() => navigate('/integrations')}>Integrations</button> and connect your Telegram bot.</li>
            <li>Go to <button className="underline text-gold-500" onClick={() => navigate('/requests')}>Requests</button> and add your first buy/sell request.</li>
            <li>Share a request to a channel from the requests table (paper plane icon).</li>
            <li>Reply to new chats in <button className="underline text-gold-500" onClick={() => navigate('/inbox')}>Inbox</button>.</li>
            <li>Check <button className="underline text-gold-500" onClick={() => navigate('/')}>Dashboard</button> for new leads and activity.</li>
          </ol>
        </Section>

        <Section title="What each module does">
          <ul className="space-y-2 text-[var(--text-primary)]">
            <li><strong>Inbox:</strong> All Telegram conversations, quick replies, send car cards.</li>
            <li><strong>Requests:</strong> Deals pipeline with offers. Highlighted when new offers arrive.</li>
            <li><strong>Inventory:</strong> Your cars, used for sharing and matching to requests.</li>
            <li><strong>Leads:</strong> Raw contacts captured from chats/forms.</li>
            <li><strong>Content/Calendar:</strong> Draft and schedule social posts.</li>
            <li><strong>Integrations:</strong> Connect bots, webhooks, pixels, sheets.</li>
          </ul>
        </Section>

        <Section title="Shortcuts & tips">
          <ul className="space-y-2 text-[var(--text-primary)]">
            <li className="flex items-center gap-2"><Navigation size={16} className="text-gold-500" /> Press <span className="font-mono bg-[var(--bg-input)] px-2 py-0.5 rounded">⌘/Ctrl + K</span> to open the command palette.</li>
            <li className="flex items-center gap-2"><MousePointerClick size={16} className="text-gold-500" /> In requests table, use the paper plane to broadcast to a Telegram channel.</li>
            <li className="flex items-center gap-2"><Phone size={16} className="text-gold-500" /> On a phone, tables become scrollable—swipe sideways for hidden columns.</li>
          </ul>
        </Section>

        <Section title="Need help?">
          <p>Email <a className="text-gold-500 underline" href="mailto:support@cartie.app">support@cartie.app</a> or send a message in the Telegram admin chat.</p>
          <p className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"><ShieldCheck size={14} /> Keep tokens/keys in .env, never paste them in chat.</p>
        </Section>
      </div>
    </div>
  );
};

export default HelpPage;
