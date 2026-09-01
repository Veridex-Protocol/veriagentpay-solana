import { FiatRampService } from './fiat-ramp.service';

describe('FiatRampService', () => {
  let service: FiatRampService;

  beforeEach(() => {
    service = new FiatRampService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
