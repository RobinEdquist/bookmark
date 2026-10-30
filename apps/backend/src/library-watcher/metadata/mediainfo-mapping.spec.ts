import type { MediaInfoResult } from 'mediainfo.js';
import {
  describeCodec,
  mapMediaInfoToMetadata,
  type MediaInfoTrack,
} from './mediainfo-mapping';

// Track shapes below are what mediainfo.js 0.3.x returns for files produced
// with ffmpeg (sine source) — see the matching ffmpeg encoders in each name.
const result = (...tracks: MediaInfoTrack[]): MediaInfoResult =>
  ({ media: { track: tracks } }) as unknown as MediaInfoResult;

const mp4General: MediaInfoTrack = {
  '@type': 'General',
  Format: 'MPEG-4',
  Format_Profile: 'Base Media',
  Duration: 34627.2,
  OverallBitRate: 770483,
  Title: 'Chamber of Secrets',
};

describe('describeCodec', () => {
  it('joins the AAC profile onto the family name', () => {
    expect(
      describeCodec({
        '@type': 'Audio',
        Format: 'AAC',
        Format_AdditionalFeatures: 'LC',
      }),
    ).toBe('AAC LC');
  });

  it('collapses MPEG Audio layers to MP1/MP2/MP3', () => {
    expect(
      describeCodec({
        '@type': 'Audio',
        Format: 'MPEG Audio',
        Format_Profile: 'Layer 3',
      }),
    ).toBe('MP3');
    expect(
      describeCodec({
        '@type': 'Audio',
        Format: 'MPEG Audio',
        Format_Profile: 'Layer 2',
      }),
    ).toBe('MP2');
    expect(describeCodec({ '@type': 'Audio', Format: 'MPEG Audio' })).toBe(
      'MPEG Audio',
    );
  });

  it('keeps plain formats as they are', () => {
    expect(describeCodec({ '@type': 'Audio', Format: 'E-AC-3' })).toBe(
      'E-AC-3',
    );
    expect(describeCodec({ '@type': 'Audio', Format: 'Opus' })).toBe('Opus');
    expect(describeCodec({ '@type': 'Audio', Format: 'FLAC' })).toBe('FLAC');
  });

  it('returns undefined without an audio track or format', () => {
    expect(describeCodec(undefined)).toBeUndefined();
    expect(describeCodec({ '@type': 'Audio' })).toBeUndefined();
    expect(describeCodec({ '@type': 'Audio', Format: '  ' })).toBeUndefined();
  });
});

describe('mapMediaInfoToMetadata', () => {
  it('reports the container as format and the stream as codec (E-AC-3 in MP4)', () => {
    const metadata = mapMediaInfoToMetadata(
      result(mp4General, {
        '@type': 'Audio',
        Format: 'E-AC-3',
        Format_Commercial_IfAny: 'Dolby Digital Plus',
        BitRate: 768000,
        BitRate_Mode: 'CBR',
        SamplingRate: 48000,
        Channels: 6,
      }),
    );

    expect(metadata.format).toBe('MPEG-4');
    expect(metadata.codec).toBe('E-AC-3');
    expect(metadata.bitrate).toBe(768000);
    expect(metadata.sampleRate).toBe(48000);
    expect(metadata.duration).toBe(34627);
  });

  it('keeps bitrate in bits per second for AAC and MP3', () => {
    const aac = mapMediaInfoToMetadata(
      result(mp4General, {
        '@type': 'Audio',
        Format: 'AAC',
        Format_AdditionalFeatures: 'LC',
        BitRate: 64213,
        SamplingRate: 44100,
      }),
    );
    expect(aac.codec).toBe('AAC LC');
    expect(aac.bitrate).toBe(64213);

    const mp3 = mapMediaInfoToMetadata(
      result(
        { '@type': 'General', Format: 'MPEG Audio', OverallBitRate: 127999 },
        {
          '@type': 'Audio',
          Format: 'MPEG Audio',
          Format_Profile: 'Layer 3',
          BitRate: 128000,
          SamplingRate: 44100,
        },
      ),
    );
    expect(mp3.format).toBe('MPEG Audio');
    expect(mp3.codec).toBe('MP3');
    expect(mp3.bitrate).toBe(128000);
  });

  it('falls back to the overall bitrate when the stream has none (Opus in Ogg)', () => {
    const metadata = mapMediaInfoToMetadata(
      result(
        { '@type': 'General', Format: 'Ogg', OverallBitRate: 60009.4 },
        { '@type': 'Audio', Format: 'Opus', SamplingRate: 48000 },
      ),
    );

    expect(metadata.format).toBe('Ogg');
    expect(metadata.codec).toBe('Opus');
    expect(metadata.bitrate).toBe(60009);
    expect(metadata.sampleRate).toBe(48000);
  });

  it('leaves bitrate, codec and sample rate unset without an audio track', () => {
    const metadata = mapMediaInfoToMetadata(result(mp4General));

    expect(metadata.format).toBe('MPEG-4');
    expect(metadata.codec).toBeUndefined();
    expect(metadata.sampleRate).toBeUndefined();
    // the container rate is still the best estimate we have
    expect(metadata.bitrate).toBe(770483);
  });

  it('returns nothing when mediainfo found no General track', () => {
    expect(mapMediaInfoToMetadata(result())).toEqual({});
    expect(mapMediaInfoToMetadata({} as unknown as MediaInfoResult)).toEqual(
      {},
    );
  });
});
