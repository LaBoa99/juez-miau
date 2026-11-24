import { randomInt } from "crypto"

// Sin 0/1: se confunden con O/l/I en el PDF de credenciales.
const SAFE_DIGITS = "23456789"

function safeDigits(length: number): string {
    let out = ""
    for(let i = 0; i < length; i++) out += SAFE_DIGITS.charAt(randomInt(0, SAFE_DIGITS.length))
    return out
}

export class CoolNames {

    static coolUsername(text: string){
        const cleanText = text.trim().toLowerCase()

        const words = cleanText.split(/\s+/)
        const joinedCamel = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
        const joinedSnake = words.join('_')
        const joinedFlat = words.join('')

        const formats = [
            () => joinedCamel,
            () => joinedSnake,
            () => `${joinedSnake}_${safeDigits(2)}`,
            () => `${joinedFlat}${safeDigits(1)}`,
            () => `the_${joinedSnake}`,
            () => `team_${joinedCamel}`,
        ]

        const randomFormat = formats[randomInt(0, formats.length)]
        return randomFormat()
    }
}