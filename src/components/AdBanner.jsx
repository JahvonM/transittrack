import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Image } from "@/components/ui/image";
import { Megaphone, X } from "lucide-react";

export default function AdBanner() {
  const [ads, setAds] = useState([]);
  const [hidden, setHidden] = useState({});

  useEffect(() => {
    base44.entities.Advertisement.filter({ active: true })
      .then(setAds)
      .catch(() => {});
  }, []);

  const visible = ads.filter((a) => !hidden[a.id]);
  if (visible.length === 0) return null;
  const ad = visible[0];

  return (
    <div className="relative flex items-center gap-3 p-3 rounded-xl border border-sky-500/30 bg-sky-500/10">
      <Megaphone className="w-5 h-5 text-sky-400 shrink-0" />
      <div className="flex-1 min-w-0">
        {ad.title && <div className="font-medium text-sm">{ad.title}</div>}
        {ad.message && <div className="text-xs text-muted-foreground">{ad.message}</div>}
        {ad.link && /^https?:\/\//i.test(ad.link) && (
          <a href={ad.link} target="_blank" rel="noreferrer" className="text-xs text-sky-400 underline">
            Learn more
          </a>
        )}
      </div>
      {ad.image_url && (
        <Image src={ad.image_url} className="w-12 h-12 rounded-lg shrink-0" fittingType="fill" />
      )}
      <button
        type="button"
        onClick={() => setHidden((h) => ({ ...h, [ad.id]: true }))}
        className="absolute top-1 right-1 text-muted-foreground hover:text-foreground"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}