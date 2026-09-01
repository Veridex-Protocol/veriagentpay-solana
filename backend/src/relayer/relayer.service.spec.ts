import { RelayerService } from './relayer.service';

describe('RelayerService', () => {
  let service: RelayerService;

  beforeEach(() => {
    service = new RelayerService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
