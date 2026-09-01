import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://veriagentpay.xyz';
  const currentDate = new Date();

  const routes: Array<{
    path: string;
    priority: number;
    changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  }> = [
    { path: '', priority: 1.0, changeFrequency: 'daily' },
    { path: '/dashboard', priority: 0.9, changeFrequency: 'daily' },
    { path: '/vaults', priority: 0.85, changeFrequency: 'daily' },
    { path: '/save-yield', priority: 0.85, changeFrequency: 'daily' },
    { path: '/pools', priority: 0.8, changeFrequency: 'daily' },
    { path: '/splits', priority: 0.8, changeFrequency: 'daily' },
    { path: '/envelopes', priority: 0.8, changeFrequency: 'daily' },
    { path: '/send', priority: 0.8, changeFrequency: 'daily' },
    { path: '/pay', priority: 0.8, changeFrequency: 'daily' },
    { path: '/requests', priority: 0.75, changeFrequency: 'daily' },
    { path: '/subscriptions', priority: 0.75, changeFrequency: 'weekly' },
    { path: '/invite', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/referral', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/leaderboard', priority: 0.7, changeFrequency: 'hourly' },
    { path: '/tokens', priority: 0.65, changeFrequency: 'daily' },
    { path: '/badges', priority: 0.65, changeFrequency: 'weekly' },
    { path: '/airdrop', priority: 0.65, changeFrequency: 'weekly' },
    { path: '/ambassador', priority: 0.65, changeFrequency: 'weekly' },
    { path: '/activity', priority: 0.6, changeFrequency: 'daily' },
    { path: '/privacy', priority: 0.5, changeFrequency: 'monthly' },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: currentDate,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
