import { ShortLinksService } from './shortlinks.service';

describe('ShortLinksService', () => {
  let service: ShortLinksService;

  beforeEach(() => {
    service = new ShortLinksService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
