export interface ICreateSubmissionDto {
  problemId: string;
  language: "cpp" | "java" | "python" | "typescript" | "c";
  code: string;
}

export interface ISubmissionResponse {
  submissionId: string;
  status: "PENDING" | "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED";
  executionTimeMs: number;
}


export * from "./enums/edition-status.enum.js";
export * from "./enums/roles.enum.js";
export * from "./enums/staff-role.enum.js";

export * from "./interfaces/edition.interface.js";
export * from "./interfaces/team.interface.js"
