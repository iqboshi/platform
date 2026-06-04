export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8010/api/v1';

export const isPortfolioDemo = import.meta.env.VITE_PORTFOLIO_DEMO === 'true';

function normalizeRouterBasename(value: string | undefined): string | undefined {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return undefined;
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

export const appRouterBasename = normalizeRouterBasename(
  import.meta.env.VITE_ROUTER_BASENAME ?? import.meta.env.BASE_URL,
);

export function resolvePublicAssetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}
