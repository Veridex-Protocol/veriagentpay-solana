import { DiscordBotDriver } from './discord-bot';

/**
 * Discord delivers slash-command options as a named, unordered list, and USER
 * options carry a raw snowflake. These tests pin the canonical text form the
 * shared command parser expects.
 */
describe('DiscordBotDriver.buildCommandText', () => {
  it('places the token before the recipient for /pay', () => {
    const text = DiscordBotDriver.buildCommandText({
      name: 'pay',
      options: [
        { name: 'amount', value: 50 },
        { name: 'user', value: '123456789012345678' },
        { name: 'token', value: 'USDT' },
      ],
    });

    expect(text).toBe('/pay 50 USDT @123456789012345678');
  });

  it('defaults the token to USDC when the option is omitted', () => {
    const text = DiscordBotDriver.buildCommandText({
      name: 'pay',
      options: [
        { name: 'amount', value: 25 },
        { name: 'user', value: 'alice' },
      ],
    });

    expect(text).toBe('/pay 25 USDC @alice');
  });

  it('is insensitive to the order Discord sends options in', () => {
    const text = DiscordBotDriver.buildCommandText({
      name: 'pay',
      options: [
        { name: 'token', value: 'BOT' },
        { name: 'user', value: 'bob' },
        { name: 'amount', value: 10 },
      ],
    });

    expect(text).toBe('/pay 10 BOT @bob');
  });

  it('does not double-prefix an already-mentioned user', () => {
    const text = DiscordBotDriver.buildCommandText({
      name: 'pay',
      options: [
        { name: 'amount', value: 5 },
        { name: 'user', value: '<@987654321>' },
      ],
    });

    expect(text).toBe('/pay 5 USDC <@987654321>');
  });

  it('builds /envelope as amount then slots', () => {
    const text = DiscordBotDriver.buildCommandText({
      name: 'envelope',
      options: [
        { name: 'slots', value: 5 },
        { name: 'amount', value: 50 },
      ],
    });

    expect(text).toBe('/envelope 50 5');
  });

  it('mentions every participant in /split', () => {
    const text = DiscordBotDriver.buildCommandText({
      name: 'split',
      options: [
        { name: 'amount', value: 120 },
        { name: 'users', value: 'bob, charlie' },
      ],
    });

    expect(text).toBe('/split 120 @bob @charlie');
  });

  it('passes through commands that take no options', () => {
    expect(DiscordBotDriver.buildCommandText({ name: 'balance' })).toBe('/balance');
  });

  it('returns an empty string for a malformed interaction', () => {
    expect(DiscordBotDriver.buildCommandText({})).toBe('');
  });
});
