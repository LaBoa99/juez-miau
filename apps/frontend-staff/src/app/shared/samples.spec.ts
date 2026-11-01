import { formatCaseInput } from './samples';

describe('formatCaseInput', () => {
  it('one parameter per line', () => {
    expect(formatCaseInput('{"nums":[2,7,11,15],"target":9}')).toBe('nums = [2,7,11,15]\ntarget = 9');
  });
  it('keeps strings with commas and big longs intact', () => {
    expect(formatCaseInput('{"s":"a,b}\\"c","n":123456789012345678901}')).toBe('s = "a,b}\\"c"\nn = 123456789012345678901');
  });
  it('nested arrays', () => {
    expect(formatCaseInput('{"m":[[1,2],[3]]}')).toBe('m = [[1,2],[3]]');
  });
  it('returns non-objects unchanged', () => {
    expect(formatCaseInput('42')).toBe('42');
  });
});
