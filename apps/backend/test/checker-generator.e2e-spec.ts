import { CompareMode, TestCaseOrigin, TestsetStatus, Verdict } from '@concurso/shared-types';
import { Testset } from '../src/testsets/entities/testset.entity.js';
import { TestCase } from '../src/testsets/entities/test-case.entity.js';
import { ContestFixture, waitUntil } from './helpers/contest-fixture.js';

// Fase 6b: checker (varias respuestas válidas) y generador en código. Ejecuta en Docker
describe.skipIf(!process.env.JUDGE_DOCKER)('Checker y generador en código (e2e)', () => {
  const fixture = new ContestFixture();
  const signature = {
    functionName: 'twoSum',
    params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }, { name: 'target', type: { type: 'int' } }],
    returns: { type: 'array', items: { type: 'int' } },
  };
  // Cualquier par i < j con nums[i] + nums[j] == target es válido
  const checker = 'def check(nums, target, expectedOutput, actualOutput):\n'
    + '    if len(actualOutput) != 2:\n        return False\n'
    + '    i, j = actualOutput\n'
    + '    return 0 <= i < j < len(nums) and nums[i] + nums[j] == target\n';
  const ref = 'def twoSum(nums, target):\n'
    + '    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n'
    + '            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []\n';
  // En JavaScript: el seed (long) llega como bigint
  const generator = 'function generate(seed, group, index) {\n'
    + '  const n = group === "chicos" ? 5 : 40\n'
    + '  const nums = Array.from({ length: n }, (_, k) => (Number(seed) * 31 + k * 17 + index) % 100)\n'
    + '  return JSON.stringify({ nums, target: nums[0] + nums[n - 1] })\n'
    + '}\n';

  let problemId: number;
  let testsetId: number;

  const build = async () => {
    await fixture.api().post(`/api/v1/testsets/${testsetId}/build`).set(fixture.asAdmin()).expect(202);
    return waitUntil(async () => {
      const testset = await fixture.repo(Testset).findOneByOrFail({ id: testsetId });
      return testset.status === TestsetStatus.BUILDING ? undefined : testset;
    });
  };

  beforeAll(async () => {
    await fixture.start('Checker E2E');
    const created = await fixture.api().post(`/api/v1/editions/${fixture.edition.id}/problems`).set(fixture.asAdmin()).send({
      categoryId: fixture.category.id, title: 'Dos que suman', statement: 'Encuentra dos índices.', inputFormat: 'x', outputFormat: 'x',
    }).expect(201);
    ({ id: problemId, testsetId } = created.body);
    await fixture.api().patch(`/api/v1/problems/${problemId}/signature`).set(fixture.asAdmin()).send(signature).expect(200);
    await fixture.api().post(`/api/v1/testsets/${testsetId}/cases`).set(fixture.asAdmin())
      .send({ input: { nums: [1, 2, 3, 4], target: 5 }, visibility: 'public' }).expect(201);
    await fixture.api().put(`/api/v1/testsets/${testsetId}/ref-solution`).set(fixture.asAdmin())
      .send({ languageId: fixture.languages.python.id, source: ref }).expect(200);
  }, 120_000);

  afterAll(() => fixture.stop());

  it('compareMode checker exige un checker para construir', async () => {
    await fixture.api().patch(`/api/v1/testsets/${testsetId}`).set(fixture.asAdmin()).send({ compareMode: CompareMode.CHECKER }).expect(200);
    const res = await fixture.api().post(`/api/v1/testsets/${testsetId}/build`).set(fixture.asAdmin()).expect(422);
    expect(JSON.stringify(res.body)).toMatch(/has no checker/);
  });

  it('un checker que rechaza la salida oficial deja el build FAILED', async () => {
    await fixture.api().put(`/api/v1/testsets/${testsetId}/checker`).set(fixture.asAdmin())
      .send({ languageId: fixture.languages.python.id, source: 'def check(nums, target, expectedOutput, actualOutput):\n    return False\n' }).expect(200);
    const testset = await build();
    expect(testset.status).toBe(TestsetStatus.FAILED);
    expect(testset.build_log).toMatch(/checker rejects the reference output on case\(s\) #1/);
  }, 120_000);

  it('con el generador y el checker correcto queda READY con los casos generados', async () => {
    await fixture.api().put(`/api/v1/testsets/${testsetId}/checker`).set(fixture.asAdmin())
      .send({ languageId: fixture.languages.python.id, source: checker }).expect(200);
    await fixture.api().put(`/api/v1/testsets/${testsetId}/generator`).set(fixture.asAdmin()).send({
      languageId: fixture.languages.javascript.id, source: generator,
      groups: [{ name: 'chicos', seeds: [1, 2, 3] }, { name: 'grandes', seeds: [9] }],
    }).expect(200);

    const testset = await build();
    expect(testset.build_log).toMatch(/^built 5 cases/);
    expect(testset.status).toBe(TestsetStatus.READY);

    const cases = await fixture.repo(TestCase).find({ where: { testset_id: testsetId }, order: { ordinal: 'ASC' } });
    expect(cases.map((testCase) => [testCase.ordinal, testCase.origin, testCase.group_name, testCase.seed])).toEqual([
      [1, TestCaseOrigin.MANUAL, null, null],
      [2, TestCaseOrigin.GENERATOR, 'chicos', 1],
      [3, TestCaseOrigin.GENERATOR, 'chicos', 2],
      [4, TestCaseOrigin.GENERATOR, 'chicos', 3],
      [5, TestCaseOrigin.GENERATOR, 'grandes', 9],
    ]);

    await fixture.api().post(`/api/v1/problems/${problemId}/accept`).set(fixture.asAdmin()).expect(200);
    await fixture.run();
  }, 180_000);

  it('el checker acepta otro par válido y rechaza uno inválido', async () => {
    // Busca desde el final: en [1,2,3,4] con 5 regresa [1,2] en vez de [0,3]
    const other = 'def twoSum(nums, target):\n'
      + '    for j in range(len(nums) - 1, -1, -1):\n        for i in range(j - 1, -1, -1):\n'
      + '            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []\n';
    expect((await fixture.submitAndWait(problemId, 'python', other)).verdict).toBe(Verdict.AC);

    const reversed = 'def twoSum(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n'
      + '            if nums[i] + nums[j] == target:\n                return [j, i]\n    return []\n';
    const wa = await fixture.submitAndWait(problemId, 'python', reversed);
    expect(wa.verdict).toBe(Verdict.WA);
    const detail = await fixture.api().get(`/api/v1/submissions/${wa.id}`).set(fixture.asAdmin()).expect(200);
    expect(detail.body.cases[0]).toMatchObject({ verdict: Verdict.WA, message: 'rejected by the checker' });
  }, 180_000);
});
