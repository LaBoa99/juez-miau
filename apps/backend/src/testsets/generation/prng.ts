import { createHash } from 'crypto'

const TWO_32 = 2 ** 32

function rotl(x: number, k: number): number {
    return (x << k) | (x >>> (32 - k))
}

// xoshiro128**: rápido (solo enteros de 32 bits) y determinista.
// Las entradas generadas se guardan, así que el PRNG solo importa para poder regenerar
// el mismo testset desde el backend; ningún otro lenguaje necesita reproducirlo
export class Prng {
    private readonly state = new Uint32Array(4)

    // La semilla sale de sha256(key), así "grupo:semilla" da secuencias independientes
    static fromKey(key: string): Prng {
        const digest = createHash('sha256').update(key).digest()
        const prng = new Prng()
        for(let i = 0; i < 4; i++) prng.state[i] = digest.readUInt32LE(i * 4)
        if(prng.state.every((word) => word === 0)) prng.state[0] = 1
        return prng
    }

    nextU32(): number {
        const s = this.state
        const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9) >>> 0
        const t = s[1] << 9

        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = rotl(s[3], 11)

        return result
    }

    // Entero uniforme en [0, n) para 1 <= n <= 2^32, sin sesgo de módulo
    below(n: number): number {
        const limit = TWO_32 - (TWO_32 % n)
        let x = this.nextU32()
        while(x >= limit) x = this.nextU32()
        return x % n
    }

    // Entero uniforme en [min, max] con min y max de 32 bits
    int(min: number, max: number): number {
        return min + this.below(max - min + 1)
    }

    // Entero uniforme en [min, max] con rangos de hasta 64 bits
    bigint(min: bigint, max: bigint): bigint {
        const range = max - min + 1n
        if(range <= BigInt(TWO_32)) return min + BigInt(this.below(Number(range)))

        const space = 1n << 64n
        const limit = space - (space % range)
        for(;;){
            const x = (BigInt(this.nextU32()) << 32n) | BigInt(this.nextU32())
            if(x < limit) return min + (x % range)
        }
    }

    // Double uniforme en [0, 1) con 53 bits de precisión
    float(): number {
        return ((this.nextU32() >>> 5) * 67108864 + (this.nextU32() >>> 6)) / 9007199254740992
    }

    shuffle<T>(items: T[]): T[] {
        for(let i = items.length - 1; i > 0; i--){
            const j = this.below(i + 1)
            ;[items[i], items[j]] = [items[j], items[i]]
        }
        return items
    }
}
