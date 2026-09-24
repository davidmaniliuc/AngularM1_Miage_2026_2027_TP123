import { describe, it, expect } from 'vitest';
import { MAX_AUDIO_SIZE, formatFormat, formatSize, validateAudioFile } from './audio-file';

const fileOf = (type: string, size: number, name = 'piste.mp3') => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('validateAudioFile', () => {
  it('requires a file', () => {
    expect(validateAudioFile(undefined)).toBe('Choisissez un fichier audio.');
  });

  it('rejects a format the backend does not accept', () => {
    expect(validateAudioFile(fileOf('image/png', 1000, 'photo.png'))).toContain('Format non accepté');
  });

  it('rejects a file larger than 100 Mo', () => {
    expect(validateAudioFile(fileOf('audio/mpeg', MAX_AUDIO_SIZE + 1))).toContain('100 Mo');
  });

  it('accepts an mp3 of exactly 100 Mo', () => {
    expect(MAX_AUDIO_SIZE).toBe(100 * 1024 * 1024);
    expect(validateAudioFile(fileOf('audio/mpeg', MAX_AUDIO_SIZE))).toBeNull();
  });

  it('accepts FLAC, whatever MIME variant the browser sends', () => {
    expect(validateAudioFile(fileOf('audio/flac', 1000, 'a.flac'))).toBeNull();
    expect(validateAudioFile(fileOf('audio/x-flac', 1000, 'a.flac'))).toBeNull();
  });
});

describe('formatSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatSize(512)).toBe('512 o');
    expect(formatSize(2048)).toBe('2 Ko');
    expect(formatSize(10_313_062)).toBe('9,8 Mo');
  });
});

describe('formatFormat', () => {
  it('turns a MIME type into a short label', () => {
    expect(formatFormat('audio/mpeg')).toBe('MP3');
    expect(formatFormat('audio/x-m4a')).toBe('M4A');
    expect(formatFormat('audio/flac')).toBe('FLAC');
  });
});
