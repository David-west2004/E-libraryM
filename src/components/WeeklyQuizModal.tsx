import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  HelpCircle,
  Clock,
  Trophy,
  Zap,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Sparkles,
  Award,
  Flame,
} from 'lucide-react';
import { QuizQuestion, User } from '../types';

interface WeeklyQuizModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenLeaderboard?: () => void;
}

interface StreakInfo {
  current_streak: number;
  longest_streak: number;
  total_streak_bonus_points: number;
}

interface LastResult {
  isCorrect: boolean;
  pointsEarned: number;
  timeTaken: number;
  correctAnswer?: string;
  message: string;
  streakInfo?: {
    current_streak: number;
    bonus_awarded: boolean;
    bonus_points: number;
    milestone: string | null;
  };
}

export const WeeklyQuizModal: React.FC<WeeklyQuizModalProps> = ({
  user,
  isOpen,
  onClose,
  onOpenLeaderboard,
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attemptedQuestionIds, setAttemptedQuestionIds] = useState<Set<string>>(new Set());
  const [currentDate, setCurrentDate] = useState('');
  const [secondsUntilExpiry, setSecondsUntilExpiry] = useState(0);
  const [streakInfo, setStreakInfo] = useState<StreakInfo | null>(null);

  // Per-question elapsed timer
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Countdown-to-midnight timer
  const countdownRef = useRef<number | null>(null);

  // Result state
  const [lastResult, setLastResult] = useState<LastResult | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadQuestions();
    } else {
      stopTimer();
      if (countdownRef.current) clearInterval(countdownRef.current);
      setLastResult(null);
      setSelectedAnswer('');
    }
    return () => {
      stopTimer();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = window.setInterval(() => setSecondsElapsed(p => p + 1), 1000);
    } else {
      stopTimer();
    }
    return stopTimer;
  }, [isTimerRunning, stopTimer]);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (user?.id) params.set('userId', user.id);

      const res = await fetch(`/api/quiz/questions?${params}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load questions');
      const data = await res.json();

      const loadedQuestions: QuizQuestion[] = (data.questions || []).map((q: any) => ({
        ...q,
        options: Array.isArray(q.options)
          ? q.options
          : typeof q.options === 'string'
          ? JSON.parse(q.options)
          : [],
      }));

      setCurrentDate(data.currentDate || new Date().toISOString().split('T')[0]);
      setQuestions(loadedQuestions);
      if (data.streakInfo) setStreakInfo(data.streakInfo);

      const attempted = new Set<string>(data.attemptedIds || []);
      setAttemptedQuestionIds(attempted);

      const firstUnattempted = loadedQuestions.findIndex(q => !attempted.has(q.id));
      setCurrentIndex(firstUnattempted >= 0 ? firstUnattempted : 0);

      // Start countdown to midnight
      if (data.secondsUntilExpiry) {
        setSecondsUntilExpiry(data.secondsUntilExpiry);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = window.setInterval(() => {
          setSecondsUntilExpiry(prev => Math.max(0, prev - 1));
        }, 1000);
      }

      setSecondsElapsed(0);
      if (loadedQuestions.length > 0 && firstUnattempted >= 0) {
        setIsTimerRunning(true);
      }
    } catch (err: any) {
      console.error('Quiz load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer.trim() || submitting || !currentQuestion) return;
    if (!user?.id) {
      alert('Please log in to submit answers.');
      return;
    }

    setSubmitting(true);
    stopTimer();
    const timeTaken = secondsElapsed;

    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          questionId: currentQuestion.id,
          selectedAnswer: selectedAnswer.trim(),
          timeTakenSeconds: timeTaken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setAttemptedQuestionIds(prev => new Set(prev).add(currentQuestion.id));
          setLastResult({
            isCorrect: false,
            pointsEarned: 0,
            timeTaken,
            message: 'You already answered this question.',
          });
          return;
        }
        if (res.status === 410) {
          alert('⏰ Today\'s quiz has expired! Come back tomorrow for new questions.');
          onClose();
          return;
        }
        throw new Error(data.error || 'Submission failed');
      }

      // Update streak info if returned
      if (data.streak_info) {
        setStreakInfo(prev => ({
          current_streak: data.streak_info.current_streak,
          longest_streak: prev?.longest_streak ?? 0,
          total_streak_bonus_points: (prev?.total_streak_bonus_points ?? 0) + (data.streak_info.bonus_points ?? 0),
        }));
      }

      const speedBonusSecs = 60 - timeTaken;
      setLastResult({
        isCorrect: !!data.is_correct,
        pointsEarned: data.points_earned ?? 0,
        timeTaken,
        correctAnswer: data.correct_answer,
        message: data.is_correct
          ? `Correct! +${data.points_earned} pts${timeTaken < 60 ? ` (incl. ${speedBonusSecs}s speed bonus)` : '!'}`
          : 'Incorrect — keep studying!',
        streakInfo: data.streak_info,
      });

      setAttemptedQuestionIds(prev => new Set(prev).add(currentQuestion.id));
    } catch (err: any) {
      console.error('Quiz submit error:', err);
      alert(err.message || 'Failed to submit. Please try again.');
      setIsTimerRunning(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    setLastResult(null);
    setSelectedAnswer('');
    setSecondsElapsed(0);

    const nextUnattempted = questions.findIndex(
      (q, i) => i > currentIndex && !attemptedQuestionIds.has(q.id)
    );

    if (nextUnattempted !== -1) {
      setCurrentIndex(nextUnattempted);
      setIsTimerRunning(true);
    } else {
      const anyUnattempted = questions.findIndex(q => !attemptedQuestionIds.has(q.id));
      if (anyUnattempted !== -1) {
        setCurrentIndex(anyUnattempted);
        setIsTimerRunning(true);
      } else {
        setIsTimerRunning(false);
      }
    }
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];
  const isAlreadyAttempted = currentQuestion ? attemptedQuestionIds.has(currentQuestion.id) : false;
  const totalUnattempted = questions.filter(q => !attemptedQuestionIds.has(q.id)).length;
  const allCompleted = questions.length > 0 && totalUnattempted === 0;
  const speedBonusLeft = Math.max(0, 60 - secondsElapsed);

  // Format countdown
  const countdownH = Math.floor(secondsUntilExpiry / 3600);
  const countdownM = Math.floor((secondsUntilExpiry % 3600) / 60);
  const countdownS = secondsUntilExpiry % 60;
  const countdownStr = countdownH > 0
    ? `${countdownH}h ${countdownM}m`
    : `${countdownM}m ${String(countdownS).padStart(2, '0')}s`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md flex-shrink-0">
              <Sparkles className="w-6 h-6 text-yellow-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black tracking-tight">Daily Quiz Challenge</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20">
                  {currentDate}
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium truncate">
                Points accumulate — climb the all-time leaderboard!
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Streak + Countdown bar */}
        <div className="flex items-center justify-between px-6 py-2 bg-slate-800 text-white flex-shrink-0">
          {/* Streak */}
          <div className="flex items-center gap-1.5">
            <Flame className={`w-4 h-4 ${(streakInfo?.current_streak ?? 0) >= 3 ? 'text-orange-400' : 'text-slate-500'}`} />
            <span className="text-xs font-bold text-slate-300">
              {streakInfo?.current_streak ?? 0}-day streak
            </span>
            {(streakInfo?.current_streak ?? 0) >= 7 && (
              <span className="px-1.5 py-0.5 bg-orange-500 rounded-full text-[9px] font-black uppercase">🔥 Legend</span>
            )}
            {(streakInfo?.current_streak ?? 0) >= 3 && (streakInfo?.current_streak ?? 0) < 7 && (
              <span className="px-1.5 py-0.5 bg-amber-500 rounded-full text-[9px] font-black uppercase">Hot</span>
            )}
          </div>
          {/* Countdown */}
          {secondsUntilExpiry > 0 && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-xs font-bold text-slate-300">Resets in {countdownStr}</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {questions.length > 0 && (
          <div className="h-1 bg-slate-100 flex-shrink-0">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${(attemptedQuestionIds.size / questions.length) * 100}%` }}
            />
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold text-slate-600">Loading today's questions...</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-3xl mx-auto flex items-center justify-center mb-4">
                <HelpCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h4 className="text-lg font-bold text-slate-800 mb-2">No Questions Today</h4>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                Questions for <strong>{currentDate}</strong> haven't been posted yet. Check back soon!
              </p>
              {onOpenLeaderboard && (
                <button
                  onClick={() => { onClose(); onOpenLeaderboard(); }}
                  className="px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl text-sm hover:bg-slate-800 transition-all shadow-lg"
                >
                  View Leaderboard
                </button>
              )}
            </div>
          ) : allCompleted && !lastResult ? (
            <div className="py-12 text-center">
              <div className="w-20 h-20 bg-amber-50 rounded-3xl mx-auto flex items-center justify-center mb-4 shadow-inner">
                <Trophy className="w-10 h-10 text-amber-500" />
              </div>
              <h4 className="text-2xl font-black text-slate-800 mb-2">All Done! 🎉</h4>
              {streakInfo && streakInfo.current_streak > 0 && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-2xl border border-orange-100 mb-4">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-bold text-orange-700">
                    🔥 {streakInfo.current_streak}-day streak!
                  </span>
                </div>
              )}
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">
                You've completed all <strong>{questions.length}</strong> questions for today.
                Your points are on the leaderboard!
              </p>
              <div className="flex justify-center gap-4">
                <button onClick={onClose} className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-200 transition-colors">
                  Close
                </button>
                {onOpenLeaderboard && (
                  <button
                    onClick={() => { onClose(); onOpenLeaderboard(); }}
                    className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                  >
                    <Trophy className="w-4 h-4" /> Check Leaderboard
                  </button>
                )}
              </div>
            </div>
          ) : lastResult ? (
            /* Result Card */
            <div className="py-6 text-center space-y-5">
              <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-lg ${
                lastResult.isCorrect
                  ? 'bg-emerald-100 text-emerald-600 shadow-emerald-500/20'
                  : 'bg-rose-100 text-rose-600 shadow-rose-500/20'
              }`}>
                {lastResult.isCorrect ? <CheckCircle2 className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
              </div>

              <div>
                <h4 className="text-2xl font-black text-slate-800">
                  {lastResult.isCorrect ? 'Correct! 🎉' : 'Incorrect'}
                </h4>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">{lastResult.message}</p>
                {!lastResult.isCorrect && lastResult.correctAnswer && (
                  <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-sm font-bold text-emerald-800">
                      Correct answer: <span className="font-black">{lastResult.correctAnswer}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Streak milestone notification */}
              <AnimatePresence>
                {lastResult.streakInfo?.bonus_awarded && lastResult.streakInfo.milestone && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl shadow-lg shadow-orange-500/30"
                  >
                    <Flame className="w-5 h-5" />
                    <div className="text-left">
                      <div className="text-xs font-black uppercase tracking-wide opacity-80">Streak Bonus!</div>
                      <div className="text-sm font-bold">{lastResult.streakInfo.milestone}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <Award className="w-3.5 h-3.5 text-emerald-600" /> Points
                  </div>
                  <div className="text-2xl font-black text-emerald-600">+{lastResult.pointsEarned}</div>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <Clock className="w-3.5 h-3.5 text-blue-600" /> Time
                  </div>
                  <div className="text-2xl font-black text-slate-800">{lastResult.timeTaken}s</div>
                </div>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                {totalUnattempted > 1 ? (
                  <button
                    onClick={handleNextQuestion}
                    className="px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                  >
                    Next Question <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => { onClose(); onOpenLeaderboard?.(); }}
                    className="px-8 py-3.5 bg-slate-900 text-white font-bold rounded-2xl text-sm hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                  >
                    <Trophy className="w-4 h-4 text-yellow-400" /> View Leaderboard
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Active Question */
            <div className="space-y-6">
              {/* Meta row */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-400">
                  Question <span className="text-slate-800 font-black">{currentIndex + 1}</span> of {questions.length}
                  {totalUnattempted < questions.length && (
                    <span className="ml-2 text-emerald-600">({totalUnattempted} remaining)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full border border-amber-200/60">
                  <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  <span className="text-xs font-black text-amber-700">
                    Speed bonus: {speedBonusLeft}s
                  </span>
                </div>
              </div>

              {/* Question */}
              <div>
                <span className="inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 mb-3">
                  {currentQuestion.question_type === 'mcq' ? 'Multiple Choice'
                    : currentQuestion.question_type === 'fill_blank' ? 'Fill in the Gap'
                    : 'Descriptive Response'}
                </span>
                <h4 className="text-xl font-bold text-slate-900 leading-snug">
                  {currentQuestion.question_text}
                </h4>
              </div>

              {/* Answer UI */}
              {isAlreadyAttempted ? (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">You already answered this question.</p>
                  {totalUnattempted > 0 && (
                    <button
                      onClick={handleNextQuestion}
                      className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all"
                    >
                      Next Question
                    </button>
                  )}
                </div>
              ) : currentQuestion.question_type === 'mcq' ? (
                <div className="space-y-3">
                  {Array.isArray(currentQuestion.options) && currentQuestion.options.map((option: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedAnswer(option)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                        selectedAnswer === option
                          ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 shadow-sm'
                          : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center transition-colors flex-shrink-0 ${
                        selectedAnswer === option ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-sm font-medium">{option}</span>
                    </button>
                  ))}
                </div>
              ) : currentQuestion.question_type === 'fill_blank' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Your Answer
                  </label>
                  <input
                    type="text"
                    value={selectedAnswer}
                    onChange={e => setSelectedAnswer(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSubmitAnswer(); }}
                    placeholder="Type the exact word or phrase..."
                    autoFocus
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Detailed Response
                  </label>
                  <textarea
                    rows={4}
                    value={selectedAnswer}
                    onChange={e => setSelectedAnswer(e.target.value)}
                    placeholder="Write a detailed answer. Core keywords are checked for grading..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Submit row */}
              {!isAlreadyAttempted && (
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <Clock className="w-4 h-4" />
                    <span>Elapsed: {secondsElapsed}s</span>
                  </div>
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!selectedAnswer.trim() || submitting}
                    className="px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Answer'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
