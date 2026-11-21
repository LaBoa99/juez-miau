import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CsvService, decodeCsvText } from './csv.service.js';

describe('CsvService', () => {
  let service: CsvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsvService],
    }).compile();

    service = module.get<CsvService>(CsvService);
  });

  const parse = (text: string) => service.parse(Buffer.from(text));

  it('parsea filas usando la cabecera como llaves', () => {
    expect(parse('name,email\nAna,ana@x.com\nLuis,luis@x.com\n')).toEqual([
      { name: 'Ana', email: 'ana@x.com' },
      { name: 'Luis', email: 'luis@x.com' },
    ]);
  });

  it('ignora líneas vacías, BOM, CRLF y espacios', () => {
    expect(parse('﻿name, email\r\nAna , ana@x.com\r\n\r\n\r\n')).toEqual([
      { name: 'Ana', email: 'ana@x.com' },
    ]);
  });

  it('respeta comas dentro de comillas', () => {
    expect(parse('name,school\nAna,"Tec, campus norte"\n')).toEqual([
      { name: 'Ana', school: 'Tec, campus norte' },
    ]);
  });

  it('rechaza filas con columnas de más o de menos', () => {
    expect(() => parse('name,email\nAna,ana@x.com\nLuis\n')).toThrow(BadRequestException);
    expect(() => parse('name,email\nAna,ana@x.com,extra\n')).toThrow(BadRequestException);
  });

  it('devuelve un arreglo vacío si solo hay cabecera', () => {
    expect(parse('name,email\n')).toEqual([]);
  });

  describe('acentos y ñ', () => {
    it('lee un CSV guardado por Excel en Windows (Windows-1252)', () => {
      expect(decodeCsvText(Buffer.from('nombre\nPeña Núñez, Ángel ¿?', 'latin1'))).toBe('nombre\nPeña Núñez, Ángel ¿?');
      // 0x91-0x94 son comillas tipográficas en Windows-1252
      expect(decodeCsvText(Buffer.from([0x93, 0x41, 0x94]))).toBe('“A”');
    });

    it('deshace la doble codificación (JosÃ© → José), también si se guardó mal dos veces', () => {
      expect(decodeCsvText(Buffer.from('JosÃ© PeÃ±a MuÃ‘oz Ã\u0081lvaro Â¿quÃ©?'))).toBe('José Peña MuÑoz Álvaro ¿qué?');
      expect(decodeCsvText(Buffer.from('JosÃƒÂ©'))).toBe('José');
    });

    it('repara un archivo mezclado: UTF-8 con algún byte de Windows-1252', () => {
      expect(decodeCsvText(Buffer.concat([Buffer.from('Peña '), Buffer.from([0xf1])]))).toBe('Peña ñ');
    });

    it('no toca texto correcto', () => {
      const ok = 'José Peña Ñandú Ã solo, Àlex, Ãmbar, 50% ± 2';
      expect(decodeCsvText(Buffer.from(ok))).toBe(ok);
    });
  });
});
