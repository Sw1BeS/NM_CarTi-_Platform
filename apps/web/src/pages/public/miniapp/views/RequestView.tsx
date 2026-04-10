import React from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';

type MiniAppSurfaceMode = 'LEAD' | 'B2B';

type RequestViewProps = {
  reqStep: number;
  reqData: { brand: string; budget: string; year: string };
  setReqData: (next: { brand: string; budget: string; year: string }) => void;
  reqMileage: string;
  setReqMileage: (value: string) => void;
  reqFuel: string;
  setReqFuel: (value: string) => void;
  reqCompany: string;
  setReqCompany: (value: string) => void;
  reqPhone: string;
  setReqPhone: (value: string) => void;
  reqComment: string;
  setReqComment: (value: string) => void;
  selectedCarsCount: number;
  selectedCarsPreview: string[];
  onClearSelectedCars: () => void;
  hasTelegramInit: boolean;
  primaryColor: string;
  surfaceMode: MiniAppSurfaceMode;
  onNextStep: () => void;
  onHome: () => void;
};

export const RequestView = ({
  reqStep,
  reqData,
  setReqData,
  reqMileage,
  setReqMileage,
  reqFuel,
  setReqFuel,
  reqCompany,
  setReqCompany,
  reqPhone,
  setReqPhone,
  reqComment,
  setReqComment,
  selectedCarsCount,
  selectedCarsPreview,
  onClearSelectedCars,
  hasTelegramInit,
  primaryColor,
  surfaceMode,
  onNextStep,
  onHome
}: RequestViewProps) => {
  return (
    <div className="animate-fade-in pb-24 p-6 h-full overflow-y-auto flex flex-col justify-center bg-black">
      {reqStep === 3 ? (
        <div className="text-center animate-slide-up">
          <div className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
            <CheckCircle size={48} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Запит відправлено!</h2>
          <p className="text-white/50 mb-8">Ми отримали ваш запит. Менеджер перевірить ринок і скоро зв’яжеться з вами.</p>
          <button onClick={onHome} className="btn-primary w-full py-4 rounded-xl font-bold text-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
            На головну
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-3xl font-bold text-white mb-2">{surfaceMode === 'B2B' ? 'Створити B2B запит' : 'Підібрати авто за 1 хвилину'}</h2>
          <p className="text-white/50 mb-8">
            {surfaceMode === 'B2B'
              ? 'Заповніть структурований запит для партнерської мережі.'
              : 'Опишіть, яке авто вам потрібно. Якщо вже обрали кілька варіантів у каталозі, ми додамо їх до запиту автоматично.'}
          </p>

          <div className="space-y-6">
            {reqStep === 1 && (
              <div className="space-y-5 animate-slide-up">
                {selectedCarsCount > 0 && (
                  <div className="bg-[#1c1c1e] border border-white/10 rounded-xl p-3 text-xs text-white/80">
                    <div className="flex items-center justify-between gap-2">
                      <span>Мультивибір: {selectedCarsCount} авто</span>
                      <button onClick={onClearSelectedCars} className="text-white/60 underline">Очистити</button>
                    </div>
                    {selectedCarsPreview.length > 0 && (
                      <div className="text-white/50 mt-1 truncate">{selectedCarsPreview.join(', ')}</div>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Марка та модель</label>
                  <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 focus:border-yellow-500 transition-colors" placeholder="Напр. BMW X5" value={reqData.brand} onChange={e => setReqData({ ...reqData, brand: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Рік від</label>
                    <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="2018" value={reqData.year} onChange={e => setReqData({ ...reqData, year: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Бюджет до</label>
                    <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="50000" value={reqData.budget} onChange={e => setReqData({ ...reqData, budget: e.target.value })} />
                  </div>
                </div>
                {surfaceMode === 'B2B' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Бажаний пробіг</label>
                        <input type="text" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="до 120000 км" value={reqMileage} onChange={e => setReqMileage(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Тип пального</label>
                        <input type="text" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="дизель / бензин / гібрид" value={reqFuel} onChange={e => setReqFuel(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Компанія, яка шукає</label>
                      <input type="text" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="Назва компанії" value={reqCompany} onChange={e => setReqCompany(e.target.value)} />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-bold text-white/70 uppercase mb-2 block">{surfaceMode === 'B2B' ? 'Контакт (обовʼязково)' : 'Телефон для звʼязку'}</label>
                  <input type="tel" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="+380 67 123 45 67" value={reqPhone} onChange={e => setReqPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Коментар (опційно)</label>
                  <textarea className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 min-h-[96px]" placeholder="Деталі, побажання, важливі умови" value={reqComment} onChange={e => setReqComment(e.target.value)} />
                </div>
              </div>
            )}

            {reqStep === 2 && (
              <div className="space-y-4 animate-slide-up">
                <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/10 text-white/80 text-sm space-y-2">
                  <p className="font-bold text-white mb-4 text-lg border-b border-white/10 pb-2">Підсумок</p>
                  <div className="flex justify-between"><span>Авто:</span> <span className="font-bold text-white">{reqData.brand}</span></div>
                  <div className="flex justify-between"><span>Рік:</span> <span className="font-bold text-white">{reqData.year}+</span></div>
                  <div className="flex justify-between"><span>Бюджет:</span> <span className="font-bold text-white" style={{ color: primaryColor }}>${reqData.budget}</span></div>
                  {surfaceMode === 'B2B' && (
                    <>
                      <div className="flex justify-between"><span>Пробіг:</span> <span className="font-bold text-white">{reqMileage || '—'}</span></div>
                      <div className="flex justify-between"><span>Пальне:</span> <span className="font-bold text-white">{reqFuel || '—'}</span></div>
                      <div className="flex justify-between"><span>Компанія:</span> <span className="font-bold text-white">{reqCompany || '—'}</span></div>
                    </>
                  )}
                  <div className="flex justify-between"><span>Контакт:</span> <span className="font-bold text-white">{reqPhone || '—'}</span></div>
                  <div className="flex justify-between"><span>Коментар:</span> <span className="font-bold text-white">{reqComment || '—'}</span></div>
                  {selectedCarsCount > 0 && (
                    <div className="flex justify-between"><span>Обрані авто:</span> <span className="font-bold text-white">{selectedCarsCount}</span></div>
                  )}
                </div>
                <p className="text-xs text-white/50 text-center px-4">
                  {surfaceMode === 'B2B'
                    ? 'Після надсилання запит буде опубліковано в приватному каналі без ваших відкритих контактів.'
                    : 'Після надсилання менеджер зв’яжеться з вами у цьому чаті.'}
                </p>
                {!hasTelegramInit && (
                  <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                    Відкрийте цю сторінку з Telegram, щоб надіслати запит.
                  </div>
                )}
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={onNextStep}
                disabled={reqStep === 1 && (!reqData.brand || (surfaceMode === 'B2B' && (!reqPhone || !reqCompany)))}
                className="w-full py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {reqStep === 1 ? 'Продовжити' : (hasTelegramInit ? 'Надіслати запит' : 'Відкрити в Telegram для надсилання')} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
