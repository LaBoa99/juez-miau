import type { ScalarType, TypeRef } from '@concurso/shared-types'
import { arrayDepth, baseType, collectTypes, quote, RESULT_PATH, typeKey, withCaseTypes, type DriverBuilder, type DriverInput } from './driver.types.js'

// El participante escribe la función en Main.c (puede incluir "judge.h" para tener los tipos).
// driver.c incluye Main.c en la misma unidad de compilación: así no hay que repetir la
// declaración y un main() propio del participante (para probar en su máquina) no estorba.
// Los arrays son structs { data, len } definidos en judge.h

const BASE_NAMES: Record<ScalarType, string> = {
    int: 'Int',
    long: 'Long',
    float: 'Double',
    bool: 'Bool',
    string: 'String',
}

const SCALARS: Record<ScalarType, string> = {
    int: 'int',
    long: 'long long',
    float: 'double',
    bool: 'bool',
    string: 'char *',
}

export function cType(type: TypeRef): string {
    const depth = arrayDepth(type)
    if(depth === 0) return SCALARS[baseType(type)]
    return BASE_NAMES[baseType(type)] + 'Array' + (depth > 1 ? depth + 'D' : '')
}

function arrayTypedefs(): string {
    const lines: string[] = []
    for(const scalar of Object.keys(SCALARS) as ScalarType[]){
        let element = SCALARS[scalar]
        for(let depth = 1; depth <= 3; depth++){
            const name = BASE_NAMES[scalar] + 'Array' + (depth > 1 ? depth + 'D' : '')
            lines.push('typedef struct { ' + element + (element.endsWith('*') ? '' : ' ') + '*data; int len; } ' + name + ';')
            element = name
        }
    }
    return lines.join('\n')
}

export const JUDGE_H = `#ifndef JUDGE_H
#define JUDGE_H

#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Arrays de la firma: data apunta a len elementos. Para regresar uno, reserva data con malloc
${arrayTypedefs()}

#endif
`

// Lectura y escritura de escalares. Se definen antes de incluir Main.c para que las macros del
// participante (#define int long long) no las cambien; por eso main() usa los alias jd_*
const RUNTIME = `#include <math.h>

typedef int jd_I;
typedef long long jd_L;
typedef double jd_D;
typedef bool jd_B;
typedef char *jd_S;

static const char *jd_p;

static void jd_fail(const char *what) {
    fprintf(stderr, "judge: invalid input (%s)\\n", what);
    exit(97);
}

static void jd_ws(void) { while (*jd_p && (unsigned char)*jd_p <= ' ') jd_p++; }

static void jd_expect(char c) {
    jd_ws();
    if (*jd_p != c) jd_fail("unexpected character");
    jd_p++;
}

static bool jd_try(char c) {
    jd_ws();
    if (*jd_p == c) { jd_p++; return true; }
    return false;
}

static void jd_rd_I(jd_I *v) {
    char *end;
    jd_ws();
    long x = strtol(jd_p, &end, 10);
    if (end == jd_p) jd_fail("int");
    jd_p = end;
    *v = (jd_I)x;
}

static void jd_rd_L(jd_L *v) {
    char *end;
    jd_ws();
    long long x = strtoll(jd_p, &end, 10);
    if (end == jd_p) jd_fail("long");
    jd_p = end;
    *v = x;
}

static void jd_rd_D(jd_D *v) {
    char *end;
    jd_ws();
    double x = strtod(jd_p, &end);
    if (end == jd_p) jd_fail("float");
    jd_p = end;
    *v = x;
}

static void jd_rd_B(jd_B *v) {
    jd_ws();
    if (strncmp(jd_p, "true", 4) == 0) { *v = true; jd_p += 4; }
    else if (strncmp(jd_p, "false", 5) == 0) { *v = false; jd_p += 5; }
    else jd_fail("bool");
}

static unsigned jd_hex4(void) {
    unsigned v = 0;
    for (int i = 0; i < 4; i++) {
        char c = *jd_p++;
        v <<= 4;
        if (c >= '0' && c <= '9') v |= (unsigned)(c - '0');
        else if (c >= 'a' && c <= 'f') v |= (unsigned)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') v |= (unsigned)(c - 'A' + 10);
        else jd_fail("\\\\u escape");
    }
    return v;
}

static size_t jd_utf8(char *out, unsigned cp) {
    if (cp < 0x80) { out[0] = (char)cp; return 1; }
    if (cp < 0x800) { out[0] = (char)(0xC0 | (cp >> 6)); out[1] = (char)(0x80 | (cp & 0x3F)); return 2; }
    if (cp < 0x10000) {
        out[0] = (char)(0xE0 | (cp >> 12)); out[1] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[2] = (char)(0x80 | (cp & 0x3F));
        return 3;
    }
    out[0] = (char)(0xF0 | (cp >> 18)); out[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
    out[2] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[3] = (char)(0x80 | (cp & 0x3F));
    return 4;
}

static void jd_rd_S(jd_S *v) {
    size_t cap = 16, n = 0;
    char *b = malloc(cap);
    jd_expect('"');
    for (;;) {
        unsigned char c = (unsigned char)*jd_p++;
        if (c == 0) jd_fail("string");
        if (c == '"') break;
        if (n + 5 >= cap) { cap *= 2; b = realloc(b, cap); }
        if (c != '\\\\') { b[n++] = (char)c; continue; }
        c = (unsigned char)*jd_p++;
        switch (c) {
            case 'n': b[n++] = '\\n'; break;
            case 't': b[n++] = '\\t'; break;
            case 'r': b[n++] = '\\r'; break;
            case 'b': b[n++] = '\\b'; break;
            case 'f': b[n++] = '\\f'; break;
            case 'u': {
                unsigned cp = jd_hex4();
                if (cp >= 0xD800 && cp < 0xDC00 && jd_p[0] == '\\\\' && jd_p[1] == 'u') {
                    jd_p += 2;
                    cp = 0x10000 + ((cp - 0xD800) << 10) + (jd_hex4() - 0xDC00);
                }
                n += jd_utf8(b + n, cp);
                break;
            }
            default: b[n++] = (char)c;
        }
    }
    b[n] = 0;
    *v = b;
}

static void jd_key(const char *k) {
    jd_S got;
    jd_rd_S(&got);
    if (strcmp(got, k) != 0) jd_fail("key");
    free(got);
    jd_expect(':');
}

static char *jd_out;
static size_t jd_out_len, jd_out_cap;

static void jd_put(const char *s, size_t n) {
    if (jd_out_len + n > jd_out_cap) {
        while (jd_out_len + n > jd_out_cap) jd_out_cap = jd_out_cap ? jd_out_cap * 2 : 4096;
        jd_out = realloc(jd_out, jd_out_cap);
    }
    memcpy(jd_out + jd_out_len, s, n);
    jd_out_len += n;
}

static void jd_wr_I(jd_I v) { char t[24]; jd_put(t, (size_t)snprintf(t, sizeof t, "%d", v)); }
static void jd_wr_L(jd_L v) { char t[24]; jd_put(t, (size_t)snprintf(t, sizeof t, "%lld", v)); }
static void jd_wr_B(jd_B v) { if (v) jd_put("true", 4); else jd_put("false", 5); }

static void jd_wr_D(jd_D v) {
    char t[32];
    if (!isfinite(v)) { jd_put("null", 4); return; }
    jd_put(t, (size_t)snprintf(t, sizeof t, "%.17g", v));
}

static void jd_wr_S(const char *v) {
    if (!v) { jd_put("null", 4); return; }
    jd_put("\\"", 1);
    for (const unsigned char *c = (const unsigned char *)v; *c; c++) {
        switch (*c) {
            case '"': jd_put("\\\\\\"", 2); break;
            case '\\\\': jd_put("\\\\\\\\", 2); break;
            case '\\n': jd_put("\\\\n", 2); break;
            case '\\r': jd_put("\\\\r", 2); break;
            case '\\t': jd_put("\\\\t", 2); break;
            default:
                if (*c < 0x20) { char t[8]; jd_put(t, (size_t)snprintf(t, sizeof t, "\\\\u%04x", *c)); }
                else jd_put((const char *)c, 1);
        }
    }
    jd_put("\\"", 1);
}
`

function arrayFunctions(type: Extract<TypeRef, { type: 'array' }>): string {
    const key = typeKey(type)
    const name = cType(type)
    const items = typeKey(type.items)
    return `
static void jd_rd_${key}(${name} *v) {
    int cap = 8;
    v->len = 0;
    v->data = malloc((size_t)cap * sizeof *v->data);
    jd_expect('[');
    if (!jd_try(']')) {
        do {
            if (v->len == cap) { cap *= 2; v->data = realloc(v->data, (size_t)cap * sizeof *v->data); }
            jd_rd_${items}(&v->data[v->len++]);
        } while (jd_try(','));
        jd_expect(']');
    }
}

static void jd_wr_${key}(${name} v) {
    jd_put("[", 1);
    for (int i = 0; i < v.len; i++) {
        if (i > 0) jd_put(",", 1);
        jd_wr_${items}(v.data[i]);
    }
    jd_put("]", 1);
}
`
}

// Alias del tipo para main(): escalares con jd_*, arrays con su struct
function mainType(type: TypeRef): string {
    return type.type === 'array' ? cType(type) : 'jd_' + typeKey(type)
}

// Generador: char *caso(...) con los parámetros del problema. Escribe en un búfer propio (guarda y
// restaura el del driver) y regresa el JSON del caso en memoria nueva
function casoFunction(caseSignature: DriverInput['caseSignature']): string {
    if(!caseSignature) return ''
    const params = caseSignature.params.map((param, index) => mainType(param.type) + ' jd_a' + index).join(', ')
    const writes = caseSignature.params.map((param, index) => {
        const key = quote((index > 0 ? ',' : '') + JSON.stringify(param.name) + ':')
        return '    jd_put(' + key + ', strlen(' + key + '));\n    jd_wr_' + typeKey(param.type) + '(jd_a' + index + ');'
    }).join('\n')
    return `
static char *caso(${params}) {
    char *jd_saved = jd_out;
    size_t jd_saved_len = jd_out_len, jd_saved_cap = jd_out_cap;
    jd_out = NULL; jd_out_len = 0; jd_out_cap = 0;
    jd_put("{", 1);
${writes}
    jd_put("}", 2);  /* 2: también el '\\0' final, para regresar un string de C */
    char *jd_json = jd_out;
    jd_out = jd_saved; jd_out_len = jd_saved_len; jd_out_cap = jd_saved_cap;
    return jd_json;
}
`
}

export const buildCProgram: DriverBuilder = ({ signature, source, flags, caseSignature }) => {
    const arrays = collectTypes(withCaseTypes(signature, caseSignature))
        .filter((type): type is Extract<TypeRef, { type: 'array' }> => type.type === 'array')
        .map(arrayFunctions)
        .join('')

    const reads = signature.params.map((param, index) => [
        index > 0 ? '    jd_expect(\',\');' : null,
        '    ' + mainType(param.type) + ' p' + index + ';',
        '    jd_key(' + quote(param.name) + ');',
        '    jd_rd_' + typeKey(param.type) + '(&p' + index + ');',
    ].filter(Boolean).join('\n')).join('\n')

    const args = signature.params.map((_, index) => 'p' + index).join(', ')
    const returns = signature.returns.type === 'string' ? 'const char *' : mainType(signature.returns) + ' '

    const driver = `#include "judge.h"
${RUNTIME}${arrays}${casoFunction(caseSignature)}
#define main judge_user_main
#include "Main.c"
#undef main

// signed: un "#define int long long" del participante no lo cambia
signed main(void) {
    size_t cap = 1 << 16, n = 0, got;
    char *in = malloc(cap);
    while ((got = fread(in + n, 1, cap - n - 1, stdin)) > 0) {
        n += got;
        if (n + 1 == cap) { cap *= 2; in = realloc(in, cap); }
    }
    in[n] = 0;
    jd_p = in;

    jd_expect('{');
${reads}
    jd_expect('}');

    ${returns}jd_result = ${signature.functionName}(${args});
    jd_wr_${typeKey(signature.returns)}(jd_result);

    FILE *f = fopen(${quote(RESULT_PATH)}, "wb");
    if (!f) return 98;
    fwrite(jd_out, 1, jd_out_len, f);
    fclose(f);
    return 0;
}
`

    return {
        files: { 'Main.c': source, 'judge.h': JUDGE_H, 'driver.c': driver },
        compileCmd: ('gcc driver.c -o main ' + flags).trim(),
        runCmd: './main',
    }
}
