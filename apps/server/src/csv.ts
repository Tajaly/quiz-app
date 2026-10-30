import type { QuestionAnswersRecord, SessionDetail } from '@power-quiz/shared';

type Cell = string | number | null | undefined;

// Spreadsheet apps execute cells starting with these characters as formulas (CSV injection).
// Locales that use `;` as the list separator (e.g. German Excel) also split cells on `;` and tabs,
// so any segment after such a separator must be neutralised as well.
const FORMULA_SEGMENT = /(^|[;\t\r\n])([ \t]*)(?=[=+\-@])/g;
const LEADING_CONTROL = /^[\t\r]/;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string') {
    text = text.replace(FORMULA_SEGMENT, "$1$2'");
    if (LEADING_CONTROL.test(text)) text = `'${text}`;
  }
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with a UTF-8 byte-order mark so Excel detects the encoding. */
export function toCsv(rows: Cell[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const shorten = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function buildResultsCsv({ session, answers }: SessionDetail): string {
  const byQuestion = new Map<number, Map<string, QuestionAnswersRecord['answers'][number]>>(
    answers.map((record) => [record.questionIndex, new Map(record.answers.map((a) => [a.playerId, a]))]),
  );

  const header: Cell[] = ['Rank', 'Nickname', 'Score', 'Correct answers'];
  session.questions.forEach((question, index) => {
    header.push(`Q${index + 1}: ${shorten(question.text)}`);
    if (question.type === 'mc') header.push(`Q${index + 1} points`);
  });

  const rows = session.players.map((player) => {
    const row: Cell[] = [player.rank, player.nickname, player.score, player.correctCount];
    session.questions.forEach((question, index) => {
      const answer = byQuestion.get(index)?.get(player.playerId);
      if (question.type === 'mc') {
        const option = question.options.find((candidate) => candidate.id === answer?.optionId);
        row.push(option ? `${option.text}${answer?.correct ? ' (correct)' : ''}` : '');
        row.push(answer ? answer.points : '');
      } else {
        row.push(answer?.text ? `${answer.text}${answer.hidden ? ' (hidden)' : ''}` : '');
      }
    });
    return row;
  });

  return toCsv([header, ...rows]);
}
