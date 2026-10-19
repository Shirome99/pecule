// Tests unitaires du parseur CSV (aucun navigateur : Playwright sert ici de simple lanceur de tests).
import { test, expect } from '@playwright/test';
import {
  buildCategoryIndex, buildRows, decodeBytes, detectSeparator, dupKey, guessColumns, guessColumnsFromData, hasHeader,
  parseAmount, parseCsv, parseDate, significantWord,
} from '../src/csv';

test.describe('parseur CSV', () => {
  test('montants FR et internationaux', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('1 234,56 €')).toBe(1234.56);
    expect(parseAmount('-1234.56')).toBe(-1234.56);
    expect(parseAmount('-1.234,56')).toBe(-1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('+12')).toBe(12);
    expect(parseAmount('(12,50)')).toBe(-12.5);
    expect(parseAmount('12,50-')).toBe(-12.5);
    expect(parseAmount('-12,30')).toBe(-12.3);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12/03/2026')).toBeNull();
  });

  test('dates JJ/MM/AAAA et AAAA-MM-JJ', () => {
    expect(parseDate('05/03/2026')).toBe('2026-03-05');
    expect(parseDate('5/3/26')).toBe('2026-03-05');
    expect(parseDate('05.03.2026')).toBe('2026-03-05');
    expect(parseDate('2026-03-05')).toBe('2026-03-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('Date')).toBeNull();
  });

  test('séparateur, guillemets et lignes vides', () => {
    expect(detectSeparator('date;libelle;montant\n2026-01-01;"a, b";-1,00')).toBe(';');
    expect(detectSeparator('date,label,amount\n2026-01-01,"a; b",-1.00')).toBe(',');
    const rows = parseCsv('a;b;c\r\n"x ""y""";"multi\nligne";3\r\n\r\n;;\n', ';');
    expect(rows).toEqual([['a', 'b', 'c'], ['x "y"', 'multi\nligne', '3']]);
  });

  test('encodage UTF-8 (avec BOM) ou Windows-1252', () => {
    const utf8 = new TextEncoder().encode('﻿libellé;montant');
    expect(decodeBytes(utf8.buffer as ArrayBuffer)).toEqual({ text: 'libellé;montant', encoding: 'UTF-8' });
    const latin = new Uint8Array([0x6c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]); // « libellé » en Windows-1252
    expect(decodeBytes(latin.buffer)).toEqual({ text: 'libellé', encoding: 'Windows-1252' });
  });

  test('détection des colonnes', () => {
    expect(guessColumns(['Date opération', 'Libellé', 'Débit', 'Crédit'])).toMatchObject({ date: 0, label: 1, amount: -1, debit: 2, credit: 3 });
    expect(guessColumns(['date', 'libelle', 'montant', 'categorie', 'compte'])).toMatchObject({ date: 0, label: 1, amount: 2, category: 3 });
    const data = [['-12,00', '01/03/2026', 'CB MONOPRIX PARIS'], ['1 500,00', '02/03/2026', 'VIR SALAIRE ACME']];
    expect(hasHeader(data)).toBe(false);
    expect(guessColumnsFromData(data)).toMatchObject({ date: 1, amount: 0, label: 2 });
  });

  test('mot significatif et catégorisation', () => {
    expect(significantWord('CB CARREFOUR 12/03')).toBe('carrefour');
    expect(significantWord('PRLV SEPA Netflix.com')).toBe('netflix');
    expect(significantWord('Café du coin')).toBe('cafe');
    expect(significantWord('CB 12/03')).toBeNull();
    const index = buildCategoryIndex([
      { label: 'Carrefour Market', amount: -10, category_id: 2 },
      { label: 'CB CARREFOUR', amount: -20, category_id: 2 },
      { label: 'Carrefour (cadeau)', amount: -5, category_id: 8 },
      { label: 'Sans cat', amount: -5, category_id: null },
    ]);
    expect(index.get('carrefour')).toBe(2);
    expect(index.has('sans')).toBe(false);
  });

  test('construction des lignes : débit/crédit, doublons, virements, erreurs', () => {
    const categories = [
      { id: 2, name: 'Courses', kind: 'expense' as const },
      { id: 10, name: 'Salaire', kind: 'income' as const },
    ];
    const index = new Map([['carrefour', 2], ['salaire', 10]]);
    const existing = new Set([dupKey('2026-03-02', -30, 'cb  Carrefour')]);
    const rows = [
      ['01/03/2026', 'VIR SALAIRE ACME', '', '2 000,00', ''],
      ['02/03/2026', 'CB CARREFOUR', '30,00', '', ''],
      ['03/03/2026', 'CB CARREFOUR', '-12,00', '', ''],
      ['04/03/2026', 'Épargne', '50,00', '', 'Virement'],
      ['xx', 'Erreur', '1,00', '', ''],
      ['05/03/2026', 'Remboursement Carrefour', '', '5,00', ''],
    ];
    const out = buildRows(rows, { date: 0, label: 1, amount: -1, debit: 2, credit: 3, category: 4 }, {
      mode: 'split', categories, index, existing, firstLine: 2,
    });
    expect(out.map((r) => [r.line, r.amount, r.category_id, r.status])).toEqual([
      [2, 2000, 10, 'new'],
      [3, -30, 2, 'duplicate'],
      [4, -12, 2, 'new'],
      [5, -50, null, 'transfer'],
      [6, -1, null, 'invalid'],
      [7, 5, null, 'new'], // catégorie de dépense non proposée pour un crédit
    ]);
    expect(out[4].error).toBe('Date illisible');
  });
});
