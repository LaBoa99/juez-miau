import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CsvService } from './csv.service.js';

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
});
