import Image from 'next/image';

const LOGO_ROOT = '/veriagent_logos';

const markAssets = {
  emblem: `${LOGO_ROOT}/VeriAgent%20Volt%20Yellow.svg`,
  squircle: `${LOGO_ROOT}/veriagent-yellow-black.svg`,
} as const;

const wordmarkAssets = {
  carbon: `${LOGO_ROOT}/VeriAgent%20Wide%20Carbon.svg`,
  crisp: `${LOGO_ROOT}/VeriAgent%20Wide%20Crisp.svg`,
  volt: `${LOGO_ROOT}/VeriAgent%20Wide%20Volt%20Yellow.svg`,
} as const;

export function OfficialLogoMark({
  size,
  withSquircle = true,
  className,
  alt = '',
}: {
  size: number;
  withSquircle?: boolean;
  className?: string;
  alt?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className || ''}`}
      style={{ width: size, height: size }}
    >
      <Image
        alt={alt}
        height={size}
        src={withSquircle ? markAssets.squircle : markAssets.emblem}
        unoptimized
        width={size}
      />
    </span>
  );
}

export function OfficialWordmark({
  width = 184,
  tone = 'volt',
  className,
  alt = 'VeriAgent Pay',
}: {
  width?: number;
  tone?: keyof typeof wordmarkAssets;
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      alt={alt}
      className={className}
      height={Math.max(1, Math.round((width * 162) / 1890))}
      src={wordmarkAssets[tone]}
      unoptimized
      width={width}
    />
  );
}