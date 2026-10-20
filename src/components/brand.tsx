import Link from "next/link";

/** Kickback wordmark: the reward punch replaces the dot on the i. */
export function Wordmark({
  size = 22,
  inverse = false,
  className = "",
}: {
  size?: number;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Kickback"
      className={`wordmark${inverse ? " wordmark-inverse" : ""} ${className}`}
      style={{ fontSize: size }}
    >
      <span aria-hidden="true">K</span>
      <span aria-hidden="true" className="wordmark-i">
        {"ı"}
        <span className="wordmark-dot" />
      </span>
      <span aria-hidden="true">ckback</span>
    </span>
  );
}

/** App icon: forest tile, white K, mint coin as the K's leg. 96-unit grid. */
export function KickbackIcon({
  size = 40,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  if (size < 24) return <KickbackFavicon size={size} label={label} className={className} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="96" height="96" rx="22" fill="#0B5D45" />
      <rect x="23" y="20" width="14" height="56" rx="2" fill="#FFFFFF" />
      <polygon points="35,46.5 56.2,20 72.2,20 35,66.5" fill="#FFFFFF" />
      <circle cx="60" cy="63" r="13" fill="#3DCB97" />
    </svg>
  );
}

/** Favicon cut for sizes under 24 px: heavier stem, larger coin. */
export function KickbackFavicon({
  size = 16,
  label,
  className,
}: {
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <rect width="32" height="32" rx="7" fill="#0B5D45" />
      <rect x="7.5" y="6.5" width="5" height="19" rx="0.8" fill="#FFFFFF" />
      <polygon points="11.5,15.7 18.8,6.5 24.2,6.5 11.5,22.4" fill="#FFFFFF" />
      <circle cx="20" cy="21" r="4.5" fill="#3DCB97" />
    </svg>
  );
}

/** Wordmark that links home, optionally with the tile. */
export function BrandLink({
  href = "/",
  size = 22,
  withIcon = false,
  inverse = false,
}: {
  href?: string;
  size?: number;
  withIcon?: boolean;
  inverse?: boolean;
}) {
  return (
    <Link href={href} className="brand-link" aria-label="Kickback home">
      {withIcon && <KickbackIcon size={Math.round(size * 1.3)} />}
      <Wordmark size={size} inverse={inverse} />
    </Link>
  );
}

/** "Rewards by Kickback" endorsement line used on customer-facing pages. */
export function Endorsement({
  inverse = false,
  size = 14,
  withIcon = false,
}: {
  inverse?: boolean;
  size?: number;
  withIcon?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ fontSize: Math.max(12, size - 2), fontWeight: 600 }}
    >
      {withIcon && <KickbackFavicon size={18} />}
      <span>Rewards by</span>
      <Wordmark size={size} inverse={inverse} />
    </span>
  );
}
