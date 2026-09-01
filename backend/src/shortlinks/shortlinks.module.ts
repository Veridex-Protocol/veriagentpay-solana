import { Module } from '@nestjs/common';
import { ShortLinksService } from './shortlinks.service';
import { ShortLinksController } from './shortlinks.controller';

@Module({
  controllers: [ShortLinksController],
  providers: [ShortLinksService],
  exports: [ShortLinksService],
})
export class ShortLinksModule {}
