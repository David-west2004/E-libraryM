
export type UserRole = 'member' | 'general_admin' | 'quiz_admin' | 'super_admin';

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  role?: UserRole;
}

export interface RegistrationLink {
  id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export enum BookCategory {
  ACADEMIC = 'Academic',
  CHRISTIAN_NOVEL = 'Christian Novel',
}

export interface Book {
  id: string;
  title: string;
  category: BookCategory;
  description: string;
  coverUrl: string;
  downloadUrl: string;
  // Academic specific fields
  department?: string;
  courseCode?: string;
  courseTitle?: string;
  level?: string;
  materialType?: 'Course Material' | 'Past Question';
}

export interface FilterState {
  search: string;
  category: BookCategory | 'All';
  department: string;
  level: string;
}

// ==================== Weekly Quiz & Leaderboard Types ====================

export type QuizQuestionType = 'mcq' | 'fill_blank' | 'descriptive';

export interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: QuizQuestionType;
  options: string[] | Record<string, any>;
  correct_answer?: string; // Hidden on client for standard students
  week_identifier: string; // e.g., '2026-W46'
  created_at: string;
  updated_at?: string;
}

export interface QuizAttempt {
  id: string;
  user_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  time_taken_seconds: number;
  points_earned: number;
  created_at: string;
}

export interface WeeklyLeaderboardEntry {
  rank: number;
  user_id: string;
  user_name: string;
  email: string;
  quiz_points: number;
  streak_bonus_points: number;
  total_points: number;
  total_attempts: number;
  correct_answers: number;
  accuracy_rate: number;
  total_time_taken_seconds: number;
  average_time_seconds: number;
  current_streak: number;
  longest_streak: number;
}

export interface UserStreak {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_participation_date: string | null;
  total_streak_bonus_points: number;
  streak_3_awarded_week?: string | null;
  streak_7_awarded_week?: string | null;
}

export interface QuizStreakInfo {
  current_streak: number;
  bonus_awarded: boolean;
  bonus_points: number;
  milestone: string | null;
}

export interface QuizSubmissionResult {
  success: boolean;
  attempt_id: string;
  is_correct: boolean;
  points_earned: number;
  time_taken_seconds: number;
  correct_answer?: string | null;
  streak_info?: QuizStreakInfo;
}

export interface PreviousWeekWinner {
  user_name: string;
  total_points: number;
  week: string;
}
