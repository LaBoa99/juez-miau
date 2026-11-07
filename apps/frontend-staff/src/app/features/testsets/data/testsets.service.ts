import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ICreateTestCase,
  ICreateTestCases,
  ICreateTestRun,
  IGeneratorTemplate,
  ITestRun,
  ICreateTestsetVersion,
  IDetectSignature,
  IGenerateTestset,
  ISignatureDetection,
  IGenerateTestsetResponse,
  IUpdateCasesVisibility,
  IProblemSource,
  IProblemTestset,
  ISetChecker,
  ISetGenerator,
  ISetRefSolution,
  ITestCase,
  ITestCaseContent,
  ITestsetDetail,
  ITestsetSummary,
  IUpdateTestCase,
  IUpdateTestset,
} from '@concurso/shared-types';
import { Observable } from 'rxjs';

const API = '/api';

@Injectable({ providedIn: 'root' })
export class TestsetsService {
  private readonly http = inject(HttpClient);

  get(id: number): Observable<ITestsetDetail> {
    return this.http.get<ITestsetDetail>(`${API}/testsets/${id}`);
  }

  update(id: number, dto: IUpdateTestset): Observable<IProblemTestset> {
    return this.http.patch<IProblemTestset>(`${API}/testsets/${id}`, dto);
  }

  build(id: number): Observable<ITestsetSummary> {
    return this.http.post<ITestsetSummary>(`${API}/testsets/${id}/build`, {});
  }

  createVersion(problemId: number, dto: ICreateTestsetVersion): Observable<ITestsetSummary> {
    return this.http.post<ITestsetSummary>(`${API}/problems/${problemId}/testsets`, dto);
  }

  // Con `schema` lo guarda y genera en una sola transacción (conserva la visibilidad por grupo y semilla)
  generate(id: number, dto: IGenerateTestset = {}): Observable<IGenerateTestsetResponse> {
    return this.http.post<IGenerateTestsetResponse>(`${API}/testsets/${id}/generate`, dto);
  }

  setRefSolution(id: number, dto: ISetRefSolution): Observable<IProblemSource> {
    return this.http.put<IProblemSource>(`${API}/testsets/${id}/ref-solution`, dto);
  }

  setChecker(id: number, dto: ISetChecker): Observable<IProblemSource> {
    return this.http.put<IProblemSource>(`${API}/testsets/${id}/checker`, dto);
  }

  removeChecker(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/testsets/${id}/checker`);
  }

  setGenerator(id: number, dto: ISetGenerator): Observable<IProblemSource> {
    return this.http.put<IProblemSource>(`${API}/testsets/${id}/generator`, dto);
  }

  removeGenerator(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/testsets/${id}/generator`);
  }

  addCase(id: number, dto: ICreateTestCase): Observable<ITestCase> {
    return this.http.post<ITestCase>(`${API}/testsets/${id}/cases`, dto);
  }

  getCase(id: number, caseId: number): Observable<ITestCaseContent> {
    return this.http.get<ITestCaseContent>(`${API}/testsets/${id}/cases/${caseId}`);
  }

  updateCase(id: number, caseId: number, dto: IUpdateTestCase): Observable<ITestCase> {
    return this.http.patch<ITestCase>(`${API}/testsets/${id}/cases/${caseId}`, dto);
  }

  // Lee la firma de la solución en el worker; se consulta con getSignatureDetection
  detectSignature(id: number, dto: IDetectSignature): Observable<ISignatureDetection> {
    return this.http.post<ISignatureDetection>(`${API}/testsets/${id}/signature-detect`, dto);
  }

  getSignatureDetection(id: number, jobId: string): Observable<ISignatureDetection> {
    return this.http.get<ISignatureDetection>(`${API}/testsets/${id}/signature-detect/${jobId}`);
  }

  // Todos o ninguno
  addCases(id: number, dto: ICreateTestCases): Observable<ITestCase[]> {
    return this.http.post<ITestCase[]>(`${API}/testsets/${id}/cases/bulk`, dto);
  }

  // Un caso generado pasa a manual (editable y ya no se regenera)
  pinCase(id: number, caseId: number): Observable<ITestCase> {
    return this.http.post<ITestCase>(`${API}/testsets/${id}/cases/${caseId}/pin`, {});
  }

  // group null = casos manuales
  updateCasesVisibility(id: number, dto: IUpdateCasesVisibility): Observable<{ updated: number }> {
    return this.http.patch<{ updated: number }>(`${API}/testsets/${id}/cases/visibility`, dto);
  }

  removeCase(id: number, caseId: number): Observable<void> {
    return this.http.delete<void>(`${API}/testsets/${id}/cases/${caseId}`);
  }

  // Prueba una solución contra el testset construido (sin crear envío); se consulta con getTestRun.
  startTestRun(id: number, dto: ICreateTestRun): Observable<ITestRun> {
    return this.http.post<ITestRun>(`${API}/testsets/${id}/test-runs`, dto);
  }

  getTestRun(id: number, runId: string): Observable<ITestRun> {
    return this.http.get<ITestRun>(`${API}/testsets/${id}/test-runs/${runId}`);
  }

  generatorTemplate(problemId: number, languageId: string): Observable<IGeneratorTemplate> {
    return this.http.get<IGeneratorTemplate>(`${API}/problems/${problemId}/generator-template`, { params: { languageId } });
  }
}
