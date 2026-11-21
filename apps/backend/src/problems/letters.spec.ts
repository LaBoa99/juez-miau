import { letterAt, nextLetter } from './letters.js';

describe('letterAt', () => {
  it('starts at A', () => expect(letterAt(0)).toBe('A'));
  it('goes to two letters after Z', () => expect(letterAt(26)).toBe('AA'));
  it('fails past ZZ', () => expect(() => letterAt(26 + 26 * 26)).toThrow());
});

describe('nextLetter', () => {
  it('follows the last used letter, not the count', () => expect(nextLetter(['A', 'C'])).toBe('D'));
  it('starts at A in an empty category', () => expect(nextLetter([])).toBe('A'));
  it('goes past Z', () => expect(nextLetter(['Z'])).toBe('AA'));
});
