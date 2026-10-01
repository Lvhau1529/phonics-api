import { expect, it } from 'vitest';
import { CONTRACTS_VERSION } from './index';

it('có phiên bản hợp đồng', () => {
  expect(CONTRACTS_VERSION).toBeGreaterThanOrEqual(1);
});
