import { quote, RESULT_PATH, type DriverBuilder } from './driver.types.js'

// El driver va al final del mismo archivo: la función del participante queda en el mismo
// módulo y no hay que importarla. Los nombres del driver empiezan con _judge para no chocar
export const buildPythonProgram: DriverBuilder = ({ signature, source, caseSignature }) => {
    const args = signature.params.map((param) => '_judge_input[' + quote(param.name) + ']').join(', ')

    // Generador: caso(a, b) arma el JSON del caso (con nombre o en orden, como cualquier función)
    const caso = caseSignature ? [
        '',
        '',
        '# ---- caso(...) del juez: arma el JSON de un caso ----',
        // *args/**kwargs: un parámetro llamado como palabra reservada no rompe la definición
        'def caso(*_judge_args, **_judge_kwargs):',
        '    import json as _judge_json',
        '    _judge_names = [' + caseSignature.params.map((param) => quote(param.name)).join(', ') + ']',
        '    _judge_values = dict(zip(_judge_names, _judge_args))',
        '    _judge_values.update(_judge_kwargs)',
        '    _judge_missing = [n for n in _judge_names if n not in _judge_values]',
        '    if _judge_missing:',
        '        raise TypeError("caso(): falta " + ", ".join(_judge_missing))',
        '    return _judge_json.dumps({n: _judge_values[n] for n in _judge_names}, separators=(",", ":"))',
    ].join('\n') : ''

    const driver = [
        '',
        '',
        '# ---- driver del juez ----',
        'def _judge_main():',
        '    import json as _judge_json, sys as _judge_sys',
        '    _judge_input = _judge_json.loads(_judge_sys.stdin.buffer.read())',
        '    _judge_result = ' + signature.functionName + '(' + args + ')',
        '    with open(' + quote(RESULT_PATH) + ', "w", encoding="utf-8") as _judge_file:',
        '        _judge_json.dump(_judge_result, _judge_file, separators=(",", ":"))',
        '',
        'if __name__ == "__main__":',
        '    _judge_main()',
        '',
    ].join('\n')

    return {
        files: { 'Main.py': source + caso + driver },
        compileCmd: 'python3 -m py_compile Main.py',
        runCmd: 'python3 Main.py',
    }
}
