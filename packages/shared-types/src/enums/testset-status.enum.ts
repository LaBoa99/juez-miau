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
    // Por el esquema declarativo (POST /testsets/:id/generate)
    GENERATED = "generated",
    // Por el generador en código del juez, al construir el testset
    GENERATOR = "generator",
}

// Cómo se compara la salida del participante con la esperada
export enum CompareMode {
    EXACT = "exact",
    // Los float se comparan con tolerancia (`floatTolerance`, absoluta o relativa)
    TOLERANCE = "tolerance",
    // Un programa del juez decide (varias respuestas válidas)
    CHECKER = "checker",
}
