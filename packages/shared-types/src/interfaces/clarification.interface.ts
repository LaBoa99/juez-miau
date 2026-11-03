// Lo que ve el equipo: sin saber qué equipo preguntó
export interface IClarification {
    id: number
    // null: pregunta general del concurso
    problemId: number | null
    question: string
    // null mientras no la responda el staff
    answer: string | null
    createdAt: string | Date
    answeredAt: string | Date | null
    // El staff la rechazó (contenido indebido o revela una respuesta): no se publica a los demás
    rejectedAt: string | Date | null
    // Solo en las respuestas al propio equipo; el evento público no lo trae
    mine?: boolean
}

export interface IStaffClarification extends IClarification {
    teamId: number
    teamName: string
    answeredBy: number | null
}

export interface ICreateClarification {
    problemId?: number | null
    question: string
}

export interface IAnswerClarification {
    answer: string
}

// clarification:delete — el staff la eliminó; cada cliente la quita de su lista
export interface IClarificationDeleted {
    id: number
}
