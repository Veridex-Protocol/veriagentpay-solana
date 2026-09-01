import { NlpService } from './nlp.service';

describe('NlpService', () => {
  let service: NlpService;

  beforeEach(() => {
    service = new NlpService();
  });

  it('should parse natural language send command with USDT', async () => {
    const result = await service.parseIntent('send 50 USDT to @bob');
    expect(result.intent).toBe('send');
    expect(result.params.amount).toBe(50);
    expect(result.params.token).toBe('USDT');
    expect(result.params.recipient).toBe('@bob');
  });

  it('should parse request intent with USDC', async () => {
    const result = await service.parseIntent('request 25 USDC from @alice');
    expect(result.intent).toBe('request');
    expect(result.params.amount).toBe(25);
  });

  it('should parse split intent', async () => {
    const result = await service.parseIntent('split $100 bill with @charlie and @david');
    expect(result.intent).toBe('split');
    expect(result.params.amount).toBe(100);
  });

  it('should parse subscribe intent', async () => {
    const result = await service.parseIntent('subscribe 30 USDC monthly to @landlord');
    expect(result.intent).toBe('subscribe');
    expect(result.params.amount).toBe(30);
  });

  it('should parse envelope intent', async () => {
    const result = await service.parseIntent('create red envelope with 50 USDC for 5 recipients');
    expect(result.intent).toBe('envelope');
    expect(result.params.amount).toBe(50);
  });

  it('should parse save vault intent', async () => {
    const result = await service.parseIntent('deposit 100 USDC into yield vault');
    expect(result.intent).toBe('save');
    expect(result.params.amount).toBe(100);
  });

  it('should parse wallet info intent', async () => {
    const result = await service.parseIntent('show my wallet address');
    expect(result.intent).toBe('wallet');
  });

  it('should parse balance intent', async () => {
    const result = await service.parseIntent('check my funds and balance');
    expect(result.intent).toBe('balance');
  });

  it('should parse contacts intent', async () => {
    const result = await service.parseIntent('show my frequent payees and contacts');
    expect(result.intent).toBe('contacts');
  });

  it('should parse leaderboard intent', async () => {
    const result = await service.parseIntent('show top referrers on leaderboard');
    expect(result.intent).toBe('leaderboard');
  });

  it('should parse badges intent', async () => {
    const result = await service.parseIntent('show my unlocked badges');
    expect(result.intent).toBe('badges');
  });

  it('should parse referral invite intent', async () => {
    const result = await service.parseIntent('get my invite link and referral code');
    expect(result.intent).toBe('referral');
  });

  it('should parse user stats intent', async () => {
    const result = await service.parseIntent('show my account stats');
    expect(result.intent).toBe('stats');
  });
});
