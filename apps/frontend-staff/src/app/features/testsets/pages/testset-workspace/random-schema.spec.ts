import { ITestsetSchema, TypeRef } from '@concurso/shared-types';
import { groupsToSchema, schemaToGroups } from './random-schema';

const params: { name: string; type: TypeRef }[] = [
  { name: 'n', type: { type: 'int' } },
  { name: 'nums', type: { type: 'array', items: { type: 'long' } } },
];

describe('random-schema', () => {
  it('builds a schema with consecutive seeds across groups', () => {
    const groups = schemaToGroups(null, params);
    groups.push({ ...structuredClone(groups[0]), name: 'grandes', count: '2' });
    const { schema, errors, total } = groupsToSchema(groups, ['n', 'nums']);
    expect(errors).toEqual([]);
    expect(total).toBe(7);
    expect(schema.groups.map((g) => g.seeds)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    expect(schema.params['nums']).toEqual({ type: 'array', length: [1, 10], items: { type: 'long', min: 1, max: 100 } });
  });

  it('round-trips an existing schema with overrides', () => {
    const schema: ITestsetSchema = {
      params: { n: { type: 'int', min: 1, max: 5 }, nums: { type: 'array', length: [1, 3], items: { type: 'long', min: 0, max: 9 } } },
      groups: [{ name: 'g', seeds: [4, 9], overrides: { n: { max: 7 }, nums: { items: { max: '9999999999999999' } } } }],
    };
    const [g] = schemaToGroups(schema, params);
    expect(g.count).toBe('2');
    expect(g.params['n']).toEqual({ type: 'int', min: '1', max: '7' });
    const back = groupsToSchema([g], ['n', 'nums']).schema;
    expect(back.groups[0].overrides!['nums']).toMatchObject({ items: { min: 0, max: '9999999999999999' } });
  });

  it('reports min > max and empty group names', () => {
    const [g] = schemaToGroups(null, params);
    (g.params['n'] as { min: string }).min = '500';
    g.name = '';
    expect(groupsToSchema([g], ['n', 'nums']).errors).toEqual([
      'Cada grupo necesita un nombre.',
      'Grupo "1", n: el mínimo no puede ser mayor que el máximo.',
    ]);
  });
});
