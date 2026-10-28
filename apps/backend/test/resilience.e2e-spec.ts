import { Verdict, type IStandings, type ISubmissionHistoryEntry, type IStaffSubmission } from '@concurso/shared-types';
import { Testset } from '../src/testsets/entities/testset.entity.js';
import { ContestFixture } from './helpers/contest-fixture.js';

// Fase 6: rejudge (automático y manual), confirmación de TLE y revisión manual. Ejecuta en Docker
describe.skipIf(!process.env.JUDGE_DOCKER)('Resiliencia del juez: rejudge, TLE y revisión manual (e2e)', () => {
  const fixture = new ContestFixture();
  const signature = {
    functionName: 'contar',
    params: [{ name: 'nums', type: { type: 'array', items: { type: 'int' } } }],
    returns: { type: 'int' },
  };
  // La v1 tiene un error: con el array vacío regresa 1. El equipo, con la solución correcta, recibe WA
  const buggyRef = { language: 'python', source: 'def contar(nums):\n    return len(nums) or 1\n' };
  const fixedRef = { language: 'python', source: 'def contar(nums):\n    return len(nums)\n' };
  const correct = 'def contar(nums):\n    return len(nums)\n';

  let problemId: number;
  let testsetId: number;
  let submissionId: number;

  beforeAll(async () => {
    await fixture.start('Resilience E2E');
    ({ problemId, testsetId } = await fixture.publishProblem({
      letter: 'A', signature, ref: buggyRef, cases: [{ input: { nums: [1, 2] } }, { input: { nums: [] }, visibility: 'hidden' }],
    }));
    await fixture.run();
  }, 180_000);

  afterAll(() => fixture.stop());

  it('una solución correcta recibe WA por el caso mal construido', async () => {
    const submission = await fixture.submitAndWait(problemId, 'python', correct);
    expect(submission.verdict).toBe(Verdict.WA);
    submissionId = submission.id;
  }, 120_000);

  it('al construir la v2 corregida, el envío se re-juzga solo y queda en AC con historial', async () => {
    const v2 = await fixture.api().post(`/api/v1/problems/${problemId}/testsets`).set(fixture.asAdmin())
      .send({ reason: 'el caso vacío estaba mal' }).expect(201);
    await fixture.buildTestset(v2.body.id, fixedRef);

    const rejudged = await fixture.waitJudged(submissionId, 1);
    expect(rejudged.verdict).toBe(Verdict.AC);

    const staff = (await fixture.api().get(`/api/v1/submissions/${submissionId}`).set(fixture.asAdmin()).expect(200)).body as IStaffSubmission;
    expect(staff).toMatchObject({ judgeRound: 1, testsetId: v2.body.id });

    const history = (await fixture.api().get(`/api/v1/submissions/${submissionId}/history`).set(fixture.asAdmin()).expect(200)).body as ISubmissionHistoryEntry[];
    expect(history).toEqual([expect.objectContaining({
      judgeRound: 0, testsetId, verdict: Verdict.WA, rejudgedBy: null, reason: 'testset v2 built: el caso vacío estaba mal',
    })]);
    await fixture.api().get(`/api/v1/submissions/${submissionId}/history`).set(fixture.asTeam()).expect(403);

    const standings = (await fixture.api().get(`/api/v1/editions/${fixture.edition.id}/standings`).set(fixture.asAdmin()).expect(200)).body as IStandings;
    expect(standings.categories[0].rows[0]).toMatchObject({ solved: 1 });
  }, 180_000);

  it('rejudge manual por envío y por problema, solo para jueces y admins', async () => {
    await fixture.api().post(`/api/v1/submissions/${submissionId}/rejudge`).set(fixture.asTeam()).send({ reason: 'x' }).expect(403);
    await fixture.api().post(`/api/v1/submissions/${submissionId}/rejudge`).set(fixture.asAdmin()).send({}).expect(400);

    const single = await fixture.api().post(`/api/v1/submissions/${submissionId}/rejudge`).set(fixture.asAdmin())
      .send({ reason: 'revisión' }).expect(202);
    expect(single.body).toEqual({ submissionIds: [submissionId] });
    expect((await fixture.waitJudged(submissionId, 2)).verdict).toBe(Verdict.AC);

    // Filtrado por veredicto: no hay WA, no se re-juzga nada
    const none = await fixture.api().post(`/api/v1/problems/${problemId}/rejudge`).set(fixture.asAdmin())
      .send({ reason: 'solo WA', verdicts: [Verdict.WA] }).expect(202);
    expect(none.body).toEqual({ submissionIds: [] });
  }, 120_000);

  it('un ciclo infinito da TLE (confirmado con el servidor reservado)', async () => {
    const submission = await fixture.submitAndWait(problemId, 'python', 'def contar(nums):\n    while True:\n        pass\n');
    expect(submission.verdict).toBe(Verdict.TLE);
  }, 120_000);

  it('con revisión manual el AC espera al juez; rechazarlo cuenta como WA y el equipo ve el comentario', async () => {
    const { problemId: reviewed, testsetId: reviewedTestset } = await fixture.publishProblem({
      letter: 'B', signature, ref: fixedRef, cases: [{ input: { nums: [3] } }],
      testset: { manualReview: true, reviewInstructions: 'No usar len()' },
    });
    expect((await fixture.repo(Testset).findOneByOrFail({ id: reviewedTestset })).manual_review).toBe(true);

    const submission = await fixture.submitAndWait(reviewed, 'python', correct);
    expect(submission.verdict).toBe(Verdict.PENDING_REVIEW);

    const queue = (await fixture.api().get(`/api/v1/editions/${fixture.edition.id}/review-queue`).set(fixture.asAdmin()).expect(200)).body as IStaffSubmission[];
    expect(queue.map((entry) => entry.id)).toEqual([submission.id]);

    const pending = (await fixture.api().get(`/api/v1/editions/${fixture.edition.id}/standings`).set(fixture.asAdmin()).expect(200)).body as IStandings;
    expect(pending.categories[0].rows[0].cells.find((cell) => cell.problemId === reviewed)).toMatchObject({ solved: false, pending: 1 });

    const res = await fixture.api().post(`/api/v1/submissions/${submission.id}/review`).set(fixture.asAdmin())
      .send({ accept: false, comment: 'Usaste len()' }).expect(200);
    expect(res.body).toMatchObject({ verdict: Verdict.WA, reviewedBy: fixture.admin.id, reviewComment: 'Usaste len()' });
    await fixture.api().post(`/api/v1/submissions/${submission.id}/review`).set(fixture.asAdmin()).send({ accept: true }).expect(409);

    const teamView = await fixture.api().get(`/api/v1/submissions/${submission.id}`).set(fixture.asTeam()).expect(200);
    expect(teamView.body).toMatchObject({ verdict: Verdict.WA, reviewComment: 'Usaste len()' });
    expect((await fixture.api().get(`/api/v1/editions/${fixture.edition.id}/review-queue`).set(fixture.asAdmin()).expect(200)).body).toEqual([]);
  }, 180_000);
});
