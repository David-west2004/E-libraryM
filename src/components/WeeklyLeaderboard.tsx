import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Trophy,
  Medal,
  Crown,
  TrendingUp,
  Clock,
  Target,
  RefreshCw,
  ChevronRight,
  Zap,
  Star
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { WeeklyLeaderboardEntry, User } from '../types';
import { getIsoWeekIdentifier } from '../utils/quizScoring';

interface WeeklyLeaderboardProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenQuiz?: () => void;
}

const RANK_STYLES: Record<number, { bg: string; text: string; icon: React.ReactNode }> = {
  1: {
    bg: 'bg-gradient-to-br from-amber-400 to-yellow-500',
    text: 'text-amber-800',
    icon: <Crown className="w-4 h-4 text-amber-800 drop-shadow" />,
  },
  2: {
    bg: 'bg-gradient-to-br from-slate-300 to-slate-400',
    text: 'text-slate-700',
    icon: <Medal className="w-4 h-4 text-slate-700" />,
  },
  3: {
    bg: 'bg-gradient-to-br from-amber-600 to-amber-700',
    text: 'text-amber-100',
    icon: <Medal className="w-4 h-4 text-amber-100" />,
  },
};

export const WeeklyLeaderboard: React.FC<WeeklyLeaderboardProps> = ({
  user,
  isOpen,
  onClose,
  onOpenQuiz,
}) => {
  const [entries, setEntries] = useState<WeeklyLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek] = useState(getIsoWeekIdentifier());
  const [myEntry, setMyEntry] = useState<WeeklyLeaderboardEntry | null>(null);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_leaderboard_view')
        .select('*')
        .order('rank', { ascending: true })
        .limit(50);

      if (error) throw error;

      const rows: WeeklyLeaderboardEntry[] = data || [];
      setEntries(rows);

      if (user?.id) {
        const mine = rows.find(e => e.user_id === user.id) ?? null;
        setMyEntry(mine);
      }
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isOpen) loadLeaderboard();
  }, [isOpen, loadLeaderboard]);

  if (!isOpen) return null;

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  const getRankDisplay = (rank: number) => {
    const style = RANK_STYLES[rank];
    if (style) {
      return (
        <div className={`w-8 h-8 rounded-xl ${style.bg} flex items-center justify-center shadow`}>
          {style.icon}
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
        <span className="text-xs font-black text-slate-500">#{rank}</span>
      </div>
    );
  };

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
        <div className="px-6 py-5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              <Trophy className="w-6 h-6 text-white drop-shadow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">Weekly Leaderboard</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20">
                  {currentWeek}
                </span>
              </div>
              <p className="text-xs text-amber-100 font-medium">Auto-resets every Sunday at midnight UTC</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadLeaderboard}
              disabled={loading}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* My Rank Sticky Banner */}
        {myEntry && (
          <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-3 flex items-center gap-3 flex-shrink-0">
            <Star className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-bold text-emerald-800">
              Your rank this week:
            </span>
            <span className="ml-auto flex items-center gap-3 text-sm font-black text-emerald-700">
              <span>#{myEntry.rank}</span>
              <span className="text-xs font-bold text-emerald-500">·</span>
              <span>{myEntry.total_points.toLocaleString()} pts</span>
              <span className="text-xs font-bold text-emerald-500">·</span>
              <span>{myEntry.accuracy_rate}% accuracy</span>
            </span>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center">
              <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm font-bold text-slate-500">Loading rankings...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center px-8">
              <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-amber-400" />
              </div>
              <h4 className="text-lg font-bold text-slate-800 mb-2">No Rankings Yet</h4>
              <p className="text-sm text-slate-500 mb-6">
                Be the first to complete <strong>{currentWeek}</strong>'s quiz and claim the top spot!
              </p>
              {onOpenQuiz && (
                <button
                  onClick={() => { onClose(); onOpenQuiz(); }}
                  className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2 mx-auto"
                >
                  <Zap className="w-4 h-4" /> Take the Quiz
                </button>
              )}
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {/* Top 3 Podium Cards */}
              {top3.length > 0 && (
                <div className={`grid gap-3 mb-2 ${top3.length === 1 ? 'grid-cols-1' : top3.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {top3.map((entry) => {
                    const style = RANK_STYLES[entry.rank];
                    const isMe = entry.user_id === user?.id;
                    return (
                      <div
                        key={entry.user_id}
                        className={`p-4 rounded-2xl text-center border-2 ${
                          isMe ? 'border-emerald-400' : 'border-transparent'
                        } ${
                          entry.rank === 1
                            ? 'bg-gradient-to-b from-amber-50 to-yellow-50 shadow-md'
                            : entry.rank === 2
                            ? 'bg-gradient-to-b from-slate-50 to-slate-100'
                            : 'bg-gradient-to-b from-orange-50 to-amber-50'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-2xl ${style?.bg} flex items-center justify-center mx-auto mb-2 shadow-lg`}>
                          {style?.icon}
                        </div>
                        <div className="text-xs font-black text-slate-600 truncate px-1" title={entry.user_name}>
                          {isMe ? '👑 You' : entry.user_name}
                        </div>
                        <div className="text-xl font-black text-slate-900 mt-1">
                          {entry.total_points.toLocaleString()}
                          <span className="text-xs font-bold text-slate-400 ml-1">pts</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 mt-1">
                          {entry.accuracy_rate}% acc · {entry.correct_answers}/{entry.total_attempts} ✓
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rest of leaderboard table */}
              {rest.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">All Rankings</p>
                  {rest.map((entry) => {
                    const isMe = entry.user_id === user?.id;
                    return (
                      <div
                        key={entry.user_id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors ${
                          isMe
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-slate-50 border-transparent hover:border-slate-200'
                        }`}
                      >
                        {getRankDisplay(entry.rank)}

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-800 truncate">
                            {isMe ? `${entry.user_name} (You)` : entry.user_name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                              <Target className="w-3 h-3" />
                              {entry.accuracy_rate}%
                            </span>
                            <span className="text-[10px] text-slate-300">·</span>
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                              <Clock className="w-3 h-3" />
                              {entry.average_time_seconds}s avg
                            </span>
                            <span className="text-[10px] text-slate-300">·</span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              {entry.correct_answers}/{entry.total_attempts} correct
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-black text-slate-900">
                            {entry.total_points.toLocaleString()}
                            <span className="text-xs font-bold text-slate-400 ml-0.5">pts</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0 bg-slate-50/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span>Historical records are preserved forever — only the view resets weekly.</span>
          </div>
          {onOpenQuiz && (
            <button
              onClick={() => { onClose(); onOpenQuiz(); }}
              className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-600/25 flex items-center gap-1.5 flex-shrink-0 ml-3"
            >
              Take Quiz <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
