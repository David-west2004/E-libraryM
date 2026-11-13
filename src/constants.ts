import { Book, BookCategory } from './types';

export const DEPARTMENTS = [
  // Faculty of Social Sciences
  'Economics',
  'Sociology',
  'Geography',
  'Political Science',
  'Psychology',

  // Faculty of Arts
  'English Language',
  'Portuguese',
  'Linguistics',
  'History and International Studies',
  'Music',
  'French',
  'Theatre Art',
  'Foreign Language',
  'Christian Religion',
  'Islamic Religion',
  'Arabic',

  // Faculty of Sciences
  'Computer Science',
  'Chemistry',
  'Botany',
  'Zoology',
  'Biochemistry',
  'Medicine and Surgery',
  'Nursing',
  'Mathematics',
  'Pharmacy',
  'Pharmacology',
  'Medical Laboratory Science',
  'Fishery',
  'Physics',
  'Chemical Engineering',
  'Mechanical Engineering',

  // Faculty of Communication
  'Broadcasting',
  'Journalism',
  'Public Relations and Advertisement',

  // Faculty of Education
  'Educational Foundations',
  'Educational Management',
  'Human Kinetic & Health Education',
  'Lang, Arts AND Sciences',
  'Science and Tech. Education',

  // Schools of Transport
  'Transport Management',
  'Transport Planning',
  'Transport Technology',

  // Faculty of Law
  'Common Law',
  'Commercial Law',
  'Islamic Law',
  'Criminal Law',

  // Faculty of Management Science
  'Accounting',
  'Business Administration',
  'Public Administration',
  'Insurance',
  'Marketing',
  'Management Technology',
  'Industrial Relations',
  'Local Government Administration',
];

export const LEVELS = ['100L', '200L', '300L', '400L', '500L', 'Postgraduate'];

export function getFallbackCover(
  courseCode?: string,
  title?: string,
  category?: string,
  department?: string
): string {
  const isNovel = category === 'Christian Novel';
  const code = (courseCode || (isNovel ? 'NOVEL' : 'DLCF')).toUpperCase().trim();
  const rawTitle = title || (isNovel ? 'Christian Novel' : 'Course Material');
  const cleanTitle = rawTitle.replace(/[<>&"]/g, '');
  const cleanDept = (department || (isNovel ? 'Inspirational' : 'Higher Learning')).replace(/[<>&"]/g, '');

  const primaryGrad1 = isNovel ? '#854d0e' : '#047857';
  const primaryGrad2 = isNovel ? '#451a03' : '#064e3b';
  const accentColor = isNovel ? '#fde047' : '#34d399';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryGrad1}" />
        <stop offset="100%" stop-color="${primaryGrad2}" />
      </linearGradient>
      <pattern id="pat" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="400" height="600" fill="url(#g)" />
    <rect width="400" height="600" fill="url(#pat)" />
    
    <!-- Spine effect -->
    <rect x="0" y="0" width="24" height="600" fill="rgba(0,0,0,0.3)" />
    <line x1="24" y1="0" x2="24" y2="600" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
    
    <!-- Frame -->
    <rect x="42" y="32" width="326" height="536" rx="10" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    <rect x="48" y="38" width="314" height="524" rx="8" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    
    <!-- DLCF Header Badge -->
    <rect x="65" y="55" width="125" height="26" rx="13" fill="rgba(255,255,255,0.15)" />
    <text x="127" y="72" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="10" font-weight="700" fill="${accentColor}" text-anchor="middle" letter-spacing="1">DLCF LIBRARY</text>
    
    <!-- Center Course Badge -->
    <rect x="65" y="150" width="280" height="100" rx="16" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
    <text x="205" y="212" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="36" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">${code.slice(0, 10)}</text>
    
    <!-- Title Text (2 lines) -->
    <text x="205" y="295" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="17" font-weight="700" fill="#ffffff" text-anchor="middle">
      <tspan x="205" dy="0">${cleanTitle.slice(0, 24)}</tspan>
      ${cleanTitle.length > 24 ? `<tspan x="205" dy="24">${cleanTitle.slice(24, 48)}</tspan>` : ''}
    </text>
    
    <!-- Divider & Department -->
    <line x1="65" y1="480" x2="345" y2="480" stroke="rgba(255,255,255,0.18)" stroke-width="1.5" />
    <text x="205" y="515" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.8)" text-anchor="middle">${cleanDept.slice(0, 34)}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const INITIAL_BOOKS: Book[] = [
  {
    id: '1',
    title: 'Introduction to Algorithms',
    category: BookCategory.ACADEMIC,
    description: 'A comprehensive guide to algorithms and data structures.',
    coverUrl: getFallbackCover('CSC 201', 'Introduction to Algorithms', 'Academic', 'Computer Science'),
    downloadUrl: '#',
    department: 'Computer Science',
    courseCode: 'CSC 201',
    courseTitle: 'Data Structures and Algorithms',
    level: '200L',
  },
  {
    id: '2',
    title: 'The Pilgrim\'s Progress',
    category: BookCategory.CHRISTIAN_NOVEL,
    description: 'A classic Christian allegory of the soul\'s journey.',
    coverUrl: getFallbackCover('', 'The Pilgrim\'s Progress', 'Christian Novel'),
    downloadUrl: '#',
  },
  {
    id: '3',
    title: 'Calculus: Early Transcendentals',
    category: BookCategory.ACADEMIC,
    description: 'Essential calculus concepts for science and engineering.',
    coverUrl: getFallbackCover('MTH 101', 'Calculus: Early Transcendentals', 'Academic', 'Mathematics'),
    downloadUrl: '#',
    department: 'Mathematics',
    courseCode: 'MTH 101',
    courseTitle: 'General Mathematics I',
    level: '100L',
  },
  {
    id: '4',
    title: 'In His Steps',
    category: BookCategory.CHRISTIAN_NOVEL,
    description: 'What would Jesus do? A challenge to modern discipleship.',
    coverUrl: getFallbackCover('', 'In His Steps', 'Christian Novel'),
    downloadUrl: '#',
  },
  {
    id: '5',
    title: 'Digital Logic Design',
    category: BookCategory.ACADEMIC,
    description: 'Fundamentals of digital systems and logic gates.',
    coverUrl: getFallbackCover('EEG 202', 'Digital Logic Design', 'Academic', 'Mechanical Engineering'),
    downloadUrl: '#',
    department: 'Mechanical Engineering',
    courseCode: 'EEG 202',
    courseTitle: 'Digital Electronics',
    level: '200L',
  },
  {
    id: '6',
    title: 'The Screwtape Letters',
    category: BookCategory.CHRISTIAN_NOVEL,
    description: 'A satirical look at spiritual warfare through demonic correspondence.',
    coverUrl: getFallbackCover('', 'The Screwtape Letters', 'Christian Novel'),
    downloadUrl: '#',
  },
];
