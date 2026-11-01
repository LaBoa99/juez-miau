// Letras válidas en orden: A..Z y luego AA..ZZ (lo que acepta /^[A-Z]{1,2}$/)
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LETTERS = [...ALPHABET, ...[...ALPHABET].flatMap((a) => [...ALPHABET].map((b) => a + b))]

// Primera letra libre de la categoría; rellena los huecos que dejan los borradores eliminados
export function nextFreeLetter(taken: string[]): string {
    const used = new Set(taken)
    const letter = LETTERS.find((l) => !used.has(l))
    if(!letter) throw new Error('no free letters left in the category')
    return letter
}
