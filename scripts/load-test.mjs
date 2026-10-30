// Simulates a full race with many phones against a running Power Quiz server, e.g. before an event:
//   npm run load-test -- https://<app>.azurewebsites.net --players 300
// It uses a throwaway guest host key and deletes its quiz and race results afterwards. Run it before,
// not during, a real race: it shares the server (and its single CPU) with the live races.
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { io } from 'socket.io-client';

const MODELS = ['classic', 'rocket', 'buggy', 'bolt', 'truck', 'bubble'];
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
const ACK_TIMEOUT_MS = 15_000;
const STAGE_TIMEOUT_MS = 90_000;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    players: { type: 'string', default: '300' },
    questions: { type: 'string', default: '5' },
    'join-concurrency': { type: 'string', default: '50' },
    'answer-spread': { type: 'string', default: '4000' },
  },
});

function intOption(name, min, max) {
  const value = Number(values[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error(`--${name} must be a whole number from ${min} to ${max}.`);
    process.exit(2);
  }
  return value;
}

const baseUrl = new URL(positionals[0] ?? 'http://localhost:3000').origin;
const playerCount = intOption('players', 1, 1000);
const questionCount = intOption('questions', 1, 50);
const joinConcurrency = intOption('join-concurrency', 1, 1000);
const answerSpreadMs = intOption('answer-spread', 0, 60_000);
const hostKey = `guest:${randomBytes(32).toString('hex')}`;

const failures = [];
const players = [];
const joinMs = [];
const answerMs = new Map();
let raceOver = false;
let latestHost = null;
const hostWaiters = new Set();

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

function summarize(samples) {
  if (samples.length === 0) return 'no samples';
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);
  return `p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, max ${Math.round(sorted[sorted.length - 1])} ms`;
}

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      authorization: `Bearer ${hostKey}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(`${method} /api${path}: HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function connect(auth) {
  // forceNew: one real connection per simulated phone instead of multiplexing them over one.
  const socket = io(baseUrl, { auth, forceNew: true, reconnection: false, timeout: ACK_TIMEOUT_MS });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

async function ack(socket, event, ...args) {
  const response = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, ...args);
  if (!response.ok) throw new Error(`${event}: ${response.code} ${response.error}`);
  return response;
}

async function waitUntil(label, predicate, timeoutMs = STAGE_TIMEOUT_MS) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await sleep(100);
  }
}

/** Resolves with the first host view (and its arrival time) that matches. */
function waitForHost(label, predicate) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (!latestHost || !predicate(latestHost.view)) return;
      cleanup();
      resolve(latestHost);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label} (host is in phase ${latestHost?.view.phase})`));
    }, STAGE_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      hostWaiters.delete(check);
    };
    hostWaiters.add(check);
    check();
  });
}

function buildQuiz() {
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const id = `q${index + 1}`;
    // The last question is open (answer wall) when there is more than one.
    if (index === questionCount - 1 && questionCount > 1) {
      return { id, type: 'open', text: `Load test open question ${index + 1}`, timeLimitSec: 20 };
    }
    return {
      id,
      type: 'mc',
      text: `Load test question ${index + 1}`,
      options: ['a', 'b', 'c', 'd'].map((option) => ({ id: option, text: `Answer ${option.toUpperCase()}` })),
      correctOptionId: 'a',
      timeLimitSec: 20,
    };
  });
  return { title: 'Load test', description: 'Created and deleted by scripts/load-test.mjs', questions };
}

function onPlayerView(player, view) {
  if (view.phase === 'reveal' && view.result) player.revealed.add(view.result.questionIndex);
  if (view.phase === 'final' && view.final) player.finalRank = view.final.rank;
  const question = view.question;
  if (view.phase !== 'question' || !question || player.questionSeenAt.has(question.index)) return;
  player.questionSeenAt.set(question.index, performance.now());
  setTimeout(() => void answer(player, question), 200 + Math.random() * answerSpreadMs);
}

async function answer(player, question) {
  const payload =
    question.type === 'mc'
      ? {
          questionIndex: question.index,
          optionId: question.options[Math.floor(Math.random() * question.options.length)].id,
        }
      : { questionIndex: question.index, text: `Answer from ${player.nickname}` };
  const started = performance.now();
  try {
    await ack(player.socket, 'player:answer', payload);
    if (!answerMs.has(question.index)) answerMs.set(question.index, []);
    answerMs.get(question.index).push(performance.now() - started);
  } catch (error) {
    failures.push(`${player.nickname} could not answer question ${question.index + 1}: ${error.message}`);
  }
}

async function joinPlayer(index, pin) {
  const nickname = `Racer ${String(index + 1).padStart(3, '0')}`;
  const started = performance.now();
  let socket;
  try {
    socket = await connect({ role: 'player' });
    const player = { nickname, socket, questionSeenAt: new Map(), revealed: new Set(), finalRank: null };
    socket.on('player:view', (view) => onPlayerView(player, view));
    const kart = { model: MODELS[index % MODELS.length], color: COLORS[index % COLORS.length] };
    await ack(socket, 'player:join', { pin, nickname, kart });
    joinMs.push(performance.now() - started);
    socket.on('disconnect', (reason) => {
      if (!raceOver) failures.push(`${nickname} was disconnected: ${reason}`);
    });
    players.push(player);
  } catch (error) {
    socket?.close();
    failures.push(`${nickname} could not join: ${error.message}`);
  }
}

async function runRace() {
  const quiz = await api('POST', '/quizzes', buildQuiz());
  const race = await api('POST', '/sessions', { quizId: quiz.id });
  const state = { quizId: quiz.id, sessionId: race.sessionId, host: null };
  try {
    state.host = await connect({ role: 'host', token: hostKey });
    state.host.on('host:view', (view) => {
      latestHost = { view, at: performance.now() };
      for (const check of [...hostWaiters]) check();
    });
    await ack(state.host, 'host:attach', { sessionId: race.sessionId });

    const joinStarted = performance.now();
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(joinConcurrency, playerCount) }, async () => {
        while (next < playerCount) await joinPlayer(next++, race.pin);
      }),
    );
    console.log(
      `Joined ${players.length}/${playerCount} racers in ${seconds(performance.now() - joinStarted)} ` +
        `(connect + join: ${summarize(joinMs)})`,
    );
    await waitForHost('all racers on the starting grid', (view) => view.playerCount === players.length);

    await ack(state.host, 'host:start');
    for (let index = 0; index < questionCount; index++) {
      const opened = await waitForHost(
        `question ${index + 1}`,
        (view) => view.phase === 'question' && view.questionIndex === index,
      );
      const revealed = await waitForHost(
        `reveal ${index + 1}`,
        (view) => view.phase === 'reveal' && view.questionIndex === index,
      );
      const seen = players.flatMap((player) => player.questionSeenAt.get(index) ?? []);
      const fanOutMs = seen.length > 0 ? Math.max(...seen) - Math.min(opened.at, ...seen) : NaN;
      const { answeredCount, type } = revealed.view.reveal;
      console.log(
        `Q${index + 1} (${type}): ${answeredCount}/${players.length} answered, closed after ` +
          `${seconds(revealed.at - opened.at)}; question reached ${seen.length} phones within ` +
          `${Math.round(fanOutMs)} ms; answer ack ${summarize(answerMs.get(index) ?? [])}`,
      );
      if (answeredCount !== players.length) {
        failures.push(`Question ${index + 1}: only ${answeredCount}/${players.length} answers counted`);
      }
      await sleep(500);
      await ack(state.host, 'host:next');
      if (type === 'mc') {
        await waitForHost(`standings ${index + 1}`, (view) => view.phase === 'scoreboard');
        await sleep(500);
        await ack(state.host, 'host:next');
      }
    }

    const final = await waitForHost('podium', (view) => view.phase === 'final');
    await waitUntil('the podium on every phone', () => players.every((player) => player.finalRank !== null));
    const missedReveals = players.filter((player) => player.revealed.size !== questionCount).length;
    console.log(
      `Podium: ${final.view.final.totalPlayers} ranked; podium reached ${players.length} phones; ` +
        `${players.length - missedReveals}/${players.length} phones got every answer reveal`,
    );
    if (missedReveals > 0) failures.push(`${missedReveals} phones missed an answer reveal`);

    raceOver = true;
    // Podium → ended. The results were already written when the podium opened.
    await ack(state.host, 'host:next');
    let detail = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      detail = await api('GET', `/sessions/${race.sessionId}`).catch(() => null);
      if (detail?.session.status === 'completed' && detail.answers.length === questionCount) break;
      await sleep(1000);
    }
    const savedAnswers = detail?.answers.reduce((sum, record) => sum + record.answers.length, 0) ?? 0;
    console.log(
      `Saved results: ${detail?.session.players.length ?? 0} racers, ${detail?.answers.length ?? 0} ` +
        `questions, ${savedAnswers} answers (status ${detail?.session.status ?? 'missing'})`,
    );
    if (detail?.session.status !== 'completed' || detail.session.players.length !== players.length) {
      failures.push('The race results were not saved completely');
    } else if (savedAnswers !== players.length * questionCount) {
      failures.push(`Saved ${savedAnswers} answers, expected ${players.length * questionCount}`);
    }
  } finally {
    raceOver = true;
    for (const player of players) player.socket.close();
    if (state.host?.connected && latestHost?.view.phase !== 'ended') {
      await ack(state.host, 'host:end').catch(() => undefined);
    }
    state.host?.close();
    await api('DELETE', `/sessions/${state.sessionId}`).catch(() => undefined);
    await api('DELETE', `/quizzes/${state.quizId}`).catch((error) =>
      failures.push(`Cleanup failed: ${error.message}`),
    );
  }
}

console.log(`Power Quiz load test: ${playerCount} racers, ${questionCount} questions against ${baseUrl}`);
const started = performance.now();
try {
  await runRace();
} catch (error) {
  failures.push(error.message);
}
console.log(`Finished in ${seconds(performance.now() - started)}; test quiz and results deleted.`);
if (failures.length > 0) {
  console.error(`FAIL – ${failures.length} problem(s):`);
  for (const failure of failures.slice(0, 20)) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
