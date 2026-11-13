import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Trash2,
  Edit,
  X,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Sparkles,
  Save,
  AlertCircle,
  RefreshCw,
  Search,
  Copy,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { QuizQuestion, QuizQuestionType, User } from '../types';
import { getIsoWeekIdentifier } from '../utils/quizScoring';

interface QuizManagerPanelProps {
  user: User | null;
}

const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  mcq: 'Multiple Choice (MCQ)',
  fill_blank: 'Fill in the Gap',
  descriptive: 'Descriptive',
};

const QUESTION_TYPE_COLORS: Record<QuizQuestionType, string> = {
  mcq: 'bg-blue-100 text-blue-700',
  fill_blank: 'bg-purple-100 text-purple-700',
  descriptive: 'bg-amber-100 text-amber-700',
};

const getTodayDate = () => new Date().toISOString().split('T')[0];
const getTomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const EMPTY_FORM = {
  question_text: '',
  question_type: 'mcq' as QuizQuestionType,
  options: ['', '', '', ''],
  correct_answer: '',
  week_identifier: getIsoWeekIdentifier(),
  date_identifier: getTodayDate(),
};

export const QuizManagerPanel: React.FC<QuizManagerPanelProps> = ({ user }) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterDate, setFilterDate] = useState(getTodayDate());
  const [filterType, setFilterType] = useState<QuizQuestionType | 'all'>('all');
  const [searchText, setSearchText] = useState('');

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('quiz_questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterDate) query = query.eq('date_identifier', filterDate);
      if (filterType !== 'all') query = query.eq('question_type', filterType);

      const { data, error: err } = await query;
      if (err) throw err;
      setQuestions(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterType]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, week_identifier: getIsoWeekIdentifier(), date_identifier: getTodayDate() });
    setIsFormOpen(true);
  };

  const openEditForm = (q: QuizQuestion) => {
    setEditingId(q.id);
    setForm({
      question_text: q.question_text,
      question_type: q.question_type,
      options: Array.isArray(q.options) && q.options.length > 0
        ? [...q.options as string[], '', '', '', ''].slice(0, 4)
        : ['', '', '', ''],
      correct_answer: q.correct_answer ?? '',
      week_identifier: q.week_identifier,
      date_identifier: (q as any).date_identifier ?? getTodayDate(),
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleTypeChange = (type: QuizQuestionType) => {
    setForm(prev => ({
      ...prev,
      question_type: type,
      options: type === 'mcq' ? ['', '', '', ''] : [],
      correct_answer: '',
    }));
  };

  const handleOptionChange = (index: number, value: string) => {
    setForm(prev => {
      const updated = [...prev.options];
      updated[index] = value;
      return { ...prev, options: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        question_text: form.question_text.trim(),
        question_type: form.question_type,
        options: form.question_type === 'mcq'
          ? form.options.filter(o => o.trim() !== '')
          : [],
        correct_answer: form.correct_answer.trim(),
        week_identifier: form.week_identifier.trim(),
        date_identifier: form.date_identifier,
      };

      if (!payload.question_text) throw new Error('Question text is required.');
      if (!payload.correct_answer) throw new Error('Correct answer is required.');
      if (!payload.date_identifier) throw new Error('Date is required.');
      if (!payload.week_identifier.match(/^\d{4}-W\d{2}$/)) {
        throw new Error('Week identifier must be in format YYYY-WNN (e.g. 2026-W46)');
      }
      if (payload.question_type === 'mcq' && payload.options.length < 2) {
        throw new Error('MCQ questions need at least 2 answer options.');
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('quiz_questions')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
        showSuccess('Question updated successfully!');
      } else {
        const { error: err } = await supabase
          .from('quiz_questions')
          .insert([payload]);
        if (err) throw err;
        showSuccess('Question created successfully!');
      }

      closeForm();
      loadQuestions();
    } catch (err: any) {
      setError(err.message || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error: err } = await supabase
        .from('quiz_questions')
        .delete()
        .eq('id', id);
      if (err) throw err;
      showSuccess('Question deleted.');
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete question.');
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  const handleDuplicateToDate = async (q: QuizQuestion, targetDate: string) => {
    try {
      const { error: err } = await supabase.from('quiz_questions').insert([{
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        correct_answer: q.correct_answer,
        week_identifier: q.week_identifier,
        date_identifier: targetDate,
      }]);
      if (err) throw err;
      showSuccess(`Duplicated to ${targetDate}`);
      if (filterDate === targetDate) loadQuestions();
    } catch (err: any) {
      setError(err.message || 'Failed to duplicate question.');
    }
  };

  const filteredQuestions = questions.filter(q =>
    searchText === '' ||
    q.question_text.toLowerCase().includes(searchText.toLowerCase())
  );

  const currentWeek = getIsoWeekIdentifier();
  const nextWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return getIsoWeekIdentifier(d);
  })();

  // Utility to generate ISO week identifier from a Date (re-export for inline use)
  function getIsoWeekIdentifier(date: Date = new Date()): string {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    const year = new Date(firstThursday).getUTCFullYear();
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
  }

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 px-5 py-4 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-600/25"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-bold">{success}</span>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 px-5 py-4 bg-rose-600 text-white rounded-2xl shadow-lg shadow-rose-600/25"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-bold">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-white/10 rounded-full">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Row */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-2xl">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800">Quiz Manager</h2>
              <p className="text-xs text-slate-400 font-medium">
                Create & manage weekly quiz questions · Active week: <strong className="text-slate-600">{currentWeek}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Question
          </button>
        </div>

        {/* Filters */}
        <div className="mt-5 flex flex-wrap gap-3">
          {/* Date filter */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none w-36"
            />
          </div>
          <button
            onClick={() => setFilterDate(getTodayDate())}
            className={`px-3 py-2 rounded-2xl text-xs font-black border transition-colors ${filterDate === getTodayDate() ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-emerald-400'}`}
          >
            Today
          </button>
          <button
            onClick={() => setFilterDate(getTomorrowDate())}
            className={`px-3 py-2 rounded-2xl text-xs font-black border transition-colors ${filterDate === getTomorrowDate() ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-400'}`}
          >
            Tomorrow
          </button>

          {/* Type filter */}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as QuizQuestionType | 'all')}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="mcq">MCQ</option>
            <option value="fill_blank">Fill in the Gap</option>
            <option value="descriptive">Descriptive</option>
          </select>

          {/* Search */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search question text..."
              className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none flex-1"
            />
          </div>

          <button
            onClick={loadQuestions}
            className="p-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Question List */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-500">Loading questions...</p>
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-3">
              <HelpCircle className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-500 mb-1">No questions found</p>
            <p className="text-xs text-slate-400">
              {filterDate ? `No questions for ${filterDate}.` : 'Try adjusting your filters.'}
            </p>
            <button
              onClick={openCreateForm}
              className="mt-4 px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all inline-flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" /> Create First Question
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-6 py-3 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Question</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {filteredQuestions.map((q, idx) => (
              <div key={q.id} className="grid grid-cols-12 px-6 py-4 items-center hover:bg-slate-50/60 transition-colors group">
                <div className="col-span-1">
                  <span className="text-xs font-black text-slate-300">#{idx + 1}</span>
                </div>

                <div className="col-span-5 pr-4">
                  <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">
                    {q.question_text}
                  </p>
                  {q.correct_answer && (
                    <p className="text-[10px] font-semibold text-emerald-600 mt-1 truncate">
                      ✓ {q.correct_answer}
                    </p>
                  )}
                </div>

                <div className="col-span-2">
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black ${QUESTION_TYPE_COLORS[q.question_type]}`}>
                    {q.question_type === 'mcq' ? 'MCQ' : q.question_type === 'fill_blank' ? 'Fill-Gap' : 'Descriptive'}
                  </span>
                </div>

                <div className="col-span-2">
                  {(() => {
                    const qDate = (q as any).date_identifier ?? '';
                    const today = getTodayDate();
                    const isLive = qDate === today;
                    const isExpired = qDate < today;
                    return (
                      <span className={`text-[11px] font-bold ${isLive ? 'text-emerald-600' : isExpired ? 'text-rose-400' : 'text-blue-500'}`}>
                        {qDate || q.week_identifier}
                        {isLive && <span className="ml-1.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black">LIVE</span>}
                        {isExpired && <span className="ml-1.5 px-1.5 py-0.5 bg-rose-100 text-rose-600 rounded text-[9px] font-black">EXPIRED</span>}
                        {!isLive && !isExpired && qDate && <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[9px] font-black">UPCOMING</span>}
                      </span>
                    );
                  })()}
                </div>

                <div className="col-span-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Duplicate to tomorrow */}
                  <button
                    onClick={() => handleDuplicateToDate(q, getTomorrowDate())}
                    title={`Duplicate to tomorrow (${getTomorrowDate()})`}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openEditForm(q)}
                    title="Edit"
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setConfirmDeleteId(q.id)}
                    title="Delete"
                    disabled={deleting === q.id}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Count footer */}
        {filteredQuestions.length > 0 && (
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400">
              {filteredQuestions.length} question{filteredQuestions.length !== 1 ? 's' : ''} · {filterDate}
            </span>
            <span className="text-[11px] font-bold text-slate-400">
              MCQ: {filteredQuestions.filter(q => q.question_type === 'mcq').length} ·{' '}
              Fill: {filteredQuestions.filter(q => q.question_type === 'fill_blank').length} ·{' '}
              Desc: {filteredQuestions.filter(q => q.question_type === 'descriptive').length}
            </span>
          </div>
        )}
      </div>

      {/* ── CREATE / EDIT FORM MODAL ── */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeForm}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    {editingId ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-black">{editingId ? 'Edit Question' : 'New Quiz Question'}</h3>
                    <p className="text-xs text-emerald-100">Fill all fields — correct answer is validated on the server</p>
                  </div>
                </div>
                <button onClick={closeForm} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5 text-white/80" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Date identifier */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                    Question Date <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="date"
                      value={form.date_identifier}
                      onChange={e => setForm(p => ({ ...p, date_identifier: e.target.value }))}
                      required
                      className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono min-w-[160px]"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, date_identifier: getTodayDate() }))}
                      className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-2xl text-xs hover:bg-emerald-100 transition-colors whitespace-nowrap"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, date_identifier: getTomorrowDate() }))}
                      className="px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 font-bold rounded-2xl text-xs hover:bg-blue-100 transition-colors whitespace-nowrap"
                    >
                      Tomorrow
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 ml-1">
                    Questions expire at 11:59 PM on this date. Set for future dates to schedule ahead.
                  </p>
                </div>

                {/* Question Type */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                    Question Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['mcq', 'fill_blank', 'descriptive'] as QuizQuestionType[]).map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleTypeChange(type)}
                        className={`p-3 rounded-2xl border-2 text-xs font-bold transition-all ${
                          form.question_type === type
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                            : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                        }`}
                      >
                        {QUESTION_TYPE_LABELS[type]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Question Text */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                    Question Text
                  </label>
                  <textarea
                    rows={3}
                    value={form.question_text}
                    onChange={e => setForm(p => ({ ...p, question_text: e.target.value }))}
                    placeholder="Enter your question here..."
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                {/* MCQ Options */}
                {form.question_type === 'mcq' && (
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                      Answer Options (A – D)
                    </label>
                    <div className="space-y-2">
                      {form.options.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 font-black text-xs flex items-center justify-center flex-shrink-0">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <input
                            type="text"
                            value={opt}
                            onChange={e => handleOptionChange(idx, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Correct Answer */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
                    {form.question_type === 'mcq'
                      ? 'Correct Answer (must match an option exactly)'
                      : form.question_type === 'fill_blank'
                      ? 'Correct Answer (exact word / phrase)'
                      : 'Model Answer / Keywords (used for auto-grading)'}
                  </label>

                  {form.question_type === 'mcq' ? (
                    <select
                      value={form.correct_answer}
                      onChange={e => setForm(p => ({ ...p, correct_answer: e.target.value }))}
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">— Select the correct option —</option>
                      {form.options.filter(o => o.trim()).map((opt, idx) => (
                        <option key={idx} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : form.question_type === 'fill_blank' ? (
                    <input
                      type="text"
                      value={form.correct_answer}
                      onChange={e => setForm(p => ({ ...p, correct_answer: e.target.value }))}
                      placeholder="Exact expected answer"
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  ) : (
                    <textarea
                      rows={3}
                      value={form.correct_answer}
                      onChange={e => setForm(p => ({ ...p, correct_answer: e.target.value }))}
                      placeholder="Enter model answer or core keywords for auto-grading..."
                      required
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  )}
                </div>

                {/* Scoring preview */}
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-1">Scoring Preview</p>
                  <p className="text-xs text-amber-700">
                    {form.question_type === 'mcq' && 'Base: 100 pts × 1.0 multiplier + up to 50 speed bonus = max 150 pts'}
                    {form.question_type === 'fill_blank' && 'Base: 100 pts × 1.15 multiplier + up to 50 speed bonus = max 165 pts'}
                    {form.question_type === 'descriptive' && 'Base: 100 pts × 1.30 multiplier + up to 50 speed bonus = max 180 pts'}
                  </p>
                </div>

                {/* Submit buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Question'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRM MODAL ── */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDeleteId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 text-center"
            >
              <div className="w-14 h-14 bg-rose-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-rose-600" />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-1">Delete Question?</h3>
              <p className="text-sm text-slate-500 mb-6">
                This will permanently delete the question and all associated student attempt records.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  disabled={deleting === confirmDeleteId}
                  className="flex-1 px-4 py-3 bg-rose-600 text-white font-bold rounded-2xl text-sm hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 disabled:opacity-60"
                >
                  {deleting === confirmDeleteId ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
