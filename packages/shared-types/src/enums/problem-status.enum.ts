export enum ProblemStatus {
    DRAFT = "draft",
    // Propuesto por su autor: pasa las validaciones y espera que el admin de la edición lo acepte
    READY = "ready",
    // Aceptado: entra al concurso
    PUBLISHED = "published",
}
