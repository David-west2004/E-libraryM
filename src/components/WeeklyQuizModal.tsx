import React, { useState, useEffect, useRef } from 'react';
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
  AlertCircle,
  Sparkles,
  Award
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { QuizQuestion, User } from '../types';
import { getIsoWeekIdentifier } from '../utils/quizScoring';

interface WeeklyQuizModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenLeaderboard?: () => void;
}

export const WeeklyQuizModal: React.FC<WeeklyQuizModalProps> = ({
  user,
  isOpen,
  onClose,
  onOpenLeaderboard
}) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attemptedQuestionIds, setAttemptedQuestionIds] = useState<Set<string>>(new Set());
  const [currentWeek] = useState(getIsoWeekIdentifier());
  
  // Timer & Scoring States
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Result state after submitting
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    pointsEarned: number;
    timeTaken: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadWeeklyQuestions();
    } else {
      stopTimer();
      setLastResult(null);
      setSelectedAnswer('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = window.setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [isTimerRunning]);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const loadWeeklyQuestions = async () => {
    setLoading(true);
    try {
      // 1. Fetch current week's questions
      const { data: qData, error: qError } = await supabase
        .from('quiz_questions')
        .select('id, question_text, question_type, options, week_identifier, created_at')
        .eq('week_identifier', currentWeek)
        .order('created_at', { ascending: true });

      if (qError) throw qError;

      const loadedQuestions: QuizQuestion[] = (qData || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : typeof q.options === 'string' ? JSON.parse(q.options) : []
      }));
      setQuestions(loadedQuestions);

      // 2. Fetch user's previous attempts to prevent duplicates
      if (user?.id) {
        const { data: aData, error: aError } = await supabase
          .from('quiz_attempts')
          .select('question_id')
          .eq('user_id', user.id);

        if (!aError && aData) {
          const attempted = new Set<string>(aData.map(a => a.question_id));
          setAttemptedQuestionIds(attempted);

          // Find first unattempted question
          const firstUnattempted = loadedQuestions.findIndex(q => !attempted.has(q.id));
          if (firstUnattempted !== -1) {
            setCurrentIndex(firstUnattempted);
          }
        }
      }

      // Reset timer
      setSecondsElapsed(0);
      setIsTimerRunning(true);
    } catch (err) {
      console.error('Failed to load weekly quiz questions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer.trim() || submitting || !currentQuestion) return;

    setSubmitting(true);
    stopTimer();
    const timeTaken = secondsElapsed;

    try {
      // Execute secure server-side RPC function
      const { data, error } = await supabase.rpc('submit_quiz_attempt', {
        p_question_id: currentQuestion.id,
        p_selected_answer: selectedAnswer.trim(),
        p_time_taken_seconds: timeTaken
      });

      if (error) throw error;

      const isCorrect = !!data?.is_correct;
      const points = data?.points_earned ?? 0;

      setLastResult({
        isCorrect,
        pointsEarned: points,
        timeTaken,
        message: isCorrect 
          ? `Outstanding! You earned ${points} points with a ${Math.max(0, 60 - timeTaken)}s speed factor!`
          : `That was not quite right, but keep sharpening your knowledge!`
      });

      setAttemptedQuestionIds(prev => new Set(prev).add(currentQuestion.id));
    } catch (err: any) {
      console.error('Error submitting answer:', err);
      alert(err.message || 'Failed to submit quiz attempt.');
      setIsTimerRunning(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    setLastResult(null);
    setSelectedAnswer('');
    setSecondsElapsed(0);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setIsTimerRunning(true);
    } else {
      setIsTimerRunning(false);
    }
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];
  const isAlreadyAttempted = currentQuestion ? attemptedQuestionIds.has(currentQuestion.id) : false;
  const speedBonusSecondsLeft = Math.max(0, 60 - secondsElapsed);
  const allCompleted = questions.length > 0 && attemptedQuestionIds.size >= questions.length;

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
        {/* Top Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              <Sparkles className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">Weekly Quiz Challenge</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                  {currentWeek}
                </span>
              </div>
              <p className="text-xs text-emerald-100 font-medium">Test your knowledge & climb the leaderboard</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold text-slate-600">Loading this week's questions...</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl mx-auto flex items-center justify-center mb-4">
                <HelpCircle className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-800 mb-2">No Active Questions Yet</h4>
              <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                The questions for week <strong>{currentWeek}</strong> are being curated by the Quiz Manager. Check back shortly!
              </p>
              {onOpenLeaderboard && (
                <button
                  onClick={() => { onClose(); onOpenLeaderboard(); }}
                  className="px-6 py-3 bg-slate-900 text-white font-bold rounded-2xl text-sm hover:bg-slate-800 transition-all shadow-lg"
                >
                  View Weekly Leaderboard
                </button>
              )}
            </div>
          ) : allCompleted && !lastResult ? (
            <div className="py-12 text-center">
              <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-3xl mx-auto flex items-center justify-center mb-4 shadow-inner">
                <Trophy className="w-10 h-10" />
              </div>
              <h4 className="text-2xl font-black text-slate-800 mb-2">All Questions Completed!</h4>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">
                You have tackled all questions for <strong>{currentWeek}</strong>. Your points have been recorded in the Weekly Leaderboard. Scores reset automatically on Sunday midnight!
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-200 transition-colors"
                >
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
            /* Post-Submission Result Card */
            <div className="py-6 text-center space-y-6">
              <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center shadow-lg ${
                lastResult.isCorrect ? 'bg-emerald-100 text-emerald-600 shadow-emerald-500/20' : 'bg-rose-100 text-rose-600 shadow-rose-500/20'
              }`}>
                {lastResult.isCorrect ? <CheckCircle2 className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
              </div>

              <div>
                <h4 className="text-2xl font-black text-slate-800">
                  {lastResult.isCorrect ? 'Correct Answer!' : 'Incorrect'}
                </h4>
                <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                  {lastResult.message}
                </p>
              </div>

              {/* Score Statistics Card */}
              <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <Award className="w-3.5 h-3.5 text-emerald-600" /> Points
                  </div>
                  <div className="text-2xl font-black text-emerald-600">
                    +{lastResult.pointsEarned}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    <Clock className="w-3.5 h-3.5 text-blue-600" /> Time Taken
                  </div>
                  <div className="text-2xl font-black text-slate-800">
                    {lastResult.timeTaken}s
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-center gap-3">
                {currentIndex + 1 < questions.length ? (
                  <button
                    onClick={handleNextQuestion}
                    className="px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2"
                  >
                    Next Question <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (onOpenLeaderboard) {
                        onClose();
                        onOpenLeaderboard();
                      } else {
                        onClose();
                      }
                    }}
                    className="px-8 py-3.5 bg-slate-900 text-white font-bold rounded-2xl text-sm hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                  >
                    <Trophy className="w-4 h-4 text-yellow-400" /> View Leaderboard
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Active Question View */
            <div className="space-y-6">
              {/* Progress and Timer Banner */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-400">
                  Question <span className="text-slate-800 font-black">{currentIndex + 1}</span> of {questions.length}
                </div>

                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full border border-amber-200/60">
                  <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  <span className="text-xs font-black text-amber-700">
                    Speed Bonus: {speedBonusSecondsLeft}s
                  </span>
                </div>
              </div>

              {/* Question Text */}
              <div>
                <span className="inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 mb-3">
                  {currentQuestion.question_type === 'mcq' ? 'Multiple Choice' : 
                   currentQuestion.question_type === 'fill_blank' ? 'Fill in the Gap' : 'Descriptive Response'}
                </span>
                <h4 className="text-xl font-bold text-slate-900 leading-snug">
                  {currentQuestion.question_text}
                </h4>
              </div>

              {/* Answer Controls */}
              {isAlreadyAttempted ? (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">You already completed this question!</p>
                  {currentIndex + 1 < questions.length && (
                    <button
                      onClick={handleNextQuestion}
                      className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all"
                    >
                      Skip to Next
                    </button>
                  )}
                </div>
              ) : currentQuestion.question_type === 'mcq' ? (
                /* Multiple Choice Options */
                <div className="space-y-3">
                  {Array.isArray(currentQuestion.options) && currentQuestion.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedAnswer(option)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                        selectedAnswer === option
                          ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 shadow-sm'
                          : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center transition-colors ${
                          selectedAnswer === option ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm font-medium">{option}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : currentQuestion.question_type === 'fill_blank' ? (
                /* Fill in the blank input */
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Your Answer
                  </label>
                  <input
                    type="text"
                    value={selectedAnswer}
                    onChange={(e) => setSelectedAnswer(e.target.value)}
                    placeholder="Type the exact word or phrase..."
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              ) : (
                /* Descriptive textarea */
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Detailed Response
                  </label>
                  <textarea
                    rows={4}
                    value={selectedAnswer}
                    onChange={(e) => setSelectedAnswer(e.target.value)}
                    placeholder="Explain thoroughly. Grading checks for core concepts and keywords..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Submit Button */}
              {!isAlreadyAttempted && (
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>Elapsed: {secondsElapsed}s</span>
                  </div>

                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!selectedAnswer.trim() || submitting}
                    className="px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
