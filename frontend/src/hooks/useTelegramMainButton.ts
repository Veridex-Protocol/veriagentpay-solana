import { useEffect } from 'react';
import { useTelegram } from './useTelegram';

export function useTelegramMainButton(text: string, onClick: () => void, isVisible = true) {
  const { tg } = useTelegram();

  useEffect(() => {
    if (!tg?.MainButton) return;

    if (isVisible && text) {
      tg.MainButton.setText(text);
      tg.MainButton.onClick(onClick);
      tg.MainButton.show();
    } else {
      tg.MainButton.hide();
    }

    return () => {
      if (tg?.MainButton) {
        tg.MainButton.offClick(onClick);
        tg.MainButton.hide();
      }
    };
  }, [tg, text, onClick, isVisible]);
}
