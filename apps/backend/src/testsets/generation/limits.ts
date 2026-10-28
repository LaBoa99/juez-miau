// Topes para que un testset no tumbe la API ni la BD

// Tamaño máximo del input de un caso, ya serializado
export const MAX_CASE_BYTES = 8 * 1024 * 1024

// Casos por testset (manuales + generados); `ordinal` es smallint
export const MAX_TESTSET_CASES = 500

// Elementos escalares por caso, contando el peor caso de cada nodo del esquema
export const MAX_ELEMENTS_PER_CASE = 2_000_000

// Suma del input de todos los casos generados
export const MAX_GENERATED_TOTAL_BYTES = 256 * 1024 * 1024

// Profundidad de arrays anidados en la firma (int[][][] como máximo)
export const MAX_TYPE_DEPTH = 3

// Hasta este tamaño el detalle del testset incluye el input de cada caso
export const MAX_INPUT_PREVIEW_BYTES = 64 * 1024

// Errores que se reportan como máximo en una validación
export const MAX_VALIDATION_ERRORS = 20
