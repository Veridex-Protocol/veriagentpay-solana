import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { NlpService } from './nlp.service';

@Controller('api/nlp')
export class NlpController {
  constructor(private readonly nlpService: NlpService) {}

  @Post()
  async parseIntent(@Body() body: { text: string }) {
    if (!body || typeof body.text !== 'string') {
      throw new BadRequestException('Property "text" is required');
    }

    const parsed = await this.nlpService.parseIntent(body.text);
    return parsed;
  }

  @Post('parse')
  async parseIntentAlias(@Body() body: { text: string }) {
    if (!body || typeof body.text !== 'string') {
      throw new BadRequestException('Property "text" is required');
    }

    const parsed = await this.nlpService.parseIntent(body.text);
    return parsed;
  }
}
