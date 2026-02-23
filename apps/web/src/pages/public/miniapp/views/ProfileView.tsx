import React from 'react';
import { ClipboardList, Heart, History, LogOut, ShieldCheck, Star, User } from 'lucide-react';

type TgUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type ProfileViewProps = {
  tgUser: TgUser | null;
  primaryColor: string;
  favoriteCount: number;
  createdRequestCount: number;
  onCloseApp: () => void;
};

export const ProfileView = ({
  tgUser,
  primaryColor,
  favoriteCount,
  createdRequestCount,
  onCloseApp
}: ProfileViewProps) => {
  const fullName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ').trim() || 'Користувач';
  const username = tgUser?.username ? `@${tgUser.username}` : 'username недоступний';

  return (
    <div className="animate-fade-in pb-24 h-full overflow-y-auto bg-black">
      <div className="p-6 pt-10 rounded-b-[40px] shadow-lg relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}20 0%, #000000 100%)` }}>
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-full border-4 border-white/10 shadow-2xl bg-[#1c1c1e] flex items-center justify-center overflow-hidden mb-4 relative">
            {tgUser?.photo_url ? (
              <img src={tgUser.photo_url} className="w-full h-full object-cover" />
            ) : (
              <User size={40} className="text-white/50" />
            )}
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-2 border-black"></div>
          </div>
          <h2 className="text-2xl font-bold text-white">{fullName}</h2>
          <p className="text-white/50 text-sm mb-4">{username}</p>

          <div className="flex gap-2 flex-wrap justify-center">
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] text-white font-bold flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-500" /> Верифікований профіль
            </span>
            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] text-white font-bold">
              ID: {tgUser?.id || '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 mt-6 space-y-4">
        <div className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5">
          <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
            <History size={16} style={{ color: primaryColor }} /> Активність
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between text-white/80">
              <span className="flex items-center gap-2"><Heart size={14} className="text-pink-400" /> Збережені авто</span>
              <b className="text-white">{favoriteCount}</b>
            </div>
            <div className="flex items-center justify-between text-white/80">
              <span className="flex items-center gap-2"><ClipboardList size={14} className="text-blue-400" /> Створені запити</span>
              <b className="text-white">{createdRequestCount}</b>
            </div>
          </div>
        </div>

        <div className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5">
          <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
            <Star size={16} style={{ color: primaryColor }} /> Профіль CarTié
          </h3>
          <p className="text-xs text-white/60 leading-relaxed">
            Дані профілю завантажені з Telegram Mini App сесії. Контактні дані дилерів у B2B процесі
            передаються лише адміністратору після підтвердження FIT.
          </p>
        </div>

        <button onClick={onCloseApp} className="w-full py-4 rounded-xl bg-red-500/10 text-red-500 font-bold flex items-center justify-center gap-2 border border-red-500/20 hover:bg-red-500/20 transition-colors">
          <LogOut size={18} /> Закрити застосунок
        </button>
      </div>
    </div>
  );
};
