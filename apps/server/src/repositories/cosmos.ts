import { CosmosClient, type Container, type ItemDefinition } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type {
  QuestionAnswersRecord,
  Quiz,
  QuizSummary,
  SessionRecord,
  SessionSummary,
} from '@power-quiz/shared';
import type { CosmosConfig } from '../config';
import type { QuizRepository, Repositories, SessionRepository } from './types';

export const CONTAINERS = {
  quizzes: { id: 'quizzes', partitionKey: '/ownerId', ttl: false },
  sessions: { id: 'sessions', partitionKey: '/ownerId', ttl: true },
  sessionAnswers: { id: 'sessionAnswers', partitionKey: '/sessionId', ttl: true },
} as const;

const SYSTEM_PROPERTIES = ['_rid', '_self', '_etag', '_attachments', '_ts'] as const;

function stripSystemProperties<T>(resource: T): T {
  const copy = { ...resource } as Record<string, unknown>;
  for (const key of SYSTEM_PROPERTIES) delete copy[key];
  return copy as T;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 404;
}

async function readItem<T extends ItemDefinition>(container: Container, id: string, partitionKey: string) {
  try {
    const { resource } = await container.item(id, partitionKey).read<T>();
    return resource ? stripSystemProperties(resource) : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function deleteItem(container: Container, id: string, partitionKey: string): Promise<boolean> {
  try {
    await container.item(id, partitionKey).delete();
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export class CosmosQuizRepository implements QuizRepository {
  constructor(private readonly container: Container) {}

  async list(ownerId: string): Promise<QuizSummary[]> {
    const { resources } = await this.container.items
      .query<QuizSummary>(
        {
          query:
            'SELECT c.id, c.title, c.description, ARRAY_LENGTH(c.questions) AS questionCount, c.updatedAt ' +
            'FROM c WHERE c.ownerId = @ownerId ORDER BY c.updatedAt DESC',
          parameters: [{ name: '@ownerId', value: ownerId }],
        },
        { partitionKey: ownerId },
      )
      .fetchAll();
    return resources;
  }

  async get(ownerId: string, id: string): Promise<Quiz | null> {
    return readItem<Quiz>(this.container, id, ownerId);
  }

  async save(quiz: Quiz): Promise<Quiz> {
    await this.container.items.upsert(quiz);
    return quiz;
  }

  async delete(ownerId: string, id: string): Promise<boolean> {
    return deleteItem(this.container, id, ownerId);
  }
}

interface SessionSummaryRow extends Omit<SessionSummary, 'winner'> {
  winner?: { nickname: string; score: number } | null;
}

export class CosmosSessionRepository implements SessionRepository {
  constructor(
    private readonly sessions: Container,
    private readonly answers: Container,
  ) {}

  async saveSession(record: SessionRecord): Promise<void> {
    await this.sessions.items.upsert(record);
  }

  async saveQuestionAnswers(record: QuestionAnswersRecord): Promise<void> {
    await this.answers.items.upsert(record);
  }

  async listSessions(ownerId: string): Promise<SessionSummary[]> {
    const { resources } = await this.sessions.items
      .query<SessionSummaryRow>(
        {
          query:
            'SELECT c.id, c.quizId, c.quizTitle, c.status, c.startedAt, c.endedAt, ' +
            'ARRAY_LENGTH(c.players) AS playerCount, ARRAY_LENGTH(c.questions) AS questionCount, ' +
            'c.players[0] AS winner FROM c WHERE c.ownerId = @ownerId ORDER BY c.startedAt DESC',
          parameters: [{ name: '@ownerId', value: ownerId }],
        },
        { partitionKey: ownerId },
      )
      .fetchAll();
    return resources.map((row) => ({
      ...row,
      winner: row.winner ? { nickname: row.winner.nickname, score: row.winner.score } : null,
    }));
  }

  async getSession(ownerId: string, id: string): Promise<SessionRecord | null> {
    return readItem<SessionRecord>(this.sessions, id, ownerId);
  }

  async listQuestionAnswers(sessionId: string): Promise<QuestionAnswersRecord[]> {
    const { resources } = await this.answers.items
      .query<QuestionAnswersRecord>(
        {
          query: 'SELECT * FROM c WHERE c.sessionId = @sessionId ORDER BY c.questionIndex ASC',
          parameters: [{ name: '@sessionId', value: sessionId }],
        },
        { partitionKey: sessionId },
      )
      .fetchAll();
    return resources.map(stripSystemProperties);
  }

  async deleteSession(ownerId: string, id: string): Promise<boolean> {
    const deleted = await deleteItem(this.sessions, id, ownerId);
    if (!deleted) return false;
    const answers = await this.listQuestionAnswers(id);
    await Promise.all(answers.map((record) => deleteItem(this.answers, record.id, id)));
    return true;
  }
}

export async function createCosmosRepositories(config: CosmosConfig): Promise<Repositories> {
  const client = config.key
    ? new CosmosClient({ endpoint: config.endpoint, key: config.key })
    : new CosmosClient({ endpoint: config.endpoint, aadCredentials: new DefaultAzureCredential() });

  if (config.createIfNotExists) {
    // Only possible with key auth (e.g. the local emulator); in Azure the containers come from Bicep.
    const { database } = await client.databases.createIfNotExists({ id: config.database });
    for (const container of Object.values(CONTAINERS)) {
      await database.containers.createIfNotExists({
        id: container.id,
        partitionKey: { paths: [container.partitionKey] },
        ...(container.ttl ? { defaultTtl: -1 } : {}),
      });
    }
  }

  const database = client.database(config.database);
  return {
    quizzes: new CosmosQuizRepository(database.container(CONTAINERS.quizzes.id)),
    sessions: new CosmosSessionRepository(
      database.container(CONTAINERS.sessions.id),
      database.container(CONTAINERS.sessionAnswers.id),
    ),
  };
}
