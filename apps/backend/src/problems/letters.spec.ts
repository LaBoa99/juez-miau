import { letterAt } from './letters.js';

describe('letterAt', () => {
  it('starts at A', () => expect(letterAt(0)).toBe('A'));
  it('goes to two letters after Z', () => expect(letterAt(26)).toBe('AA'));
  it('fails past ZZ', () => expect(() => letterAt(26 + 26 * 26)).toThrow());
});
