import { EVENT_MAX_AGE_MS, type GameEventInput } from '@phonics/contracts';
import { describe, expect, it } from 'vitest';
import { EVENT_MAX_FUTURE_MS, prepareEvents, truncateToSecond } from './events.service';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const KNOWN = new Set(['bread-catcher', 'food-stream']);
const NOW = Date.parse('2026-10-01T08:30:00.000Z');

const ev = (overrides: Partial<GameEventInput> = {}): GameEventInput => ({
  gameId: 'bread-catcher',
  type: 'VIEW',
  occurredAt: new Date(NOW - 5_000).toISOString(),
  ...overrides,
});

describe('truncateToSecond', () => {
  it('bỏ phần mili-giây', () => {
    expect(truncateToSecond('2026-10-01T08:30:00.999Z').toISOString()).toBe('2026-10-01T08:30:00.000Z');
    expect(truncateToSecond(NOW + 1).getTime()).toBe(NOW);
  });
});

describe('prepareEvents', () => {
  it('làm tròn occurredAt xuống giây và gắn userId / clientId / mode', () => {
    const { rows, valid } = prepareEvents(
      {
        clientId: CLIENT_ID,
        events: [ev({ occurredAt: '2026-10-01T08:29:55.730Z', type: 'PLAY', mode: 'class' })],
      },
      KNOWN,
      'user-1',
      NOW,
    );
    expect(valid).toBe(1);
    expect(rows).toEqual([
      {
        gameId: 'bread-catcher',
        type: 'PLAY',
        userId: 'user-1',
        clientId: CLIENT_ID,
        mode: 'class',
        occurredAt: new Date('2026-10-01T08:29:55.000Z'),
      },
    ]);
  });

  it('mode thiếu → null, không đăng nhập → userId null', () => {
    const { rows } = prepareEvents({ clientId: CLIENT_ID, events: [ev()] }, KNOWN, null, NOW);
    expect(rows[0].mode).toBeNull();
    expect(rows[0].userId).toBeNull();
  });

  it('bỏ sự kiện quá cũ hoặc quá xa trong tương lai (không tính vào valid)', () => {
    const stale = new Date(NOW - EVENT_MAX_AGE_MS - 1_000).toISOString();
    const edgeOld = new Date(NOW - EVENT_MAX_AGE_MS).toISOString();
    const future = new Date(NOW + EVENT_MAX_FUTURE_MS + 1_000).toISOString();
    const edgeFuture = new Date(NOW + EVENT_MAX_FUTURE_MS).toISOString();
    const { rows, valid } = prepareEvents(
      {
        clientId: CLIENT_ID,
        events: [
          ev({ occurredAt: stale }),
          ev({ occurredAt: edgeOld }),
          ev({ occurredAt: future }),
          ev({ occurredAt: edgeFuture }),
        ],
      },
      KNOWN,
      null,
      NOW,
    );
    expect(valid).toBe(2);
    expect(rows.map((r) => r.occurredAt.toISOString())).toEqual([edgeOld, edgeFuture]);
  });

  it('bỏ gameId không có trong catalog', () => {
    const { rows, valid } = prepareEvents(
      { clientId: CLIENT_ID, events: [ev({ gameId: 'nope' as GameEventInput['gameId'] }), ev()] },
      KNOWN,
      null,
      NOW,
    );
    expect(valid).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it('trùng trong cùng lô (cùng giây sau khi làm tròn) → giữ dòng đầu, vẫn đếm vào valid', () => {
    const { rows, valid } = prepareEvents(
      {
        clientId: CLIENT_ID,
        events: [
          ev({ occurredAt: '2026-10-01T08:29:50.100Z' }),
          ev({ occurredAt: '2026-10-01T08:29:50.900Z' }),
          ev({ occurredAt: '2026-10-01T08:29:50.500Z', type: 'PLAY' }),
          ev({ occurredAt: '2026-10-01T08:29:50.500Z', gameId: 'food-stream' }),
        ],
      },
      KNOWN,
      null,
      NOW,
    );
    expect(valid).toBe(4);
    expect(rows).toHaveLength(3);
  });
});
