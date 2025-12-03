// apps/backend/src/library-watcher/__tests__/library-watcher.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MediaDetectorService } from '../media-detector.service';
import { isAudioFile, AUDIO_EXTENSIONS } from '../utils/audio-file.utils';

describe('MediaDetectorService', () => {
  let detector: MediaDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaDetectorService],
    }).compile();

    detector = module.get<MediaDetectorService>(MediaDetectorService);
  });

  it('should be defined', () => {
    expect(detector).toBeDefined();
  });
});

describe('Audio File Utils', () => {
  describe('isAudioFile', () => {
    it('should return true for supported audio extensions', () => {
      expect(isAudioFile('test.m4b')).toBe(true);
      expect(isAudioFile('test.mp3')).toBe(true);
      expect(isAudioFile('test.m4a')).toBe(true);
      expect(isAudioFile('test.ogg')).toBe(true);
      expect(isAudioFile('test.flac')).toBe(true);
    });

    it('should return false for non-audio files', () => {
      expect(isAudioFile('test.txt')).toBe(false);
      expect(isAudioFile('test.jpg')).toBe(false);
      expect(isAudioFile('test.pdf')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isAudioFile('test.M4B')).toBe(true);
      expect(isAudioFile('test.MP3')).toBe(true);
    });
  });

  describe('AUDIO_EXTENSIONS', () => {
    it('should include expected formats', () => {
      expect(AUDIO_EXTENSIONS).toContain('.m4b');
      expect(AUDIO_EXTENSIONS).toContain('.mp3');
      expect(AUDIO_EXTENSIONS).toContain('.m4a');
      expect(AUDIO_EXTENSIONS).toContain('.ogg');
      expect(AUDIO_EXTENSIONS).toContain('.opus');
      expect(AUDIO_EXTENSIONS).toContain('.flac');
      expect(AUDIO_EXTENSIONS).toContain('.aac');
    });
  });
});
