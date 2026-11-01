import type { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types'
import { LOCAL_BLOCK_END, LOCAL_BLOCK_START, type DriverBuilder, type DriverInput, type DriverProgram } from './driver.types.js'
import { buildPythonProgram } from './python.driver.js'
import { buildJavaScriptProgram, buildTypeScriptProgram } from './javascript.driver.js'
import { buildJavaProgram, javaType } from './java.driver.js'
import { buildCSharpProgram, csharpType } from './csharp.driver.js'
import { buildCProgram, cType } from './c.driver.js'
import { buildCppProgram, cppType } from './cpp.driver.js'

export { RESULT_PATH, type DriverProgram } from './driver.types.js'

// Por `Language.code`. La imagen y los flags siguen saliendo de Language; los comandos los da el
// driver porque dependen de sus archivos (Language.compile_cmd/run_cmd quedan para stdin/stdout)
const BUILDERS: Record<string, DriverBuilder> = {
    c: buildCProgram,
    cpp: buildCppProgram,
    csharp: buildCSharpProgram,
    java: buildJavaProgram,
    javascript: buildJavaScriptProgram,
    typescript: buildTypeScriptProgram,
    python: buildPythonProgram,
}

export const SUPPORTED_LANGUAGES = Object.keys(BUILDERS)

export function hasDriver(languageCode: string): boolean {
    return Object.hasOwn(BUILDERS, languageCode)
}

export function buildProgram(languageCode: string, input: DriverInput): DriverProgram {
    const builder = BUILDERS[languageCode]
    if(!builder) throw new Error('no driver for language ' + languageCode)
    return builder(input)
}

// ─── Código de inicio que ve el participante ────────────────

const TS_SCALARS: Record<ScalarType, string> = {
    int: 'number',
    long: 'bigint',
    float: 'number',
    bool: 'boolean',
    string: 'string',
}

function tsType(type: TypeRef): string {
    return type.type === 'array' ? tsType(type.items) + '[]' : TS_SCALARS[type.type]
}

const PY_SCALARS: Record<ScalarType, string> = {
    int: 'int',
    long: 'int',
    float: 'float',
    bool: 'bool',
    string: 'str',
}

function pyType(type: TypeRef): string {
    return type.type === 'array' ? 'list[' + pyType(type.items) + ']' : PY_SCALARS[type.type]
}

export function starterCode(languageCode: string, signature: IProblemSignature): string | null {
    const name = signature.functionName
    const params = (format: (type: TypeRef, param: string) => string) =>
        signature.params.map((param) => format(param.type, param.name)).join(', ')

    switch(languageCode){
        case 'python':
            return 'def ' + name + '(' + params((type, param) => param + ': ' + pyType(type)) + ') -> ' + pyType(signature.returns) + ':\n    pass\n'
        case 'javascript':
            return [
                '// long llega como bigint',
                'function ' + name + '(' + params((_, param) => param) + ') {',
                '}',
                '',
            ].join('\n')
        case 'typescript':
            return 'function ' + name + '(' + params((type, param) => param + ': ' + tsType(type)) + '): ' + tsType(signature.returns) + ' {\n}\n'
        case 'java':
            return [
                'import java.util.*;',
                '',
                'class Main {',
                '    static ' + javaType(signature.returns) + ' ' + name + '(' + params((type, param) => javaType(type) + ' ' + param) + ') {',
                '    }',
                '}',
                '',
            ].join('\n')
        case 'csharp':
            return [
                '// Sin namespace: el juez llama a Main.' + name,
                'public class Main',
                '{',
                '    public static ' + csharpType(signature.returns) + ' ' + name + '(' + params((type, param) => csharpType(type) + ' ' + param) + ')',
                '    {',
                '    }',
                '}',
                '',
            ].join('\n')
        case 'c':
            return [
                '// judge.h define los arrays como structs { data, len }',
                '#include "judge.h"',
                '',
                (signature.returns.type === 'string' ? 'char *' : cType(signature.returns) + ' ') + name + '(' + params((type, param) => {
                    const ctype = cType(type)
                    return ctype.endsWith('*') ? ctype + param : ctype + ' ' + param
                }) + ') {',
                '}',
                '',
            ].join('\n')
        case 'cpp':
            return [
                '#include <bits/stdc++.h>',
                'using namespace std;',
                '',
                cppType(signature.returns).replaceAll('std::', '') + ' ' + name + '(' + params((type, param) => cppType(type).replaceAll('std::', '') + ' ' + param) + ') {',
                '}',
                '',
            ].join('\n')
        default:
            return null
    }
}

// ─── Plantilla del generador ────────────────────────────────
// Esqueleto de generate(seed, group, index) que ya regresa caso(...) con los parámetros del
// problema y valores de ejemplo del tipo correcto: el juez solo cambia los valores

function placeholder(languageCode: string, type: TypeRef): string {
    if(type.type === 'array'){
        switch(languageCode){
            case 'java': return 'new ' + javaType(type).replace('[]', '[0]')
            case 'csharp': return 'new ' + csharpType(type).replace('[]', '[0]')
            case 'c': return '(' + cType(type) + '){ NULL, 0 }'
            case 'cpp': return '{}'
            default: return '[]'
        }
    }
    switch(type.type){
        case 'string': return languageCode === 'python' || languageCode === 'javascript' || languageCode === 'typescript' ? "''" : '""'
        case 'bool': return languageCode === 'python' ? 'False' : 'false'
        case 'float': return '0.0'
        case 'long': return languageCode === 'javascript' || languageCode === 'typescript' ? '0n' : languageCode === 'java' || languageCode === 'csharp' ? '0L' : '0'
        default: return '0'
    }
}

const GENERATOR_STARTER: IProblemSignature = {
    functionName: 'generate',
    params: [
        { name: 'seed', type: { type: 'long' } },
        { name: 'group', type: { type: 'string' } },
        { name: 'index', type: { type: 'int' } },
    ],
    returns: { type: 'string' },
}

export function generatorTemplate(languageCode: string, caseSignature: IProblemSignature): string | null {
    const skeleton = starterCode(languageCode, GENERATOR_STARTER)
    if(skeleton === null) return null

    const comment = languageCode === 'python' ? '#' : '//'
    const call = languageCode === 'java' ? 'Caso.de' : languageCode === 'csharp' ? 'Caso.De' : 'caso'
    const typeName = (type: TypeRef) => (function name(t: TypeRef): string { return t.type === 'array' ? name(t.items) + '[]' : t.type })(type)
    const signatureText = call + '(' + caseSignature.params.map((param) => param.name + ': ' + typeName(param.type)).join(', ') + ')'
    const args = caseSignature.params
        .map((param) => (languageCode === 'python' ? param.name + '=' : '') + placeholder(languageCode, param.type))
        .join(', ')

    const indent = languageCode === 'java' || languageCode === 'csharp' ? '        ' : '    '
    const body = [
        indent + comment + ' Usa la semilla para el azar: misma semilla, mismo caso.',
        indent + comment + ' ' + signatureText,
        indent + 'return ' + call + '(' + args + ')' + (languageCode === 'python' ? '' : ';'),
    ]

    const lines = skeleton.split('\n')
    if(languageCode === 'python'){
        lines.splice(lines.findIndex((line) => line.trim() === 'pass'), 1, ...body)
    } else {
        const signatureLine = lines.findIndex((line) => line.includes('generate('))
        // En C# la llave va en la línea siguiente
        lines.splice(signatureLine + (languageCode === 'csharp' ? 2 : 1), 0, ...body)
    }

    // caso(...) de prueba para el IDE y para correrlo en tu máquina; el juez quita el bloque
    const local = [
        comment + ' ' + LOCAL_BLOCK_START,
        comment + ' Para tu IDE y para probar en tu máquina. En el juez se quita este bloque y se usa el ' + call + '(...) del sistema.',
        ...localCaso(languageCode, caseSignature),
        comment + ' ' + LOCAL_BLOCK_END,
        '',
    ]
    if(languageCode === 'java' || languageCode === 'csharp'){
        lines.push(...local)
    } else {
        const at = lines.findIndex((line) => line.includes('generate('))
        lines.splice(at, 0, ...local)
    }

    const header = [
        comment + ' Generador: se llama una vez por caso con la semilla, el nombre del grupo y el índice.',
        comment + ' Regresa ' + signatureText + ' con los valores del caso; el sistema arma el JSON (no lo escribas a mano).',
        '',
    ]
    return header.join('\n') + lines.join('\n')
}

// Versión local de caso(...): en Python y JS arma el JSON de verdad; en los compilados basta con que
// compile y el IDE la reconozca (regresa "")
function localCaso(languageCode: string, caseSignature: IProblemSignature): string[] {
    const params = caseSignature.params
    const names = params.map((param) => param.name)
    const jsonObject = '{ ' + names.map((name) => JSON.stringify(name) + ': ' + name).join(', ') + ' }'
    switch(languageCode){
        case 'python':
            return [
                'import json',
                'def caso(' + params.map((param) => param.name + ': ' + pyType(param.type)).join(', ') + ') -> str:',
                '    return json.dumps(' + jsonObject.replace(/^\{ /, '{').replace(/ \}$/, '}') + ')',
            ]
        case 'javascript':
            return ['function caso(' + names.join(', ') + ') {', "    return JSON.stringify(" + jsonObject + ", (k, v) => typeof v === 'bigint' ? v.toString() : v)", '}']
        case 'typescript':
            return [
                'function caso(' + params.map((param) => param.name + ': ' + tsType(param.type)).join(', ') + '): string {',
                "    return JSON.stringify(" + jsonObject + ", (k, v) => typeof v === 'bigint' ? v.toString() : v)",
                '}',
            ]
        case 'java':
            return ['class Caso {', '    static String de(' + params.map((param) => javaType(param.type) + ' ' + param.name).join(', ') + ') { return ""; }', '}']
        case 'csharp':
            return ['public static class Caso', '{', '    public static string De(' + params.map((param) => csharpType(param.type) + ' ' + param.name).join(', ') + ') => "";', '}']
        case 'c':
            return ['char *caso(' + params.map((param) => { const t = cType(param.type); return t.endsWith('*') ? t + param.name : t + ' ' + param.name }).join(', ') + ') { return (char *)""; }']
        case 'cpp':
            return ['string caso(' + params.map((param) => cppType(param.type).replaceAll('std::', '') + ' ' + param.name).join(', ') + ') { return ""; }']
        default:
            return []
    }
}
