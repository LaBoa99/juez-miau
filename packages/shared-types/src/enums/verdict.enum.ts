// Veredicto de un envío o de un caso (judge-evaluation.md §5)
export enum Verdict {
    AC = "AC",
    WA = "WA",
    TLE = "TLE",
    MLE = "MLE",
    RE = "RE",
    // Solo a nivel envío: un caso nunca da CE
    CE = "CE",
    // Pasó los casos automáticos y espera la revisión de un juez
    PENDING_REVIEW = "PENDING_REVIEW",
}
