import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ICreateTestCase,
  ICreateTestsetVersion,
  IGenerateTestsetResponse,
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

  generate(id: number): Observable<IGenerateTestsetResponse> {
    return this.http.post<IGenerateTestsetResponse>(`${API}/testsets/${id}/generate`, {});
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

  removeCase(id: number, caseId: number): Observable<void> {
    return this.http.delete<void>(`${API}/testsets/${id}/cases/${caseId}`);
  }
}
