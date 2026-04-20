import React, { useEffect } from 'react';

interface AdSenseProps {
  adSlot: string;
  adClient?: string;
  style?: React.CSSProperties;
  format?: 'auto' | 'fluid' | 'rectangle';
}

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

export default function AdSense({ adSlot, adClient = "ca-pub-XXXXXXXXXXXXXXXX", style = { display: 'block' }, format = 'auto' }: AdSenseProps) {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense error:", e);
    }
  }, []);

  return (
    <div className="my-6 overflow-hidden flex justify-center">
      <ins 
        className="adsbygoogle"
        style={style}
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
