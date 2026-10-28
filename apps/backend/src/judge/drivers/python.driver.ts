import { quote, RESULT_PATH, type DriverBuilder } from './driver.types.js'

// El driver va al final del mismo archivo: la función del participante queda en el mismo
// módulo y no hay que importarla. Los nombres del driver empiezan con _judge para no chocar
export const buildPythonProgram: DriverBuilder = ({ signature, source }) => {
    const args = signature.params.map((param) => '_judge_input[' + quote(param.name) + ']').join(', ')

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
        files: { 'Main.py': source + driver },
        compileCmd: 'python3 -m py_compile Main.py',
        runCmd: 'python3 Main.py',
    }
}
