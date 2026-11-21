// Letras válidas en orden: A..Z y luego AA..ZZ (lo que acepta /^[A-Z]{1,2}$/)
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LETTERS = [...ALPHABET, ...[...ALPHABET].flatMap((a) => [...ALPHABET].map((b) => a + b))]

// Letra del problema número `index` (0 = A) de su categoría
export function letterAt(index: number): string {
    const letter = LETTERS[index]
    if(!letter) throw new Error('a category cannot have more than ' + LETTERS.length + ' problems')
    return letter
}

// Letra que sigue a las ya usadas en la categoría (para aceptar un problema con el concurso en pausa)
export function nextLetter(used: string[]): string {
    return letterAt(Math.max(-1, ...used.map((letter) => LETTERS.indexOf(letter))) + 1)
}
