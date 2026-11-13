/**
 * ============================================================================
 * E-Library Batch Ingestion Script: Google Drive -> Supabase
 * ============================================================================
 * Features:
 * 1. Connects to Google Drive using `googleapis` & Service Account (`credentials.json`)
 * 2. Connects to Supabase using `@supabase/supabase-js`
 * 3. Performs a recursive flat scan across all nested folders
 * 4. Robust regex parsing for Course Codes (e.g., 'CSC 303'), Levels ('300L'),
 *    Material Types ('Past Question' vs 'Course Material'), and clean Titles
 * 5. Master Course allocation: Queries master `courses` table or prefix mapping
 *    to allocate to official "Mother Department" and prevent cross-dept duplication
 * 6. Computes MD5 checksum before upload to strictly skip duplicate files
 * 7. Downloads binary, uploads to public Supabase bucket `course-materials`,
 *    and inserts clean metadata + public URL into `course_materials` table
 * ============================================================================
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables (.env in current dir, or parent dir)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Configuration & Defaults
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(__dirname, 'credentials.json');
const STORAGE_BUCKET = 'course-materials';

// Canonical Mother Department Prefix Dictionary
const PREFIX_TO_DEPARTMENT = {
  // Faculty of Sciences
  CSC: 'Computer Science',
  CMP: 'Computer Science',
  CIT: 'Computer Science',
  ICT: 'Computer Science',
  MTH: 'Mathematics',
  MAT: 'Mathematics',
  PHY: 'Physics',
  CHM: 'Chemistry',
  BIO: 'Botany',
  BOT: 'Botany',
  ZOO: 'Zoology',
  BCH: 'Biochemistry',
  MCB: 'Microbiology',

  // Faculty of Engineering
  EEG: 'Mechanical Engineering',
  EEE: 'Mechanical Engineering',
  MEE: 'Mechanical Engineering',
  CHE: 'Chemical Engineering',
  CVE: 'Civil Engineering',

  // Medical & Health Sciences
  MED: 'Medicine and Surgery',
  NUR: 'Nursing',
  PHA: 'Pharmacy',
  PCO: 'Pharmacology',
  MLS: 'Medical Laboratory Science',

  // Faculty of Management Sciences
  ACC: 'Accounting',
  BUS: 'Business Administration',
  BFN: 'Business Administration',
  PAD: 'Public Administration',
  PUB: 'Public Administration',
  INS: 'Insurance',
  MKT: 'Marketing',
  IRP: 'Industrial Relations',

  // Faculty of Social Sciences
  ECO: 'Economics',
  SOC: 'Sociology',
  POS: 'Political Science',
  POL: 'Political Science',
  PSY: 'Psychology',
  GEO: 'Geography',

  // Faculty of Arts
  ENG: 'English Language',
  LIT: 'English Language',
  POR: 'Portuguese',
  LIN: 'Linguistics',
  HIS: 'History and International Studies',
  MUS: 'Music',
  FRN: 'French',
  FRE: 'French',
  THA: 'Theatre Art',
  CRS: 'Christian Religion',
  CRK: 'Christian Religion',
  ISS: 'Islamic Religion',
  IRK: 'Islamic Religion',
  ARA: 'Arabic',

  // Faculty of Law
  LAW: 'Common Law',
  PUL: 'Common Law',
  PRL: 'Commercial Law',
  JUR: 'Common Law',

  // Faculty of Education & General Studies
  GNS: 'General Studies',
  GST: 'General Studies',
  EDU: 'Educational Foundations',
  EDF: 'Educational Foundations',
  EDM: 'Educational Management',
};

/**
 * Extracts a Google Drive folder ID from a URL or raw ID
 */
function extractFolderId(input) {
  if (!input) return null;
  const folderMatch = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const queryMatch = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];
  return input.trim();
}

/**
 * Robust regex filename parser
 */
export function parseFilename(fileName) {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  // Match 2-4 letter prefix + optional separator + 3-4 digits (with optional letter suffix, e.g., '101A')
  // Uses negative lookahead/lookbehind or delimiter boundaries so underscores (e.g. 'CSC303_notes') match accurately
  const codeRegex = /(?:^|[^A-Za-z0-9])([A-Za-z]{2,4})\s*[-_]?\s*([0-9]{3,4}[A-Za-z]?)(?![0-9A-Za-z])/i;
  const match = baseName.match(codeRegex);

  let courseCode = null;
  let departmentPrefix = null;
  let level = '100L';
  let rawTitle = baseName;

  if (match) {
    departmentPrefix = match[1].toUpperCase();
    const courseNumber = match[2].toUpperCase();
    courseCode = `${departmentPrefix} ${courseNumber}`;

    // Level derived from first digit
    const firstDigit = courseNumber.charAt(0);
    if (firstDigit >= '1' && firstDigit <= '6') {
      level = `${firstDigit}00L`;
    } else if (firstDigit >= '7') {
      level = 'Postgraduate';
    }

    // Strip course code pattern from title
    rawTitle = baseName.replace(match[0], ' ');
  }

  // Detect Material Type
  const lowerBase = baseName.toLowerCase();
  let materialType = 'Course Material';
  if (
    lowerBase.includes('past question') ||
    lowerBase.includes('past-question') ||
    lowerBase.includes('pq') ||
    lowerBase.includes('exam') ||
    lowerBase.includes('test') ||
    lowerBase.includes('quiz')
  ) {
    materialType = 'Past Question';
  }

  // Clean noise, brackets, separators, extra spaces
  let cleanTitle = rawTitle
    .replace(/[\[\]\(\)\{\}]/g, ' ')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If title was completely stripped, provide a clean default
  if (!cleanTitle || cleanTitle.length < 3) {
    cleanTitle = courseCode ? `${courseCode} ${materialType}` : baseName;
  }

  return {
    courseCode,
    departmentPrefix,
    level,
    title: cleanTitle,
    materialType,
    extension: ext.toLowerCase(),
  };
}

/**
 * Ensures the Supabase storage bucket exists and is marked as public
 */
async function ensureBucket(supabase, bucketName) {
  // Check if bucket already exists directly
  const { data: bucket, error: getErr } = await supabase.storage.getBucket(bucketName);
  if (bucket) {
    return;
  }

  // Fallback: Check in bucket list
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === bucketName)) {
    return;
  }

  console.log(`[Storage] Bucket "${bucketName}" not found. Creating public bucket...`);
  // Do not hardcode fileSizeLimit: Supabase Free tier caps at 50MB and rejects 100MB requests
  const { error: createErr } = await supabase.storage.createBucket(bucketName, {
    public: true,
  });

  if (createErr && !createErr.message.includes('already exists')) {
    console.warn(`[Storage Note] Bucket create returned: ${createErr.message}. Continuing with upload...`);
  }
}

/**
 * Recursively scans a Google Drive folder and returns a flat array of all files
 */
async function getDriveFilesFlat(drive, rootFolderId) {
  const queue = [rootFolderId];
  const allFiles = [];
  const visitedFolders = new Set();

  console.log(`[Google Drive] Starting flat recursive scan of folder: ${rootFolderId}`);

  while (queue.length > 0) {
    const currentFolderId = queue.shift();
    if (visitedFolders.has(currentFolderId)) continue;
    visitedFolders.add(currentFolderId);

    let pageToken = null;
    do {
      const res = await drive.files.list({
        q: `'${currentFolderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, md5Checksum)',
        pageSize: 1000,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const items = res.data.files || [];
      for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          queue.push(item.id);
        } else {
          allFiles.push(item);
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  console.log(`[Google Drive] Scan complete! Found ${allFiles.length} file(s) across all nested folders.`);
  return allFiles;
}

/**
 * Self-test suite for filename regex parsing
 */
function runRegexTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING FILENAME REGEX PARSER TEST SUITE');
  console.log('================================================================');

  const testCases = [
    'CSC 303 - Operating Systems.pdf',
    'CSC303_Lecture_Notes_Week_1.pdf',
    'MTH 101 Calculus past questions 2021.docx',
    '[CSC 201] Data Structures & Algorithms (Module 1).pdf',
    'EEG 202 - Digital Electronics Handout.pdf',
    'GST 101 - Use of English.pdf',
    'CSC 415 Distributed Systems exam pq.pdf',
    'PHY 102 General Physics II (2023).pdf',
    'ACC 203 Financial Accounting II Exam PQ.pdf',
    'CHM 111L General Chemistry Laboratory Manual.pdf',
    'LAW 301 Commercial Law Past Question 2020.pdf',
  ];

  testCases.forEach((filename) => {
    const parsed = parseFilename(filename);
    const dept = parsed.departmentPrefix ? PREFIX_TO_DEPARTMENT[parsed.departmentPrefix] || 'Unknown' : 'General';
    console.log(`Input:       "${filename}"`);
    console.log(`  Code:      ${parsed.courseCode || 'N/A'}`);
    console.log(`  Level:     ${parsed.level}`);
    console.log(`  Dept:      ${dept}`);
    console.log(`  Type:      ${parsed.materialType}`);
    console.log(`  Title:     "${parsed.title}"`);
    console.log('----------------------------------------------------------------');
  });

  console.log('All regex tests displayed successfully.\n');
}

// ---------------------------------------------------------------------------
// MAIN PIPELINE
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
DLCF E-Library Google Drive Ingestion Tool
Usage:
  node ingest-drive.js <FOLDER_ID_OR_LINK> [options]

Options:
  --dry-run       Scan and parse files, check checksums, but do not upload
  --test-regex    Run built-in regex tests on sample filenames
  --help, -h      Show this help message

Environment Variables (.env):
  SUPABASE_URL                    Your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY       Your Supabase service role key (or ANON key)
  GOOGLE_APPLICATION_CREDENTIALS  Path to Service Account credentials.json
  GOOGLE_DRIVE_FOLDER_ID          Default Google Drive folder ID or share URL
`);
    return;
  }

  if (args.includes('--test-regex')) {
    runRegexTests();
    return;
  }

  const isDryRun = args.includes('--dry-run');

  console.log('================================================================');
  console.log('🚀 DLCF E-LIBRARY: GOOGLE DRIVE BATCH INGESTION PIPELINE');
  if (isDryRun) {
    console.log('⚠️  MODE: DRY RUN (No files will be uploaded or inserted)');
  }
  console.log('================================================================');

  // Validate Supabase
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Supabase credentials are missing.');
    console.error('Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
    process.exit(1);
  }

  // Validate Google Credentials
  if (!fs.existsSync(GOOGLE_CREDENTIALS_PATH)) {
    console.error(`❌ Error: Google Service Account key not found at "${GOOGLE_CREDENTIALS_PATH}".`);
    console.error('Please place your credentials.json file in this directory or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }

  // Resolve target folder
  const targetFolderInput = args.find((a) => !a.startsWith('--')) || process.env.GOOGLE_DRIVE_FOLDER_ID;
  const folderId = extractFolderId(targetFolderInput);

  if (!folderId) {
    console.error('❌ Error: No Google Drive folder ID or URL provided.');
    console.log('\nUsage:');
    console.log('  node ingest-drive.js <FOLDER_ID_OR_SHARE_LINK>');
    console.log('  node ingest-drive.js --help\n');
    process.exit(1);
  }

  // Initialize Clients
  console.log(`[Init] Connecting to Google Drive via Service Account (${path.basename(GOOGLE_CREDENTIALS_PATH)})...`);
  const auth = new google.auth.GoogleAuth({
    keyFile: GOOGLE_CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  console.log(`[Init] Connecting to Supabase at: ${SUPABASE_URL}...`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  if (!isDryRun) {
    await ensureBucket(supabase, STORAGE_BUCKET);
  }

  // Preload Master Courses Catalog
  console.log('[Master Data] Pre-fetching master `courses` catalog to prevent cross-dept duplication...');
  const courseLookupMap = new Map();
  const { data: dbCourses, error: coursesError } = await supabase
    .from('courses')
    .select('*');

  if (coursesError) {
    console.warn(`[Master Data Warning] Could not fetch courses table (${coursesError.message}). Using fallback prefix dictionary.`);
  } else if (dbCourses) {
    for (const c of dbCourses) {
      const codeKey = (c.code || c.course_code || '').trim().toUpperCase();
      if (codeKey) courseLookupMap.set(codeKey, c);
    }
    console.log(`[Master Data] Loaded ${courseLookupMap.size} canonical courses from database.`);
  }

  // Pre-load already ingested files from Supabase to skip them INSTANTLY without downloading
  console.log('[Master Data] Pre-fetching already ingested files from Supabase...');
  const existingDriveIds = new Set();
  const existingFileHashes = new Set();
  const { data: existingRows, error: existingErr } = await supabase
    .from('course_materials')
    .select('drive_file_id, file_hash');

  if (existingRows) {
    for (const r of existingRows) {
      if (r.drive_file_id) existingDriveIds.add(r.drive_file_id);
      if (r.file_hash) existingFileHashes.add(r.file_hash);
    }
    console.log(`[Master Data] Found ${existingDriveIds.size} already ingested files. These will be skipped instantly!`);
  }

  // Flat scan drive folder
  const driveFiles = await getDriveFilesFlat(drive, folderId);
  if (driveFiles.length === 0) {
    console.log('No files found to ingest. Exiting.');
    return;
  }

  // Process files
  const stats = {
    total: driveFiles.length,
    processed: 0,
    skippedDuplicates: 0,
    failed: 0,
    failedFiles: [],
  };

  console.log('\n----------------------------------------------------------------');
  console.log(`Starting processing of ${driveFiles.length} file(s)...`);
  console.log('----------------------------------------------------------------\n');

  for (let i = 0; i < driveFiles.length; i++) {
    const file = driveFiles[i];
    const indexStr = `[${i + 1}/${driveFiles.length}]`;

    // Instant Skip: If this Google Drive file ID or MD5 checksum was already ingested into Supabase
    if (existingDriveIds.has(file.id) || (file.md5Checksum && existingFileHashes.has(file.md5Checksum))) {
      console.log(`${indexStr} ⏩ [SKIPPED - ALREADY INGESTED] "${file.name}"`);
      stats.skippedDuplicates++;
      continue;
    }

    console.log(`${indexStr} Analyzing: "${file.name}" (ID: ${file.id})`);

    try {
      // Step A: Parse filename
      const parsed = parseFilename(file.name);
      const isNovel = !parsed.courseCode;
      const category = isNovel ? 'Christian Novel' : 'Academic';
      let canonicalDepartment = isNovel ? '' : 'General Academic';
      let canonicalLevel = isNovel ? '' : parsed.level;
      let courseId = null;

      if (parsed.courseCode) {
        const lookup = courseLookupMap.get(parsed.courseCode.toUpperCase());
        if (lookup) {
          canonicalDepartment = lookup.department || lookup.mother_department || canonicalDepartment;
          canonicalLevel = lookup.level || canonicalLevel;
          courseId = lookup.id || null;
        } else if (parsed.departmentPrefix && PREFIX_TO_DEPARTMENT[parsed.departmentPrefix]) {
          canonicalDepartment = PREFIX_TO_DEPARTMENT[parsed.departmentPrefix];
        }
      }

      // Step B: Download binary or read MD5 Checksum
      let fileBuffer = null;
      let md5Hash = file.md5Checksum;
      let contentType = file.mimeType || 'application/pdf';

      // Check for Google Workspace native docs (Docs, Sheets, Slides) which require export rather than alt=media
      const isGoogleDoc = file.mimeType === 'application/vnd.google-apps.document';
      const isGooglePresentation = file.mimeType === 'application/vnd.google-apps.presentation';
      const isGoogleSpreadsheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
      const isNonDownloadableGoogleApp =
        file.mimeType &&
        file.mimeType.startsWith('application/vnd.google-apps.') &&
        !isGoogleDoc &&
        !isGooglePresentation &&
        !isGoogleSpreadsheet;

      if (isNonDownloadableGoogleApp) {
        console.log(`  ⏩ [SKIPPED] Non-downloadable Google Workspace item (${file.mimeType})`);
        stats.skippedDuplicates++;
        continue;
      }

      // Download buffer if not dry run
      if (!isDryRun) {
        if (isGoogleDoc || isGooglePresentation || isGoogleSpreadsheet) {
          // Export native Google Docs / Slides / Sheets to PDF
          console.log(`  🔄 Exporting Google Workspace item (${file.mimeType}) to PDF...`);
          const exportRes = await drive.files.export(
            { fileId: file.id, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
          );
          fileBuffer = Buffer.from(exportRes.data);
          contentType = 'application/pdf';
        } else {
          const res = await drive.files.get(
            { fileId: file.id, alt: 'media', supportsAllDrives: true },
            { responseType: 'arraybuffer' }
          );
          fileBuffer = Buffer.from(res.data);
        }
        md5Hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
      }

      // Step C: Check duplicate in Supabase course_materials by file_hash
      const { data: existing, error: dupErr } = await supabase
        .from('course_materials')
        .select('id, title, course_code, file_hash')
        .eq('file_hash', md5Hash)
        .maybeSingle();

      if (dupErr && !dupErr.message.includes('No rows')) {
        console.warn(`  ⚠️ Duplicate check error: ${dupErr.message}`);
      }

      if (existing) {
        console.log(`  ⏩ [SKIPPED - DUPLICATE] Hash match (${md5Hash}). Already stored as "${existing.title}" [${existing.course_code || 'N/A'}]`);
        stats.skippedDuplicates++;
        continue;
      }

      if (isDryRun) {
        console.log(`  🔎 [DRY RUN READY] ${parsed.courseCode || 'GENERAL'} | ${canonicalDepartment} (${canonicalLevel}) | "${parsed.title}" (Hash: ${md5Hash})`);
        stats.processed++;
        continue;
      }

      // Step D: Upload to Supabase Storage
      const sanitizedCourseFolder = parsed.courseCode ? parsed.courseCode.replace(/\s+/g, '_') : 'GENERAL';
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `${sanitizedCourseFolder}/${md5Hash}-${sanitizedName}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Step E: Retrieve Public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // Step F: Insert Clean Metadata into `course_materials`
      const payload = {
        title: parsed.title,
        category: category,
        course_code: isNovel ? '' : (parsed.courseCode || ''),
        course_id: courseId,
        department: canonicalDepartment,
        level: canonicalLevel,
        material_type: isNovel ? 'Novel' : parsed.materialType,
        file_url: publicUrl,
        download_url: publicUrl,
        file_name: file.name,
        file_size: fileBuffer.length,
        mime_type: contentType,
        file_hash: md5Hash,
        drive_file_id: file.id,
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('course_materials')
        .insert(payload);

      if (insertError) {
        // Fallback: If category or course_id columns are missing or have foreign key issues, retry gracefully
        if (insertError.message.includes('category')) {
          delete payload.category;
        }
        if (insertError.message.includes('course_id') || insertError.message.includes('foreign key')) {
          delete payload.course_id;
        }
        const { error: retryErr } = await supabase.from('course_materials').insert(payload);
        if (retryErr) throw retryErr;
      }

      // Step G: Dual-sync into `books` table for seamless display on current frontend
      try {
        await supabase.from('books').upsert({
          title: parsed.title,
          category: category,
          department: canonicalDepartment,
          level: canonicalLevel,
          course_code: isNovel ? '' : (parsed.courseCode || ''),
          course_title: parsed.title,
          material_type: isNovel ? 'Novel' : parsed.materialType,
          download_url: publicUrl,
          cover_url: `https://picsum.photos/seed/${encodeURIComponent(parsed.courseCode || 'book')}/400/600`,
          description: isNovel ? 'Christian Novel' : `Google Drive Ingestion: ${file.name}`,
          file_name: file.name,
          file_size: fileBuffer.length,
          mime_type: contentType,
        }, { onConflict: 'download_url' });
      } catch (bookSyncErr) {
        // Safe to ignore if books table has custom schema or constraints
      }

      console.log(`  ✅ [INGESTED] [${category}] ${parsed.courseCode || 'GENERAL'} | ${canonicalDepartment || 'N/A'} | "${parsed.title}"`);
      stats.processed++;
    } catch (fileErr) {
      console.error(`  ❌ [FAILED] File "${file.name}":`, fileErr.message);
      stats.failed++;
      stats.failedFiles.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        error: fileErr.message,
      });
    }
  }

  // Write failure log if any files failed
  if (stats.failedFiles.length > 0) {
    const failureLogPath = path.resolve(__dirname, 'ingestion-failures.json');
    fs.writeFileSync(failureLogPath, JSON.stringify(stats.failedFiles, null, 2));
    console.log(`⚠️ Detailed error report written to: ${failureLogPath}`);
  }

  // Summary Report
  console.log('\n================================================================');
  console.log('📊 INGESTION SUMMARY');
  console.log('================================================================');
  console.log(`Total files scanned:       ${stats.total}`);
  console.log(`Successfully ingested:     ${stats.processed}`);
  console.log(`Skipped duplicates (hash): ${stats.skippedDuplicates}`);
  console.log(`Failures:                  ${stats.failed}`);
  if (stats.failed > 0) {
    console.log(`Check "ingestion-failures.json" for the full breakdown of failed items.`);
  }
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n💥 Fatal Ingestion Error:', err);
  process.exit(1);
});
