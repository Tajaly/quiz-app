import { describe, expect, it } from 'vitest';
import type { SessionDetail } from '@power-quiz/shared';
import { makeQuiz } from '../test/helpers';
import { buildResultsCsv, csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded ')).toBe('" padded "');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(-5)).toBe('-5');
  });

  it('neutralises formulas after semicolons and tabs (semicolon-locale Excel splits cells there)', () => {
    expect(csvCell("x;=cmd|' /C calc'!A0;")).toBe("x;'=cmd|' /C calc'!A0;");
    expect(csvCell('a; =1+1')).toBe("a; '=1+1");
    expect(csvCell('a\t@SUM(A1)')).toBe("a\t'@SUM(A1)");
    expect(csvCell('\tplain')).toBe("'\tplain");
    expect(csvCell('fast; furious')).toBe('fast; furious');
  });
});

describe('toCsv', () => {
  it('writes a BOM and CRLF line endings', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toBe('\uFEFFa,b\r\n1,2\r\n');
  });
});

describe('buildResultsCsv', () => {
  it('lists every player with their answers per question', () => {
    const quiz = makeQuiz();
    const detail: SessionDetail = {
      session: {
        id: 's1',
        ownerId: 'dev-alice',
        quizId: quiz.id,
        quizTitle: quiz.title,
        pin: '123456',
        status: 'completed',
        startedAt: '2026-05-01T10:00:00.000Z',
        endedAt: '2026-05-01T10:10:00.000Z',
        questions: quiz.questions,
        players: [
          {
            playerId: 'p1',
            nickname: 'Alice',
            kart: { model: 'bolt', color: 'red' },
            score: 1700,
            correctCount: 2,
            rank: 1,
          },
          {
            playerId: 'p2',
            nickname: '=Bob',
            kart: { model: 'buggy', color: 'blue' },
            score: 0,
            correctCount: 0,
            rank: 2,
          },
        ],
        questionStats: [],
      },
      answers: [
        {
          id: 's1_0',
          sessionId: 's1',
          questionIndex: 0,
          questionId: 'q1',
          answers: [
            {
              playerId: 'p1',
              nickname: 'Alice',
              optionId: 'a',
              text: null,
              responseMs: 1000,
              correct: true,
              points: 975,
              hidden: false,
            },
            {
              playerId: 'p2',
              nickname: '=Bob',
              optionId: 'b',
              text: null,
              responseMs: 900,
              correct: false,
              points: 0,
              hidden: false,
            },
          ],
        },
        {
          id: 's1_2',
          sessionId: 's1',
          questionIndex: 2,
          questionId: 'q3',
          answers: [
            {
              playerId: 'p1',
              nickname: 'Alice',
              optionId: null,
              text: 'Blue',
              responseMs: 2000,
              correct: null,
              points: 0,
              hidden: true,
            },
          ],
        },
      ],
    };

    const lines = buildResultsCsv(detail).replace('\uFEFF', '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'Rank,Nickname,Score,Correct answers,Q1: Capital of France?,Q1 points,Q2: What is 2 + 2?,Q2 points,Q3: Favourite colour?',
    );
    expect(lines[1]).toBe('1,Alice,1700,2,Paris (correct),975,,,Blue (hidden)');
    expect(lines[2]).toBe("2,'=Bob,0,0,Rome,0,,,");
  });
});
