import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

type MiniAppImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackLabel?: string;
  sources?: Array<string | null | undefined>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
};

const isUsableImageSrc = (value?: string | null) => {
  const raw = String(value || '').trim();
  return /^(https?:\/\/|\/|data:image\/)/i.test(raw);
};

export const MiniAppImage = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackClassName = 'w-full h-full flex items-center justify-center bg-[#202226] text-white/22',
  fallbackLabel,
  sources,
  onClick
}: MiniAppImageProps) => {
  const candidates = (sources?.length ? sources : [src]).filter(isUsableImageSrc) as string[];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [candidates.join('|')]);

  const current = candidates[index];
  const content = current ? (
    <img
      src={current}
      alt={alt}
      className={className}
      onError={() => setIndex(prev => prev + 1)}
    />
  ) : (
    <div className={fallbackClassName} aria-label={alt}>
      <ImageIcon size={34} />
      {fallbackLabel && (
        <span className="mt-1 text-[10px] font-bold text-white/35">{fallbackLabel}</span>
      )}
    </div>
  );

  if (!onClick) return content;
  return (
    <div className="w-full h-full" onClick={onClick}>
      {content}
    </div>
  );
};
