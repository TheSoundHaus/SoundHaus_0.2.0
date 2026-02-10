/**
 * File Utilities
 * Functions for file type detection, validation, and handling
 */

import { FileType } from '@/types/repository';

// File extension mappings
const FILE_TYPE_MAP: Record<string, FileType> = {
  // Audio
  mp3: 'audio',
  wav: 'audio',
  aiff: 'audio',
  aif: 'audio',
  flac: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  wma: 'audio',
  aac: 'audio',

  // Video
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  webm: 'video',

  // Images
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  bmp: 'image',
  ico: 'image',

  // Code
  js: 'code',
  jsx: 'code',
  ts: 'code',
  tsx: 'code',
  py: 'code',
  java: 'code',
  cpp: 'code',
  c: 'code',
  h: 'code',
  cs: 'code',
  go: 'code',
  rs: 'code',
  php: 'code',
  rb: 'code',
  swift: 'code',
  kt: 'code',
  scala: 'code',

  // Text/Markdown
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  log: 'text',
  csv: 'text',

  // Config/Data
  json: 'json',
  xml: 'xml',
  yaml: 'text',
  yml: 'text',
  toml: 'text',
  ini: 'text',
  env: 'text',

  // Documents
  pdf: 'pdf',

  // Archives
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  rar: 'archive',
  '7z': 'archive',

  // Ableton
  als: 'ableton',
  alc: 'ableton',
};

/**
 * Detect file type from filename or extension
 */
export function getFileType(filename: string): FileType {
  const ext = getFileExtension(filename).toLowerCase();
  return FILE_TYPE_MAP[ext] || 'unknown';
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/**
 * Get filename without extension
 */
export function getFileNameWithoutExtension(filename: string): string {
  const ext = getFileExtension(filename);
  return ext ? filename.slice(0, -(ext.length + 1)) : filename;
}

/**
 * Check if file is an audio file
 */
export function isAudioFile(filename: string): boolean {
  return getFileType(filename) === 'audio';
}

/**
 * Check if file is an image
 */
export function isImageFile(filename: string): boolean {
  return getFileType(filename) === 'image';
}

/**
 * Check if file is a text/code file (can be displayed with syntax highlighting)
 */
export function isTextFile(filename: string): boolean {
  const type = getFileType(filename);
  return ['text', 'code', 'markdown', 'json', 'xml'].includes(type);
}

/**
 * Check if file is binary (cannot be displayed as text)
 */
export function isBinaryFile(filename: string): boolean {
  const type = getFileType(filename);
  return ['audio', 'video', 'image', 'pdf', 'archive', 'ableton', 'binary'].includes(type);
}

/**
 * Check if file is an Ableton project file
 */
export function isAbletonFile(filename: string): boolean {
  return getFileType(filename) === 'ableton';
}

/**
 * Get language for syntax highlighting based on file extension
 */
export function getSyntaxLanguage(filename: string): string {
  const ext = getFileExtension(filename).toLowerCase();

  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    dockerfile: 'dockerfile',
  };

  return languageMap[ext] || 'text';
}

/**
 * Get icon name/emoji for file type
 */
export function getFileIcon(filename: string, type?: 'file' | 'dir'): string {
  if (type === 'dir') return '📁';

  const fileType = getFileType(filename);
  const iconMap: Record<FileType, string> = {
    audio: '🎵',
    video: '🎬',
    image: '🖼️',
    text: '📄',
    code: '💻',
    markdown: '📝',
    json: '📋',
    xml: '📋',
    pdf: '📕',
    archive: '📦',
    ableton: '🎹',
    binary: '⚙️',
    unknown: '📄',
  };

  return iconMap[fileType] || '📄';
}

/**
 * Check if filename matches a pattern (glob-like)
 */
export function matchesPattern(filename: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i'
  );
  return regex.test(filename);
}

/**
 * Sort files/folders for display (folders first, then alphabetically)
 */
export function sortFileList<T extends { name: string; type: 'file' | 'dir' }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    // Directories first
    if (a.type === 'dir' && b.type !== 'dir') return -1;
    if (a.type !== 'dir' && b.type === 'dir') return 1;

    // Then alphabetically
    return a.name.localeCompare(b.name);
  });
}

/**
 * Check if file is likely to be tracked by Git LFS based on size and type
 */
export function isLikelyLfsFile(filename: string, sizeBytes: number): boolean {
  const type = getFileType(filename);
  const largeSizeThreshold = 10 * 1024 * 1024; // 10 MB

  // Audio files are typically LFS
  if (type === 'audio' && sizeBytes > 1024 * 1024) return true;

  // Video files are typically LFS
  if (type === 'video') return true;

  // Large files in general
  if (sizeBytes > largeSizeThreshold) return true;

  return false;
}
