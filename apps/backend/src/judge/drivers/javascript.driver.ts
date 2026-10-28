import type { TypeRef } from '@concurso/shared-types'
import { containsType, quote, RESULT_PATH, type DriverBuilder, type DriverInput, type DriverProgram } from './driver.types.js'

// Los long llegan como bigint: un number pierde precisión arriba de 2^53.
// Como resultado se acepta number o bigint (el bigint se escribe como string y el worker lo acepta)
function converter(type: TypeRef, value: string): string {
    if(!containsType(type, 'long')) return value
    if(type.type === 'array') return value + '.map((_judge_v) => ' + converter(type.items, '_judge_v') + ')'
    return 'BigInt(' + value + ')'
}

// El driver va al final del mismo archivo, dentro de una función, para no chocar con los
// nombres del participante. `process.getBuiltinModule` funciona igual si Node trata el archivo
// como CommonJS o como ESM (si el participante usa import/export)
function buildDriver({ signature }: DriverInput): string {
    const args = signature.params
        .map((param) => converter(param.type, '_judge_input[' + quote(param.name) + ']'))
        .join(', ')

    return [
        '',
        '',
        '// ---- driver del juez ----',
        ';(() => {',
        "    const _judge_fs = process.getBuiltinModule('node:fs')",
        "    const _judge_text = _judge_fs.readFileSync(0, 'utf8')",
        // Los enteros que no caben en un double se conservan como texto para BigInt
        '    const _judge_input = JSON.parse(_judge_text, (_judge_k, _judge_v, _judge_ctx) =>',
        "        typeof _judge_v === 'number' && !Number.isSafeInteger(_judge_v) && _judge_ctx && /^-?\\d+$/.test(_judge_ctx.source)",
        '            ? _judge_ctx.source : _judge_v)',
        '    Promise.resolve(' + signature.functionName + '(' + args + ')).then((_judge_result) => {',
        '        _judge_fs.writeFileSync(' + quote(RESULT_PATH) + ', JSON.stringify(_judge_result === undefined ? null : _judge_result,',
        "            (_judge_k, _judge_v) => typeof _judge_v === 'bigint' ? _judge_v.toString() : _judge_v))",
        '    })',
        '})()',
        '',
    ].join('\n')
}

export const buildJavaScriptProgram: DriverBuilder = (input): DriverProgram => ({
    files: { 'Main.js': input.source + buildDriver(input) },
    compileCmd: 'node --check Main.js',
    runCmd: 'node --stack-size=65500 Main.js',
})

// Node 24 ejecuta TypeScript quitando los tipos, sin revisarlos. El chequeo de compilación
// falla con errores de sintaxis y con sintaxis que no se puede borrar (enum, namespace)
export const buildTypeScriptProgram: DriverBuilder = (input): DriverProgram => ({
    files: { 'Main.ts': input.source + buildDriver(input) },
    compileCmd: `node --disable-warning=ExperimentalWarning -e "require('node:module').stripTypeScriptTypes(require('node:fs').readFileSync('Main.ts', 'utf8'))"`,
    runCmd: 'node --disable-warning=ExperimentalWarning --stack-size=65500 Main.ts',
})
