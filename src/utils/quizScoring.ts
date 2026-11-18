import { QuizQuestionType } from '../types';

export interface ScoringOptions {
  basePoints?: number;
  maxSpeedBonus?: number;
  speedWindowSeconds?: number;
}

/**
 * Calculates quiz score based on correctness, speed bonus, and question difficulty multiplier.
 * Matches the Supabase PostgreSQL function `calculate_quiz_score`.
 *
 * @param isCorrect Whether the submitted answer was correct.
 * @param timeTakenSeconds Time spent answering the question in seconds.
 * @param questionType 'mcq' | 'fill_blank' | 'descriptive'
 * @param options Configuration overrides for base points and speed bonus.
 * @returns Total points earned (integer >= 0)
 */
export function calculateQuizScore(
  isCorrect: boolean,
  timeTakenSeconds: number,
  questionType: QuizQuestionType = 'mcq',
  options: ScoringOptions = {}
): number {
  if (!isCorrect) {
    return 0;
  }

  const basePoints = options.basePoints ?? 100;
  const maxSpeedBonus = options.maxSpeedBonus ?? 50;
  const speedWindowSeconds = options.speedWindowSeconds ?? 60;

  // Accuracy multiplier based on question difficulty / cognitive load
  let accuracyMultiplier = 1.0;
  switch (questionType) {
    case 'fill_blank':
      accuracyMultiplier = 1.15;
      break;
    case 'descriptive':
      accuracyMultiplier = 1.30;
      break;
    case 'mcq':
    default:
      accuracyMultiplier = 1.0;
      break;
  }

  // Speed bonus linear decay within limit
  let speedBonus = 0;
  if (timeTakenSeconds < speedWindowSeconds) {
    speedBonus = Math.floor(maxSpeedBonus * (1.0 - timeTakenSeconds / speedWindowSeconds));
  }

  const totalPoints = Math.floor(basePoints * accuracyMultiplier + speedBonus);
  return Math.max(0, totalPoints);
}

/**
 * Computes the current ISO week identifier (e.g., '2026-W46').
 * Aligns with PostgreSQL's `to_char(CURRENT_DATE, 'IYYY-"W"IW')`.
 */
export function getIsoWeekIdentifier(date: Date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week determines the year
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const year = new Date(firstThursday).getUTCFullYear();
  const weekPadded = String(weekNumber).padStart(2, '0');
  return `${year}-W${weekPadded}`;
}
