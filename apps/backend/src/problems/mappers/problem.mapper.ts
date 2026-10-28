import type { IProblem } from '@concurso/shared-types';
import type { Problem } from '../entities/problem.entity.js';

export function toProblemDto(problem: Problem): IProblem {
    return {
        id: problem.id,
        editionId: problem.edition_id,
        categoryId: problem.category_id,
        letter: problem.letter,
        title: problem.title,
        statement: problem.statement_md,
        inputFormat: problem.input_format,
        outputFormat: problem.output_format,
        points: problem.points,
        status: problem.status,
        currentTestsetId: problem.current_testset_id,
        signature: problem.signature,
    }
}
