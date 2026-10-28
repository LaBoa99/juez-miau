export enum TestsetStatus {
    // Editable: casos, límites, esquema y solución oficial
    DRAFT = "draft",
    BUILDING = "building",
    READY = "ready",
    FAILED = "failed",
}

export enum TestCaseVisibility {
    PUBLIC = "public",
    HIDDEN = "hidden",
}

export enum TestCaseOrigin {
    MANUAL = "manual",
    GENERATED = "generated",
}

// Cómo se compara la salida del participante con la esperada
export enum CompareMode {
    EXACT = "exact",
    // Los float se comparan con tolerancia (`floatTolerance`, absoluta o relativa)
    TOLERANCE = "tolerance",
}
