import type { IDetectedSignature, TypeRef } from '@concurso/shared-types'

// Lee de la solución oficial las funciones que podrían ser la firma del problema.
// No es un parser completo: solo mira las funciones del nivel donde el driver las busca
// (nivel superior; en Java y C#, dentro de la clase Main) y descarta las privadas, las static de C/C++,
// los nombres con _ y main. Lo que no entiende queda con tipo null para que el juez lo elija;
// después el worker compila la solución con el driver de esa firma para confirmarla.

export function detectSignatures(languageCode: string, source: string): IDetectedSignature[] {
    switch(languageCode){
        case 'python': return detectPython(clean(source, 'python'))
        case 'javascript':
        case 'typescript': return detectJs(flatten(clean(source, 'c')), languageCode)
        case 'java':
        case 'csharp': {
            const body = classBody(clean(source, 'c'), 'Main')
            return body === null ? [] : detectCLike(flatten(body), languageCode)
        }
        case 'c':
        case 'cpp': return detectCLike(flatten(clean(source, 'c')), languageCode)
        default: return []
    }
}

// ─── Limpieza: comentarios y textos fuera, saltos de línea dentro ───

function clean(source: string, style: 'python' | 'c'): string {
    let out = ''
    let i = 0
    const blank = (text: string) => text.replace(/[^\n]/g, ' ')
    while(i < source.length){
        const rest = source.slice(i)
        let match: RegExpMatchArray | null = null
        if(style === 'python'){
            match = rest.match(/^(?:#[^\n]*|"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/)
        } else {
            match = rest.match(/^(?:\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?|^#[^\n]*)/)
            // Directivas del preprocesador (#include ...) solo al inicio de línea
            if(match?.[0].startsWith('#') && i > 0 && source[i - 1] !== '\n') match = null
        }
        if(match && match[0].length > 0){
            out += blank(match[0])
            i += match[0].length
        } else {
            out += source[i++]
        }
    }
    return out
}

// Deja solo el nivel superior: cada bloque { ... } se vuelve {}
function flatten(text: string): string {
    let out = ''
    let depth = 0
    for(const char of text){
        if(char === '{'){
            if(depth === 0) out += '{}'
            depth++
        } else if(char === '}'){
            depth = Math.max(0, depth - 1)
        } else if(depth === 0){
            out += char
        }
    }
    return out
}

// Contenido de `class Main { ... }` (sin las llaves), o null si no existe
function classBody(text: string, name: string): string | null {
    const header = new RegExp('\\bclass\\s+' + name + '\\b[^{]*\\{').exec(text)
    if(!header) return null
    let depth = 1
    const start = header.index + header[0].length
    for(let i = start; i < text.length; i++){
        if(text[i] === '{') depth++
        else if(text[i] === '}' && --depth === 0) return text.slice(start, i)
    }
    return text.slice(start)
}

// ─── Python: def en la columna 0 (las anidadas y los métodos tienen sangría) ───

function detectPython(text: string): IDetectedSignature[] {
    const found: IDetectedSignature[] = []
    for(const match of text.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->\s*([^:\n]+?))?\s*:/gm)){
        const [, name, params, returns] = match
        if(name.startsWith('_')) continue
        found.push({
            functionName: name,
            params: splitTopLevel(params)
                .filter((param) => param !== '/' && !param.startsWith('*') && param.split(/[:=]/)[0].trim() !== 'self')
                .map((param) => {
                    const [declaration] = splitDefault(param)
                    const colon = declaration.indexOf(':')
                    return colon < 0
                        ? { name: declaration.trim(), type: null }
                        : { name: declaration.slice(0, colon).trim(), type: mapType('python', declaration.slice(colon + 1)) }
                }),
            returns: returns === undefined ? null : mapType('python', returns),
        })
    }
    return found
}

// ─── C, C++, Java y C#: encabezados que terminan en {} en el texto aplanado ───

const MODIFIERS = new Set([
    'public', 'private', 'protected', 'internal', 'static', 'final', 'inline', 'extern', 'constexpr',
    'unsafe', 'virtual', 'override', 'sealed', 'synchronized', 'strictfp', 'abstract', 'friend',
])

function detectCLike(text: string, languageCode: string): IDetectedSignature[] {
    const found: IDetectedSignature[] = []
    for(const chunk of text.split(/(?<=\{\}|;)/)){
        // Cuerpo con llaves, o en C# un método de expresión: f(...) => ...;
        const body = chunk.endsWith('{}')
            ? chunk.slice(0, -2)
            : languageCode === 'csharp' ? /^([\s\S]*?\))\s*=>/.exec(chunk)?.[1] : undefined
        if(body === undefined) continue
        const header = /^([\s\S]*?)\b([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(?:const\s*)?(?:noexcept\s*)?(?:throws\s+[\w\s,.]+)?$/.exec(body.trim())
        if(!header) continue
        const [, prefix, name, params] = header
        const words = prefix.trim().split(/\s+/).filter(Boolean)
        const modifiers = words.filter((word) => MODIFIERS.has(word))
        const returnType = words.filter((word) => !MODIFIERS.has(word)).join(' ')
        // Sin tipo de regreso es un constructor, una llamada o un if/for/while
        if(!returnType || /[=]|\b(?:class|struct|new|return|else|if|for|while|switch|namespace)\b/.test(prefix)) continue
        if(name === 'main' || name === 'Main' || name.startsWith('_')) continue

        const isStatic = modifiers.includes('static')
        if(languageCode === 'java' || languageCode === 'csharp'){
            if(!isStatic || modifiers.includes('private') || modifiers.includes('protected')) continue
        } else if(isStatic){
            continue
        }

        found.push({
            functionName: name,
            params: splitTopLevel(params)
                .filter((param) => param !== 'void')
                .map((param) => {
                    const [declaration] = splitDefault(param)
                    const parts = /^([\s\S]*?)\s*\b([A-Za-z_]\w*)\s*((?:\[\s*\])*)$/.exec(declaration.trim())
                    if(!parts) return { name: declaration.trim(), type: null }
                    const [, type, paramName, brackets] = parts
                    return { name: paramName, type: mapType(languageCode, type.replace(/\b(?:final|const|ref|in|out)\b/g, '') + brackets) }
                }),
            returns: returnType === 'void' ? null : mapType(languageCode, returnType),
        })
    }
    return found
}

// ─── JavaScript y TypeScript: function f(...) {} y const f = (...) => ... ───

function detectJs(text: string, languageCode: string): IDetectedSignature[] {
    const found: IDetectedSignature[] = []
    const add = (name: string, params: string, returns: string | undefined) => {
        if(name.startsWith('_')) return
        found.push({
            functionName: name,
            params: splitTopLevel(params).filter((param) => !param.startsWith('...')).map((param) => {
                const [declaration] = splitDefault(param)
                const colon = declaration.indexOf(':')
                return colon < 0
                    ? { name: declaration.replace('?', '').trim(), type: null }
                    : { name: declaration.slice(0, colon).replace('?', '').trim(), type: languageCode === 'typescript' ? mapType('typescript', declaration.slice(colon + 1)) : null }
            }),
            returns: returns && languageCode === 'typescript' ? mapType('typescript', returns) : null,
        })
    }
    for(const match of text.matchAll(/(?:^|[;\n}])\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^()]*)\)\s*(?::\s*([^{};]+?))?\s*\{\}/g)){
        add(match[1], match[2], match[3])
    }
    for(const match of text.matchAll(/(?:^|[;\n}])\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(([^()]*)\)|([A-Za-z_$][\w$]*))\s*(?::\s*([^=]+?))?\s*=>/g)){
        add(match[1], match[2] ?? match[3], match[4])
    }
    return found
}

// ─── Tipos ───

const SCALARS: Record<string, Record<string, TypeRef['type']>> = {
    python: { int: 'int', float: 'float', bool: 'bool', str: 'string' },
    c: { int: 'int', 'long long': 'long', long: 'long', double: 'float', float: 'float', bool: 'bool', 'char *': 'string', 'char*': 'string' },
    cpp: { int: 'int', 'long long': 'long', long: 'long', int64_t: 'long', double: 'float', float: 'float', bool: 'bool', string: 'string' },
    java: { int: 'int', Integer: 'int', long: 'long', Long: 'long', double: 'float', Double: 'float', float: 'float', boolean: 'bool', Boolean: 'bool', String: 'string' },
    csharp: { int: 'int', long: 'long', double: 'float', float: 'float', bool: 'bool', string: 'string', String: 'string' },
    // number puede ser int o float: se propone int y el juez lo cambia si hace falta
    typescript: { number: 'int', bigint: 'long', boolean: 'bool', string: 'string' },
}

const C_ARRAY = /^(Int|Long|Double|Bool|String)Array(?:([23])D)?$/
const C_ARRAY_BASE: Record<string, TypeRef['type']> = { Int: 'int', Long: 'long', Double: 'float', Bool: 'bool', String: 'string' }

export function mapType(languageCode: string, raw: string): TypeRef | null {
    const type = raw.replace(/std::/g, '').replace(/&/g, '').replace(/\s+/g, ' ').trim()
    if(!type) return null

    // Uniones (int | float, Union[int, float], number | bigint): el tipo numérico más amplio
    const union = /^(?:typing\.)?Union\[(.+)\]$/.exec(type)?.[1].split(',') ?? splitUnion(type)
    if(union.length > 1){
        return widest(union.filter((member) => !/^(?:None|null|undefined)$/.test(member.trim())).map((member) => mapType(languageCode, member)))
    }

    const array = /^(.+?)\s*\[\s*\]$/.exec(type)
        ?? /^(?:list|List|vector|Array|ReadonlyArray)\s*[<[]\s*(.+?)\s*[>\]]$/.exec(type)
    if(array){
        const items = mapType(languageCode, array[1])
        return items && { type: 'array', items }
    }

    if(languageCode === 'c'){
        const cArray = C_ARRAY.exec(type)
        if(cArray){
            let result: TypeRef = { type: C_ARRAY_BASE[cArray[1]] } as TypeRef
            for(let depth = Number(cArray[2] ?? 1); depth > 0; depth--) result = { type: 'array', items: result }
            return result
        }
    }

    const scalar = SCALARS[languageCode]?.[type]
    return scalar ? { type: scalar } as TypeRef : null
}

const NUMERIC_ORDER: TypeRef['type'][] = ['int', 'long', 'float']

function widest(types: (TypeRef | null)[]): TypeRef | null {
    if(types.length === 0 || types.some((type) => type === null)) return null
    if(types.length === 1) return types[0]
    const ranks = types.map((type) => NUMERIC_ORDER.indexOf(type!.type))
    // Mezclas no numéricas (int | str) no tienen un tipo de la firma que las cubra
    return ranks.every((rank) => rank >= 0) ? { type: NUMERIC_ORDER[Math.max(...ranks)] } as TypeRef : null
}

// "int | float" → ["int", "float"], sin partir dentro de list[...] o <...>
function splitUnion(type: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ''
    for(const char of type){
        if('<[('.includes(char)) depth++
        else if('>])'.includes(char)) depth--
        if(char === '|' && depth === 0){
            parts.push(current.trim())
            current = ''
        } else {
            current += char
        }
    }
    parts.push(current.trim())
    return parts
}

// ─── Utilidades ───

// Separa por comas que no estén dentro de <>, [] o ()
function splitTopLevel(text: string): string[] {
    const parts: string[] = []
    let depth = 0
    let current = ''
    for(const char of text){
        if('<[('.includes(char)) depth++
        else if('>])'.includes(char)) depth--
        if(char === ',' && depth === 0){
            parts.push(current.trim())
            current = ''
        } else {
            current += char
        }
    }
    if(current.trim()) parts.push(current.trim())
    return parts
}

// "x: int = 5" → ["x: int", "5"]; respeta "==" y "=>"
function splitDefault(param: string): [string, string | null] {
    const match = /^(.*?[^=!<>])=(?![=>])([\s\S]*)$/.exec(param)
    return match ? [match[1], match[2]] : [param, null]
}
