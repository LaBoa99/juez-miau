import type { IProblemSignature, ScalarType, TypeRef } from '@concurso/shared-types'
import type { DriverBuilder, DriverInput, DriverProgram } from './driver.types.js'
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
