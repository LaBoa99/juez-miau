import { nextFreeLetter } from './letters.js';

describe('nextFreeLetter', () => {
  it('starts at A', () => expect(nextFreeLetter([])).toBe('A'));
  it('takes the next one', () => expect(nextFreeLetter(['A', 'B'])).toBe('C'));
  it('fills gaps first', () => expect(nextFreeLetter(['A', 'C'])).toBe('B'));
  it('goes to two letters after Z', () => expect(nextFreeLetter([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'])).toBe('AA'));
});
