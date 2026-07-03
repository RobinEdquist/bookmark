import { planChapters, SpineItemLike } from '../utils/chapter-filter';

const XHTML = 'application/xhtml+xml';

function flowItem(id: string, href: string): SpineItemLike {
  return { id, href, 'media-type': XHTML };
}

describe('planChapters', () => {
  it('skips cover, toc, and copyright pages', () => {
    const flow = [
      flowItem('cover', 'cover.xhtml'),
      flowItem('toc', 'toc.xhtml'),
      flowItem('copyright-page', 'copyright.xhtml'),
      flowItem('ch1', 'chapter1.xhtml'),
    ];
    const toc = [{ title: 'Chapter 1', href: 'chapter1.xhtml' }];

    const chapters = planChapters(flow, toc);
    expect(chapters).toEqual([{ title: 'Chapter 1', flowIds: ['ch1'] }]);
  });

  it('does not skip Calibre index_split files', () => {
    const flow = [
      flowItem('id1', 'index_split_000.html'),
      flowItem('id2', 'index_split_001.html'),
    ];
    const chapters = planChapters(flow, []);
    expect(chapters.flatMap((c) => c.flowIds)).toEqual(['id1', 'id2']);
  });

  it('groups consecutive split files under the preceding TOC entry', () => {
    const flow = [
      flowItem('ch1a', 'ch01-1.xhtml'),
      flowItem('ch1b', 'ch01-2.xhtml'),
      flowItem('ch2', 'ch02.xhtml'),
    ];
    const toc = [
      { title: 'Chapter 1', href: 'ch01-1.xhtml' },
      { title: 'Chapter 2', href: 'ch02.xhtml' },
    ];

    expect(planChapters(flow, toc)).toEqual([
      { title: 'Chapter 1', flowIds: ['ch1a', 'ch1b'] },
      { title: 'Chapter 2', flowIds: ['ch2'] },
    ]);
  });

  it('matches TOC hrefs with anchors and relative prefixes', () => {
    const flow = [flowItem('ch1', 'Text/chapter1.xhtml')];
    const toc = [{ title: 'One', href: '../Text/chapter1.xhtml#start' }];
    expect(planChapters(flow, toc)).toEqual([
      { title: 'One', flowIds: ['ch1'] },
    ]);
  });

  it('falls back to basename matching when paths disagree', () => {
    const flow = [flowItem('ch1', 'OEBPS/Text/chapter1.xhtml')];
    const toc = [{ title: 'One', href: 'chapter1.xhtml' }];
    expect(planChapters(flow, toc)).toEqual([
      { title: 'One', flowIds: ['ch1'] },
    ]);
  });

  it('leaves title null for spine items without any TOC entry', () => {
    const flow = [flowItem('intro', 'body1.xhtml')];
    expect(planChapters(flow, [])).toEqual([
      { title: null, flowIds: ['intro'] },
    ]);
  });

  it('skips non-html spine items', () => {
    const flow: SpineItemLike[] = [
      { id: 'img', href: 'map.jpg', 'media-type': 'image/jpeg' },
      flowItem('ch1', 'ch1.xhtml'),
    ];
    expect(planChapters(flow, [])).toEqual([{ title: null, flowIds: ['ch1'] }]);
  });
});
