import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createAgent, GeminiProvider } from '@veridex/agents';
import { AdminUsersService } from './admin-users.service';

const CACHE_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class UserInsightsService {
  private readonly logger = new Logger(UserInsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: AdminUsersService,
  ) {}

  async generate(userId: string, forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await this.prisma.userInsightCache.findUnique({ where: { userId } });
      if (cached && cached.expiresAt > new Date()) {
        return {
          generatedAt: cached.generatedAt,
          expiresAt: cached.expiresAt,
          cached: true,
          reportMarkdown: cached.reportMarkdown,
        };
      }
    }

    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('Gemini API key is not configured');
    }

    const userDetail = await this.usersService.getUserDetail(userId);
    const agent = createAgent(
      {
        id: 'veriagent-pay-user-insights',
        name: 'VeriAgent Pay User Insights',
        model: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0.2 },
        instructions: [
          'You are a financial behavior analyst supporting VeriAgent Pay administrators.',
          'Analyze only the supplied user profile, metrics, and activity. Never invent events or infer protected characteristics.',
          'Return concise Markdown with these headings: Executive Summary, Spending Patterns, Saving Habits, Risk Flags, Engagement Actions.',
          'Distinguish observed facts from cautious interpretations. Include concrete amounts or frequencies when available.',
          'Risk flags are operational signals for manual review, not accusations. Suggest at most four personalized admin actions.',
        ].join(' '),
        maxTurns: 1,
        maxTokens: 6000,
      },
      { modelProviders: { gemini: new GeminiProvider({ apiKey }) } },
    );

    const boundedContext = {
      user: userDetail.user,
      stats: userDetail.stats,
      recentActivity: userDetail.activity.slice(0, 60),
    };

    try {
      const result = await agent.run(`Analyze this VeriAgent Pay user:\n${JSON.stringify(boundedContext, null, 2)}`);
      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + CACHE_TTL_MS);

      await this.prisma.userInsightCache.upsert({
        where: { userId },
        create: { userId, reportMarkdown: result.output, generatedAt, expiresAt },
        update: { reportMarkdown: result.output, generatedAt, expiresAt },
      });

      return { generatedAt, expiresAt, cached: false, reportMarkdown: result.output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`User insight generation failed for ${userId}: ${message}`);
      throw new ServiceUnavailableException('AI insight generation is temporarily unavailable');
    }
  }
}
