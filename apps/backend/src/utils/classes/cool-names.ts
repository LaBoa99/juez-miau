import { randomInt } from "crypto"

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
            () => `${joinedSnake}_${randomInt(10, 99)}`,
            () => `${joinedFlat}${randomInt(1, 9)}`,
            () => `the_${joinedSnake}`,
            () => `team_${joinedCamel}`,
        ]

        const randomFormat = formats[randomInt(0, formats.length)]
        return randomFormat()
    }
}