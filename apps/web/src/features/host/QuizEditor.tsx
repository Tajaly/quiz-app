import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { LIMITS, TIME_LIMIT_CHOICES_SEC, type Question, type Quiz, type QuizInput } from '@power-quiz/shared';
import { answerStyle } from '../../design/answers';
import { Button } from '../../design/Button';
import { FieldError, SelectField, TextAreaField, TextField } from '../../design/Field';
import { Heading, Notice, Panel } from '../../design/Panel';
import { Icon } from '../../design/sprites/Sprites';
import type { IconName } from '../../design/sprites/icons';
import { Spinner } from '../../design/Widgets';
import { cx } from '../../lib/cx';
import { useQuiz, useSaveQuiz, useStartSession } from '../../lib/queries';
import {
  changeQuestionType,
  duplicateQuestion,
  emptyDraft,
  moveItem,
  newMcQuestion,
  newOpenQuestion,
  newOption,
  toDraft,
  validateDraft,
  type DraftErrors,
} from './editorModel';

function IconButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="p-2 text-mist transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      <Icon name={icon} size={2} />
    </button>
  );
}

function TypeToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        'px-3 py-2 text-sm font-bold uppercase transition-colors',
        active ? 'bg-sun text-ink' : 'bg-night-950 text-mist hover:text-white',
      )}
    >
      {children}
    </button>
  );
}

interface QuestionCardProps {
  question: Question;
  index: number;
  total: number;
  errors: DraftErrors;
  onChange: (updater: (question: Question) => Question) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function QuestionCard({
  question,
  index,
  total,
  errors,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: QuestionCardProps) {
  const error = (field: string) => errors[`question:${question.id}:${field}`];
  return (
    <Panel aria-label={`Question ${index + 1}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="font-pixel text-lg text-sun">Q{index + 1}</span>
        <div role="radiogroup" aria-label="Question type" className="px-frame m-1 flex">
          <TypeToggle
            active={question.type === 'mc'}
            onClick={() => onChange((q) => changeQuestionType(q, 'mc'))}
          >
            Multiple choice
          </TypeToggle>
          <TypeToggle
            active={question.type === 'open'}
            onClick={() => onChange((q) => changeQuestionType(q, 'open'))}
          >
            Open
          </TypeToggle>
        </div>
        <SelectField
          aria-label="Time limit"
          className="w-28"
          value={question.timeLimitSec}
          onChange={(event) => onChange((q) => ({ ...q, timeLimitSec: Number(event.target.value) }))}
        >
          {TIME_LIMIT_CHOICES_SEC.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} s
            </option>
          ))}
        </SelectField>
        <div className="ml-auto flex">
          <IconButton icon="arrowUp" label="Move up" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton
            icon="arrowDown"
            label="Move down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          />
          <IconButton icon="copy" label="Duplicate question" onClick={onDuplicate} />
          <IconButton icon="trash" label="Delete question" onClick={onRemove} />
        </div>
      </div>

      <TextAreaField
        label="Question"
        hint={`${question.text.length}/${LIMITS.questionTextMax}`}
        rows={2}
        maxLength={LIMITS.questionTextMax}
        value={question.text}
        placeholder="Type your question…"
        error={error('text')}
        onChange={(event) => onChange((q) => ({ ...q, text: event.target.value }))}
      />

      {question.type === 'mc' ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-mist">
            Answers – tap <Icon name="check" size={1.4} className="inline" /> to mark the correct one. Empty
            answers are skipped.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {question.options.map((option, optionIndex) => {
              const style = answerStyle(optionIndex);
              const correct = option.id === question.correctOptionId;
              const optionError = errors[`option:${option.id}`];
              return (
                <div key={option.id}>
                  <div
                    className={cx(
                      'px-frame m-1 flex items-center gap-2 p-2',
                      style.className,
                      correct && '[--px-color:var(--color-lime)]',
                    )}
                  >
                    <Icon name={style.icon} size={2.4} />
                    <input
                      aria-label={`Answer ${style.label}`}
                      value={option.text}
                      maxLength={LIMITS.optionTextMax}
                      placeholder={`Answer ${style.label}${optionIndex >= LIMITS.optionsMin ? ' (optional)' : ''}`}
                      className="min-w-0 flex-1 bg-white/95 px-2 py-2 text-lg text-ink placeholder:text-ink/40 focus:outline-none focus-visible:outline-sky"
                      onChange={(event) =>
                        onChange((q) =>
                          q.type === 'mc'
                            ? {
                                ...q,
                                options: q.options.map((o) =>
                                  o.id === option.id ? { ...o, text: event.target.value } : o,
                                ),
                              }
                            : q,
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-pressed={correct}
                      aria-label={`Mark answer ${style.label} as correct`}
                      title="Correct answer"
                      onClick={() =>
                        onChange((q) => (q.type === 'mc' ? { ...q, correctOptionId: option.id } : q))
                      }
                      className={cx(
                        'flex h-10 w-10 shrink-0 items-center justify-center',
                        correct ? 'bg-lime text-ink' : 'bg-black/25 text-white/70 hover:text-white',
                      )}
                    >
                      <Icon name="check" size={2} />
                    </button>
                    {question.options.length > LIMITS.optionsMin && (
                      <button
                        type="button"
                        aria-label={`Remove answer ${style.label}`}
                        title="Remove answer"
                        onClick={() =>
                          onChange((q) => {
                            if (q.type !== 'mc') return q;
                            const options = q.options.filter((o) => o.id !== option.id);
                            const correctOptionId =
                              q.correctOptionId === option.id ? (options[0]?.id ?? '') : q.correctOptionId;
                            return { ...q, options, correctOptionId };
                          })
                        }
                        className="flex h-10 w-8 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
                      >
                        <Icon name="cross" size={1.6} />
                      </button>
                    )}
                  </div>
                  <FieldError>{optionError}</FieldError>
                </div>
              );
            })}
          </div>
          {question.options.length < LIMITS.optionsMax && (
            <Button
              variant="ghost"
              size="sm"
              icon="plus"
              onClick={() =>
                onChange((q) => (q.type === 'mc' ? { ...q, options: [...q.options, newOption()] } : q))
              }
            >
              Add answer
            </Button>
          )}
          <FieldError>{error('options') ?? error('correctOptionId')}</FieldError>
        </div>
      ) : (
        <p className="mt-4 text-mist">
          Players type a short answer (up to {LIMITS.openAnswerMax} characters). Open questions aren’t scored
          – the answers appear with nicknames on the big screen for discussion.
        </p>
      )}
    </Panel>
  );
}

function QuizEditor({ quizId, initial }: { quizId?: string; initial: QuizInput }) {
  const navigate = useNavigate();
  const location = useLocation();
  const save = useSaveQuiz();
  const start = useStartSession();
  const [draft, setDraft] = useState<QuizInput>(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(() =>
    (location.state as { saved?: boolean } | null)?.saved ? { tone: 'success', text: 'Quiz saved!' } : null,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (updater: (current: QuizInput) => QuizInput) => {
    setDraft(updater);
    setDirty(true);
    setMessage(null);
  };
  const updateQuestions = (updater: (questions: Question[]) => Question[]) =>
    update((current) => ({ ...current, questions: updater(current.questions) }));

  const persist = async (): Promise<Quiz | null> => {
    const { data, errors: found } = validateDraft(draft);
    setErrors(found);
    if (!data) {
      setMessage({ tone: 'error', text: 'Almost there – please fix the highlighted fields.' });
      return null;
    }
    try {
      const saved = await save.mutateAsync({ id: quizId, input: data });
      setDraft(toDraft(saved));
      setDirty(false);
      if (!quizId) {
        navigate(`/host/quizzes/${saved.id}`, { replace: true, state: { saved: true } });
      } else {
        setMessage({ tone: 'success', text: 'Quiz saved!' });
      }
      return saved;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Saving failed.' });
      return null;
    }
  };

  const startRace = async () => {
    const saved = dirty || !quizId ? await persist() : { id: quizId };
    if (!saved) return;
    start.mutate(saved.id, {
      onSuccess: ({ sessionId }) => navigate(`/host/live/${sessionId}`),
      onError: (error) => setMessage({ tone: 'error', text: error.message }),
    });
  };

  const busy = save.isPending || start.isPending;

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-wrap items-center gap-4">
        <Link to="/host" className="inline-flex items-center gap-2 text-mist hover:text-white">
          <Icon name="back" size={1.6} /> Quizzes
        </Link>
        <Heading className="text-lg sm:text-2xl">{quizId ? 'Edit quiz' : 'New quiz'}</Heading>
      </div>

      <Panel>
        <div className="grid gap-4">
          <TextField
            label="Title"
            value={draft.title}
            maxLength={LIMITS.quizTitleMax}
            placeholder="e.g. Friday team quiz"
            error={errors.title}
            onChange={(event) => update((current) => ({ ...current, title: event.target.value }))}
          />
          <TextAreaField
            label="Description (optional)"
            rows={2}
            value={draft.description}
            maxLength={LIMITS.quizDescriptionMax}
            error={errors.description}
            onChange={(event) => update((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
      </Panel>

      {draft.questions.map((question, index) => (
        <QuestionCard
          key={question.id}
          question={question}
          index={index}
          total={draft.questions.length}
          errors={errors}
          onChange={(updater) =>
            updateQuestions((questions) => questions.map((q) => (q.id === question.id ? updater(q) : q)))
          }
          onMove={(delta) => updateQuestions((questions) => moveItem(questions, index, index + delta))}
          onDuplicate={() =>
            updateQuestions((questions) => {
              const next = [...questions];
              next.splice(index + 1, 0, duplicateQuestion(question));
              return next;
            })
          }
          onRemove={() => updateQuestions((questions) => questions.filter((q) => q.id !== question.id))}
        />
      ))}

      {draft.questions.length === 0 && <Notice>No questions yet – add your first one below.</Notice>}
      <FieldError>{errors.questions}</FieldError>

      {draft.questions.length < LIMITS.questionsPerQuizMax && (
        <div className="flex flex-wrap gap-1">
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => updateQuestions((questions) => [...questions, newMcQuestion()])}
          >
            Multiple choice question
          </Button>
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => updateQuestions((questions) => [...questions, newOpenQuestion()])}
          >
            Open question
          </Button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t-4 border-ink bg-night-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1" aria-live="polite">
            {message ? (
              <span className={cx('font-bold', message.tone === 'error' ? 'text-[#ff8a8f]' : 'text-lime')}>
                {message.text}
              </span>
            ) : (
              <span className="text-sm text-mist">
                {draft.questions.length} {draft.questions.length === 1 ? 'question' : 'questions'}
                {dirty ? ' · unsaved changes' : ''}
              </span>
            )}
          </div>
          <Button variant="secondary" icon="download" onClick={() => void persist()} disabled={busy}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            icon="play"
            onClick={() => void startRace()}
            disabled={busy || draft.questions.length === 0}
          >
            {start.isPending ? 'Starting…' : 'Start race'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function QuizEditorPage() {
  const { quizId } = useParams();
  const quiz = useQuiz(quizId);
  if (quizId && quiz.isPending) return <Spinner />;
  if (quizId && quiz.isError)
    return <Notice tone="error">Could not load this quiz: {quiz.error.message}</Notice>;
  const initial = quizId && quiz.data ? toDraft(quiz.data) : emptyDraft();
  return <QuizEditor key={quizId ?? 'new'} quizId={quizId} initial={initial} />;
}
