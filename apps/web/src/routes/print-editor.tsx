import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';

import type { Question, QuestionType } from '@/lib/assessment-api';
import { useAssessment, useDraftQuestions } from '@/lib/assessment-api';
import { useLocalStorage } from '@/lib/use-local-storage';
import { useLocale } from '@/ui/locale';
import { AssessmentAccessState } from '@/ui/AssessmentAccessState';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MathText } from '@/components/math-text';

type PrintQuestionSettings = {
  lines: number;
  showAnswerLines: boolean;
  choiceLayout: 'single' | 'two-column';
};

type PrintSettings = {
  className: string;
  date: string;
  nameLabel: string;
  showPoints: boolean;
  paperStyle?: 'white' | 'warm';
};

type PrintQuestion = Question & { id: string };

const DEFAULT_LINE_COUNTS: Record<QuestionType, number> = {
  multiple_choice: 0,
  true_false: 0,
  short_answer: 2,
  written: 6,
  other: 2,
};

const getDefaultSettings = (question: Question): PrintQuestionSettings => ({
  lines: DEFAULT_LINE_COUNTS[question.type] ?? 0,
  showAnswerLines: question.type === 'short_answer' || question.type === 'written',
  choiceLayout: 'single',
});

const getPreviewChoices = (question: Question, copy: PrintCopy) => {
  if (question.choices && question.choices.length > 0) {
    return question.choices;
  }
  if (question.type === 'true_false') {
    return [copy.labels.trueLabel, copy.labels.falseLabel];
  }
  return [];
};

type PrintCopy = {
  title: string;
  actions: {
    printSettings: string;
    print: string;
    close: string;
    openIndex: string;
    backToEditor: string;
  };
  labels: {
    paperStyle: string;
    paperWhite: string;
    paperWhiteHint: string;
    paperWarm: string;
    paperWarmHint: string;
    printAnswerLines: string;
    showPoints: string;
    fitPages: (value: number) => string;
    className: string;
    date: string;
    name: string;
    answerLines: string;
    answerSpace: string;
    answerSpaceHint: string;
    answerSpaceReduced: string;
    tooTallWarning: string;
    layout: string;
    layoutSingle: string;
    layoutDouble: string;
    noQuestions: string;
    trueLabel: string;
    falseLabel: string;
    pageLabel: (value: number) => string;
  };
  questionTypeLabels: Record<QuestionType, string>;
};

const PRINT_COPY_EN = {
  title: 'Print editor',
  actions: {
    printSettings: 'Print settings',
    print: 'Print',
    close: 'Close',
    openIndex: 'Questions',
    backToEditor: 'Back to editor',
  },
  labels: {
    paperStyle: 'Paper style',
    paperWhite: 'White',
    paperWhiteHint: 'Clean and ink-saving',
    paperWarm: 'Warm',
    paperWarmHint: 'Cream paper · more ink',
    printAnswerLines: 'Show lines',
    showPoints: 'Show points',
    fitPages: (value: number) => `${value} page(s)`,
    className: 'Class',
    date: 'Date',
    name: 'Name',
    answerLines: 'Answer lines',
    answerSpace: 'Answer space',
    answerSpaceHint: 'Use + to add more lines',
    answerSpaceReduced: 'Answer space reduced to fit the page.',
    tooTallWarning: 'This question is too tall for one page.',
    layout: 'Layout',
    layoutSingle: 'Single column',
    layoutDouble: 'Two columns',
    noQuestions: 'No questions yet.',
    trueLabel: 'True',
    falseLabel: 'False',
    pageLabel: (value: number) => `Page ${value}`,
  },
  questionTypeLabels: {
    multiple_choice: 'Multiple choice',
    true_false: 'True/False',
    short_answer: 'Short answer',
    written: 'Written',
    other: 'Other',
  } as Record<QuestionType, string>,
} as const;

const PRINT_COPY_JA: PrintCopy = {
  title: 'プリント編集',
  actions: {
    printSettings: '印刷設定',
    print: '印刷',
    close: '閉じる',
    openIndex: '設問一覧',
    backToEditor: 'エディタへ戻る',
  },
  labels: {
    paperStyle: '用紙のスタイル',
    paperWhite: '白',
    paperWhiteHint: 'すっきり・インクを節約',
    paperWarm: 'ウォーム',
    paperWarmHint: 'クリーム色・インク使用量が増えます',
    printAnswerLines: '白線を表示',
    showPoints: '配点を表示',
    fitPages: (value: number) => `${value}ページ`,
    className: 'クラス',
    date: '日付',
    name: '氏名',
    answerLines: '解答行数',
    answerSpace: '解答スペース',
    answerSpaceHint: '＋で行を追加します',
    answerSpaceReduced: 'ページに収まるように行数を減らしました。',
    tooTallWarning: 'この設問は1ページに収まりません。',
    layout: '配置',
    layoutSingle: '1列',
    layoutDouble: '2列',
    noQuestions: '設問がありません。',
    trueLabel: '正しい',
    falseLabel: '誤り',
    pageLabel: (value: number) => `ページ ${value}`,
  },
  questionTypeLabels: {
    multiple_choice: '選択式',
    true_false: '正誤',
    short_answer: '短答',
    written: '記述',
    other: 'その他',
  },
};

export const PrintEditorRoute = () => {
  const { assessmentId } = useParams({ from: '/print-editor/$assessmentId' });
  const navigate = useNavigate();
  const { locale } = useLocale();
  const copy = locale === 'ja' ? PRINT_COPY_JA : PRINT_COPY_EN;

  const {
    data: assessment,
    isLoading: isAssessmentLoading,
    error: assessmentError,
    refetch: refetchAssessment,
  } = useAssessment(assessmentId);
  const {
    data: draftQuestionsData,
    isLoading: isQuestionsLoading,
    error: questionsError,
    refetch: refetchQuestions,
  } = useDraftQuestions(assessmentId);

  const questions = useMemo<PrintQuestion[]>(() => {
    const list = draftQuestionsData?.questions ?? [];
    return [...list]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((question, index) => ({ ...question, id: question.id ?? `question-${index}` }));
  }, [draftQuestionsData?.questions]);

  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const [focusedQuestionId, setFocusedQuestionId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [pageHeight, setPageHeight] = useState(1018);
  const [questionOffsets, setQuestionOffsets] = useState<Record<string, number>>({});
  const [tooTallQuestions, setTooTallQuestions] = useState<Record<string, boolean>>({});
  const [cappedQuestions, setCappedQuestions] = useState<Record<string, boolean>>({});

  const [printSettings, setPrintSettings] = useLocalStorage<PrintSettings>(
    `print-settings-${assessmentId}`,
    {
      className: '',
      date: '',
      nameLabel: copy.labels.name,
      showPoints: false,
      paperStyle: 'white',
    },
  );

  const [questionSettings, setQuestionSettings] = useLocalStorage<
    Record<string, PrintQuestionSettings>
  >(`print-question-settings-${assessmentId}`, {});

  const previewRef = useRef<HTMLDivElement | null>(null);
  const questionsWrapperRef = useRef<HTMLDivElement | null>(null);
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarIndexRef = useRef<HTMLDivElement | null>(null);
  const modalIndexRef = useRef<HTMLDivElement | null>(null);
  const focusPulseTimeoutRef = useRef<number | null>(null);

  const activeSelectedQuestionId =
    selectedQuestionId && questions.some((question) => question.id === selectedQuestionId)
      ? selectedQuestionId
      : (questions[0]?.id ?? null);
  const selectedQuestion =
    questions.find((question) => question.id === activeSelectedQuestionId) ?? null;
  const paperStyle = printSettings.paperStyle === 'warm' ? 'warm' : 'white';

  useEffect(() => {
    return () => {
      if (focusPulseTimeoutRef.current) {
        window.clearTimeout(focusPulseTimeoutRef.current);
      }
    };
  }, []);

  const jumpToQuestion = (questionId: string, shouldCloseIndex = false) => {
    questionRefs.current[questionId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
    setSelectedQuestionId(questionId);
    setFocusedQuestionId(questionId);
    if (focusPulseTimeoutRef.current) {
      window.clearTimeout(focusPulseTimeoutRef.current);
    }
    focusPulseTimeoutRef.current = window.setTimeout(() => {
      setFocusedQuestionId((current) => (current === questionId ? null : current));
      focusPulseTimeoutRef.current = null;
    }, 900);

    if (shouldCloseIndex) {
      setIsIndexOpen(false);
    }
  };

  const openIndex = () => {
    setIsSettingsOpen(false);
    setIsIndexOpen(true);
  };

  const openSettings = () => {
    setIsIndexOpen(false);
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    if (!questions.length) return;
    setQuestionSettings((current) => {
      const next = { ...current };
      questions.forEach((question) => {
        const existingSettings = next[question.id];
        if (!existingSettings) {
          next[question.id] = getDefaultSettings(question);
          return;
        }

        if (typeof existingSettings.showAnswerLines !== 'boolean') {
          next[question.id] = {
            ...existingSettings,
            showAnswerLines: question.type === 'short_answer' || question.type === 'written',
          };
        }
      });
      return next;
    });
  }, [questions, setQuestionSettings]);

  useEffect(() => {
    if (typeof printSettings.showPoints === 'boolean') return;
    setPrintSettings((current) => ({ ...current, showPoints: false }));
  }, [printSettings.showPoints, setPrintSettings]);

  useLayoutEffect(() => {
    if (!previewRef.current) return;

    const update = () => {
      if (!previewRef.current) return;
      const width = previewRef.current.clientWidth || 720;
      const nextPageHeight = Math.round(width * 1.414);
      setPageHeight(nextPageHeight);
      const contentHeight = previewRef.current.scrollHeight;
      const pages = Math.max(1, Math.ceil(contentHeight / nextPageHeight));
      setPageCount(pages);
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(previewRef.current);
    return () => resizeObserver.disconnect();
  }, [questions, questionSettings, printSettings, activeSelectedQuestionId]);

  useLayoutEffect(() => {
    if (!previewRef.current || !questionsWrapperRef.current) return;
    if (!questions.length) return;

    const gap = 24;
    const pageTopPadding = 48;
    const pageBottomPadding = 56;
    const baseTop = questionsWrapperRef.current.offsetTop;
    const availableFirst = Math.max(0, pageHeight - pageBottomPadding - baseTop);
    const availableOther = Math.max(0, pageHeight - pageTopPadding - pageBottomPadding);

    const nextOffsets: Record<string, number> = {};
    const nextWarnings: Record<string, boolean> = {};
    const cappedUpdates: Record<string, boolean> = {};
    const nextSettings: Record<string, PrintQuestionSettings> = {};
    let hasSettingsUpdate = false;
    let hasCappedUpdate = false;

    const getMaxLines = (
      available: number,
      baseHeight: number,
      lineHeight: number,
      lineGap: number,
    ) => {
      const usable = available - baseHeight;
      if (usable <= 0) return 0;
      const total = lineHeight + lineGap;
      if (total <= 0) return 0;
      return Math.max(0, Math.floor((usable + lineGap) / total));
    };

    let currentY = baseTop;
    questions.forEach((question) => {
      const node = questionRefs.current[question.id];
      if (!node) return;
      const settings = questionSettings[question.id] ?? getDefaultSettings(question);
      const height = node.offsetHeight;
      let adjustedHeight = height;

      const pageIndex = Math.floor(currentY / pageHeight);
      const pageEnd = (pageIndex + 1) * pageHeight - pageBottomPadding;
      const pageStart = pageIndex === 0 ? baseTop : pageIndex * pageHeight + pageTopPadding;
      const available = pageIndex === 0 ? availableFirst : availableOther;

      const answerBlock = node.querySelector('[data-answer-block]') as HTMLDivElement | null;
      if (settings.lines > 0 && answerBlock) {
        const lineEls = answerBlock.querySelectorAll('.answer-line');
        const lineHeight = lineEls[0]?.getBoundingClientRect().height ?? 0;
        const secondLine = lineEls.item(1);
        const lineGap = secondLine
          ? parseFloat(window.getComputedStyle(secondLine).marginTop || '0')
          : 0;
        const blockHeight = answerBlock.getBoundingClientRect().height;
        const baseHeight = height - blockHeight;
        const canFitBaseOnCurrent = currentY + baseHeight <= pageEnd;
        const maxLinesHere = getMaxLines(available, baseHeight, lineHeight, lineGap);
        const maxLinesNext = getMaxLines(availableOther, baseHeight, lineHeight, lineGap);
        const targetMax = canFitBaseOnCurrent ? maxLinesHere : maxLinesNext;

        if (targetMax < settings.lines) {
          const nextLines = Math.max(0, targetMax);
          nextSettings[question.id] = { ...settings, lines: nextLines };
          hasSettingsUpdate = true;
          cappedUpdates[question.id] = true;
          hasCappedUpdate = true;
          const lineBlockHeight =
            nextLines > 0 ? nextLines * lineHeight + (nextLines - 1) * lineGap : 0;
          adjustedHeight = baseHeight + lineBlockHeight;
        }
      }

      nextWarnings[question.id] = adjustedHeight > availableOther;

      if (currentY < pageStart) {
        currentY = pageStart;
      }

      if (currentY + adjustedHeight > pageEnd) {
        const nextStart = (pageIndex + 1) * pageHeight + pageTopPadding;
        nextOffsets[question.id] = nextStart - currentY;
        currentY = nextStart + adjustedHeight + gap;
      } else {
        nextOffsets[question.id] = 0;
        currentY = currentY + adjustedHeight + gap;
      }
    });

    const offsetsChanged = Object.keys(nextOffsets).some(
      (key) => nextOffsets[key] !== questionOffsets[key],
    );
    const warningsChanged = questions.some(
      (question) => nextWarnings[question.id] !== tooTallQuestions[question.id],
    );

    const frame = window.requestAnimationFrame(() => {
      if (offsetsChanged) {
        setQuestionOffsets(nextOffsets);
      }
      if (warningsChanged) {
        setTooTallQuestions(nextWarnings);
      }
      if (hasCappedUpdate) {
        setCappedQuestions((current) => ({ ...current, ...cappedUpdates }));
      }
    });
    if (hasSettingsUpdate) {
      setQuestionSettings((current) => ({ ...current, ...nextSettings }));
    }

    return () => window.cancelAnimationFrame(frame);
  }, [
    pageHeight,
    questions,
    questionOffsets,
    tooTallQuestions,
    questionSettings,
    setQuestionSettings,
  ]);

  useEffect(() => {
    if (!activeSelectedQuestionId) return;
    const selector = `[data-question-id="${activeSelectedQuestionId}"]`;
    sidebarIndexRef.current
      ?.querySelector<HTMLButtonElement>(selector)
      ?.scrollIntoView({ block: 'nearest' });
    modalIndexRef.current
      ?.querySelector<HTMLButtonElement>(selector)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeSelectedQuestionId, isIndexOpen]);

  const handleLineChange = (questionId: string, delta: number) => {
    setQuestionSettings((current) => {
      const existing = current[questionId];
      if (!existing) return current;
      const nextLines = Math.min(12, Math.max(0, existing.lines + delta));
      return { ...current, [questionId]: { ...existing, lines: nextLines } };
    });
    setCappedQuestions((current) => ({ ...current, [questionId]: false }));
  };

  const handleLayoutChange = (
    questionId: string,
    layout: PrintQuestionSettings['choiceLayout'],
  ) => {
    setQuestionSettings((current) => {
      const existing = current[questionId];
      if (!existing) return current;
      return { ...current, [questionId]: { ...existing, choiceLayout: layout } };
    });
  };

  const handleShowAnswerLinesChange = (questionId: string, value: boolean) => {
    setQuestionSettings((current) => {
      const existing = current[questionId];
      if (!existing) return current;
      return { ...current, [questionId]: { ...existing, showAnswerLines: value } };
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBackToEditor = () => {
    void navigate({ to: '/editor/$assessmentId', params: { assessmentId } });
  };

  const previewBackground = {
    backgroundImage:
      `linear-gradient(to bottom, transparent ${pageHeight - 1}px, rgba(0,0,0,0.08) ${pageHeight - 1}px, rgba(0,0,0,0.08) ${pageHeight}px)`.replace(
        /\s+/g,
        ' ',
      ),
    backgroundSize: `100% ${pageHeight}px`,
  } as const;

  const loadError = assessmentError || questionsError;
  if (loadError) {
    return (
      <AssessmentAccessState
        error={loadError}
        onRetry={() => void Promise.all([refetchAssessment(), refetchQuestions()])}
      />
    );
  }

  return (
    <section className="print-shell space-y-5 bg-gradient-to-b from-[#f6f1e8] via-white to-[#fcfaf5]">
      <header className="print-hidden sticky top-0 z-20 rounded-2xl border border-[#e2ddd5] bg-[#fcfbf8]/90 px-5 py-2 shadow-sm backdrop-blur md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              {copy.title}
            </p>
            <h1 className="mt-0.5 text-xl font-semibold text-foreground md:text-2xl">
              {assessment?.title ?? '—'}
            </h1>
            <div className="mt-1 inline-flex items-center rounded-full border border-[#e2ddd5] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6b5c4d]">
              {copy.labels.fitPages(pageCount)}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="xs" onClick={handleBackToEditor}>
              {copy.actions.backToEditor}
            </Button>
            <Button variant="outline" size="xs" onClick={openSettings}>
              {copy.actions.printSettings}
            </Button>
            <Button size="sm" onClick={handlePrint}>
              {copy.actions.print}
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="print-stage-wrapper py-1 lg:py-0">
          {isAssessmentLoading || isQuestionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.labels.noQuestions}</p>
          ) : (
            <div className="relative">
              <div
                ref={previewRef}
                className="print-preview print-paper relative mx-auto w-full max-w-[780px] rounded-xl border border-[#e2ddd5] text-sm shadow-sm"
                data-paper-style={paperStyle}
                style={previewBackground}
              >
                <div className="print-page px-10 pb-14 pt-12">
                  <div className="space-y-2">
                    <h2 className="print-header-title text-xl font-semibold text-foreground">
                      {assessment?.title ?? ''}
                    </h2>
                    <div className="print-meta-grid grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
                      <div>
                        <span className="font-semibold text-foreground">
                          {printSettings.nameLabel}
                        </span>
                        <span className="ml-2">________________</span>
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">
                          {copy.labels.className}
                        </span>
                        <span className="ml-2">{printSettings.className || '—'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">{copy.labels.date}</span>
                        <span className="ml-2">{printSettings.date || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div ref={questionsWrapperRef} className="mt-8 flex flex-col gap-6">
                    {questions.map((question, index) => {
                      const id = question.id;
                      const settings = questionSettings[id] ?? getDefaultSettings(question);
                      const choices = getPreviewChoices(question, copy);
                      const isSelected = id === activeSelectedQuestionId;
                      return (
                        <div
                          key={id}
                          ref={(node) => {
                            questionRefs.current[id] = node;
                          }}
                          style={{ marginTop: questionOffsets[id] ?? 0 }}
                          onClick={() => setSelectedQuestionId(id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              setSelectedQuestionId(id);
                            }
                          }}
                          className={`print-question-card scroll-mt-24 border-l-2 px-4 py-4 transition-colors duration-200 ${
                            isSelected ? 'border-l-[#c1b3a0]' : 'border-l-transparent'
                          } ${focusedQuestionId === id ? 'border-l-[#d6aa7b]' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="print-question-number text-xs font-semibold">
                              {index + 1}
                              {printSettings.showPoints && typeof question.points === 'number'
                                ? locale === 'ja'
                                  ? `（${question.points}点）`
                                  : ` (${question.points} pts)`
                                : ''}
                            </span>
                            {cappedQuestions[id] ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                {copy.labels.answerSpaceReduced}
                              </span>
                            ) : null}
                          </div>
                          <p className="print-question-prompt mt-2 text-sm font-medium">
                            <MathText text={question.prompt} />
                          </p>
                          {choices.length > 0 ? (
                            <div
                              className={
                                settings.choiceLayout === 'two-column'
                                  ? 'print-choice-layout-two-column mt-3 grid gap-2 text-sm md:grid-cols-2'
                                  : 'mt-3 grid gap-2 text-sm'
                              }
                            >
                              {choices.map((choice, choiceIndex) => (
                                <div key={`${id}-choice-${choiceIndex}`} className="flex gap-2">
                                  <span className="print-choice-label text-xs font-semibold">
                                    {String.fromCharCode(65 + choiceIndex)}.
                                  </span>
                                  <MathText text={choice} />
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {settings.lines > 0 ? (
                            <div className="mt-4 space-y-2" data-answer-block>
                              {Array.from({ length: settings.lines }).map((_, lineIndex) => (
                                <div
                                  key={`${id}-line-${lineIndex}`}
                                  className={`answer-line ${settings.showAnswerLines ? '' : 'answer-line-hidden'}`}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="print-hidden pointer-events-none absolute left-1/2 top-0 w-full max-w-[780px] -translate-x-1/2">
                {Array.from({ length: pageCount }).map((_, index) => (
                  <div
                    key={`page-marker-${index}`}
                    className="absolute left-0 right-0 border-t border-dashed border-[#e2ddd5]"
                    style={{ top: `${pageHeight * (index + 1)}px` }}
                  >
                    <span className="-mt-3 inline-block rounded-full border border-[#ddd2c3] bg-[#fffdf9] px-2 py-0.5 text-[0.65rem] text-[#6b5c4d] shadow-sm">
                      {copy.labels.pageLabel(index + 1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="print-hidden rounded-2xl border border-[#e2ddd5] bg-gradient-to-b from-[#f8f2e8] via-[#fdf9f2] to-[#f6eee1] p-4 shadow-sm lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {copy.actions.openIndex}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                {selectedQuestion ? copy.questionTypeLabels[selectedQuestion.type] : '—'}
              </h2>
              <p className="mt-1 text-xs text-[#7f7468]">
                {questions.findIndex((question) => question.id === activeSelectedQuestionId) + 1}/
                {questions.length}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openIndex}>
              {copy.actions.openIndex}
            </Button>
          </div>

          <div ref={sidebarIndexRef} className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
            {questions.map((question, index) => {
              const id = question.id;
              return (
                <button
                  key={`sidebar-index-${id}`}
                  data-question-id={id}
                  type="button"
                  onClick={() => {
                    jumpToQuestion(id);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                    id === activeSelectedQuestionId
                      ? 'border-[#c1b3a0] bg-[#fffcf7] text-[#4b433b] shadow-sm'
                      : 'border-[#e2ddd5] bg-white text-muted-foreground hover:border-[#3a7b7d]/40'
                  }`}
                >
                  <span>
                    {index + 1}. {copy.questionTypeLabels[question.type]}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedQuestion ? (
            <div className="mt-6 space-y-4">
              {selectedQuestion.type === 'short_answer' || selectedQuestion.type === 'written' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-[#e2ddd5] bg-white/70 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      {copy.labels.printAnswerLines}
                    </p>
                    <Button
                      size="xs"
                      variant={
                        questionSettings[selectedQuestion.id]?.showAnswerLines
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() =>
                        handleShowAnswerLinesChange(
                          selectedQuestion.id,
                          !(questionSettings[selectedQuestion.id]?.showAnswerLines ?? true),
                        )
                      }
                    >
                      {questionSettings[selectedQuestion.id]?.showAnswerLines ? 'ON' : 'OFF'}
                    </Button>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    {copy.labels.answerSpace}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLineChange(selectedQuestion.id, -1)}
                      disabled={!(questionSettings[selectedQuestion.id]?.showAnswerLines ?? true)}
                    >
                      -
                    </Button>
                    <span className="min-w-[2rem] text-center text-sm font-semibold">
                      {questionSettings[selectedQuestion.id]?.lines ?? 0}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLineChange(selectedQuestion.id, 1)}
                      disabled={!(questionSettings[selectedQuestion.id]?.showAnswerLines ?? true)}
                    >
                      +
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{copy.labels.answerSpaceHint}</p>
                  {cappedQuestions[selectedQuestion.id] ? (
                    <p className="text-xs text-amber-700">{copy.labels.answerSpaceReduced}</p>
                  ) : null}
                  {tooTallQuestions[selectedQuestion.id] ? (
                    <p className="text-xs text-amber-700">{copy.labels.tooTallWarning}</p>
                  ) : null}
                </div>
              ) : null}

              {selectedQuestion.type === 'multiple_choice' ||
              selectedQuestion.type === 'true_false' ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    {copy.labels.layout}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={
                        questionSettings[selectedQuestion.id]?.choiceLayout === 'single'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => handleLayoutChange(selectedQuestion.id, 'single')}
                    >
                      {copy.labels.layoutSingle}
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        questionSettings[selectedQuestion.id]?.choiceLayout === 'two-column'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => handleLayoutChange(selectedQuestion.id, 'two-column')}
                    >
                      {copy.labels.layoutDouble}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{copy.labels.noQuestions}</p>
          )}
        </aside>
      </div>

      <Button
        className="print-hidden fixed bottom-6 right-6 rounded-full shadow-lg"
        size="sm"
        variant="outline"
        onClick={openIndex}
      >
        {copy.actions.openIndex}
      </Button>

      {isIndexOpen ? (
        <div className="print-hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20"
            role="button"
            tabIndex={0}
            onClick={() => setIsIndexOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsIndexOpen(false);
              }
            }}
          />
          <div className="absolute bottom-20 right-6 w-64 rounded-2xl border border-[#e2ddd5] bg-[#fcfbf8] p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {copy.actions.openIndex}
              </p>
              <Button size="xs" variant="outline" onClick={() => setIsIndexOpen(false)}>
                {copy.actions.close}
              </Button>
            </div>
            <div ref={modalIndexRef} className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {questions.map((question, index) => {
                const id = question.id;
                return (
                  <button
                    key={`index-${id}`}
                    data-question-id={id}
                    type="button"
                    onClick={() => jumpToQuestion(id, true)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                      id === activeSelectedQuestionId
                        ? 'border-[#c1b3a0] bg-[#fffcf7] text-[#4b433b] shadow-sm'
                        : 'border-[#e2ddd5] bg-white text-muted-foreground hover:border-[#3a7b7d]/40'
                    }`}
                  >
                    <span>
                      {index + 1}. {copy.questionTypeLabels[question.type]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div className="print-hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20"
            role="button"
            tabIndex={0}
            onClick={() => setIsSettingsOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsSettingsOpen(false);
              }
            }}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-lg border-l border-[#e2ddd5] bg-[#fcfbf8] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  {copy.actions.printSettings}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {assessment?.title ?? ''}
                </h2>
              </div>
              <Button size="sm" variant="outline" onClick={() => setIsSettingsOpen(false)}>
                {copy.actions.close}
              </Button>
            </div>
            <div className="mt-6 space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  {copy.labels.paperStyle}
                </legend>
                <div className="grid grid-cols-2 gap-3">
                  {(['white', 'warm'] as const).map((style) => {
                    const isWarm = style === 'warm';
                    const isSelected = paperStyle === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setPrintSettings((current) => ({ ...current, paperStyle: style }))
                        }
                        className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9b431f] ${
                          isSelected
                            ? 'border-[#9b431f] bg-white shadow-sm'
                            : 'border-[#e2ddd5] bg-white/70 hover:border-[#b9a592]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`mb-2 block h-14 rounded-md border px-3 py-2 ${
                            isWarm ? 'border-[#dccbb8] bg-[#f6efe5]' : 'border-[#e2ddd5] bg-white'
                          }`}
                        >
                          <span
                            className={`block h-1.5 w-1/2 rounded-full ${
                              isWarm ? 'bg-[#9b431f]' : 'bg-[#49413a]'
                            }`}
                          />
                          <span className="mt-2 block h-px w-3/4 bg-[#cfc8be]" />
                          <span className="mt-1 block h-px w-2/3 bg-[#cfc8be]" />
                        </span>
                        <span className="block text-sm font-semibold text-foreground">
                          {isWarm ? copy.labels.paperWarm : copy.labels.paperWhite}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {isWarm ? copy.labels.paperWarmHint : copy.labels.paperWhiteHint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  {copy.labels.className}
                </label>
                <Input
                  value={printSettings.className}
                  onChange={(event) =>
                    setPrintSettings((current) => ({ ...current, className: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  {copy.labels.date}
                </label>
                <Input
                  value={printSettings.date}
                  onChange={(event) =>
                    setPrintSettings((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  {copy.labels.name}
                </label>
                <Input
                  value={printSettings.nameLabel}
                  onChange={(event) =>
                    setPrintSettings((current) => ({ ...current, nameLabel: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  {copy.labels.showPoints}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant={printSettings.showPoints ? 'default' : 'outline'}
                  onClick={() =>
                    setPrintSettings((current) => ({ ...current, showPoints: !current.showPoints }))
                  }
                >
                  {printSettings.showPoints ? 'ON' : 'OFF'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
