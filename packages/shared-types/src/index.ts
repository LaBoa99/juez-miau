export interface ICreateSubmissionDto {
  problemId: string;
  language: "cpp" | "java" | "python" | "typescript";
  code: string;
}

export interface ISubmissionResponse {
  submissionId: string;
  status: "PENDING" | "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED";
  executionTimeMs: number;
}
