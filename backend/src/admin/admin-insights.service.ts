import { Injectable, Logger } from '@nestjs/common';
import { AdminMetricsService } from './admin-metrics.service';

@Injectable()
export class AdminInsightsService {
  private readonly logger = new Logger(AdminInsightsService.name);
  private cachedReport: { generatedAt: string; reportMarkdown: string } | null = null;

  constructor(private readonly metricsService: AdminMetricsService) {}

  async generateExecutiveReport(forceRefresh = false) {
    if (!forceRefresh && this.cachedReport) {
      return this.cachedReport;
    }

    const overview = await this.metricsService.getOverviewMetrics();
    const virality = await this.metricsService.getViralityMetrics();
    const financials = await this.metricsService.getFinancialMetrics();
    const notifications = await this.metricsService.getNotificationMetrics();

    const nowStr = new Date().toISOString();

    const reportMarkdown = `# 🤖 VeriAgent Pay AI Executive Growth & Performance Report
*Generated on ${nowStr} by @veridex/agents AI Insights Engine*

---

## 🚀 1. What’s Working Exceptionally Well
- **Total Registered Users:** **${overview.totalUsers.toLocaleString()}** active identity profiles onboarded.
- **Daily Active Wallets (24h):** **${overview.dailyActiveWallets.toLocaleString()}** wallets actively executing transactions.
- **Total Value Locked (TVL):** **$${overview.totalValueLockedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** locked across zkTLS yield vaults & group pools.
- **Viral Coefficient (K = ${virality.viralCoefficientK}):** Driven by referral streaks and red envelope drops.
- **P2P Lending Health (${financials.lendingPools.onTimeRepaymentRate}% On-Time Repayment):** Reputations scores maintaining low default rates (${financials.lendingPools.defaultRate}%).

---

## ⚠️ 2. Live Feature Adoption & Performance
- **Yield Vault Adoption:** **${financials.featureAdoption.yieldVaultsPct}%** of active volume.
- **Red Envelopes Conversion:** **${virality.redEnvelopeConversionRate}%** claim completion rate.
- **Group Bill Splits Adoption:** **${financials.featureAdoption.groupSplitsPct}%** of P2P volume.
- **Group Lending Pools Adoption:** **${financials.featureAdoption.groupPoolsPct}%** of social pool liquidity.

---

## 💡 3. Growth Campaign Recommendations
1. **Launch "Double Referral Weekend":** Boost referral reward points to accelerate viral coefficient above 1.8.
2. **Featured Yield Vault Promotion:** Highlight verified zkTLS APY vaults on social channels to attract new liquidity.

---

## 🧪 4. Notification & Engagement Optimization
- **Active Notifications (24h):** ${notifications.totalSent24h.toLocaleString()} cross-platform notifications delivered with a ${notifications.overallCtrPct}% CTR.
`;

    this.cachedReport = {
      generatedAt: nowStr,
      reportMarkdown,
    };

    return this.cachedReport;
  }
}
