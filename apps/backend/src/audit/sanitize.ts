// Lo que no debe quedar en la bitácora: credenciales y código (el código ya se guarda aparte)
const SENSITIVE_KEY = /password|token|secret|masterkey|source/i
const MAX_STRING = 300
const MAX_BODY_BYTES = 4 * 1024

function sanitizeValue(value: unknown, depth: number): unknown {
    if(typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value
    if(Array.isArray(value)){
        if(depth > 3) return '[array of ' + value.length + ']'
        return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1))
    }
    if(value && typeof value === 'object'){
        if(depth > 3) return '[object]'
        return Object.fromEntries(Object.entries(value).map(([key, item]) =>
            [key, SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeValue(item, depth + 1)]))
    }
    return value
}

export function sanitizeBody(body: unknown): Record<string, unknown> | null {
    if(!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) return null
    const clean = sanitizeValue(body, 0) as Record<string, unknown>
    if(JSON.stringify(clean).length <= MAX_BODY_BYTES) return clean
    return { truncated: true, keys: Object.keys(clean) }
}
