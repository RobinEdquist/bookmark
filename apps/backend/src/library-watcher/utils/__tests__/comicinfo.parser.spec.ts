import { parseComicInfoXml } from '../comicinfo.parser';

const FULL_XML = `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>The End</Title>
  <Series>Saga</Series>
  <Number>54</Number>
  <Count>54</Count>
  <Volume>2012</Volume>
  <Summary>The final issue of arc nine.</Summary>
  <Year>2018</Year>
  <Month>7</Month>
  <Day>25</Day>
  <Writer>Brian K. Vaughan</Writer>
  <Penciller>Fiona Staples</Penciller>
  <Inker>Fiona Staples</Inker>
  <Colorist>Fiona Staples</Colorist>
  <Letterer>Fonografiks</Letterer>
  <CoverArtist>Fiona Staples</CoverArtist>
  <Editor>Eric Stephenson, Other Editor</Editor>
  <Publisher>Image Comics</Publisher>
  <Imprint></Imprint>
  <Genre>Science Fiction, Fantasy</Genre>
  <PageCount>32</PageCount>
  <LanguageISO>en</LanguageISO>
  <Format></Format>
  <AgeRating>Mature 17+</AgeRating>
  <Pages>
    <Page Image="0" Type="FrontCover" />
    <Page Image="1" />
  </Pages>
</ComicInfo>`;

describe('parseComicInfoXml', () => {
  it('parses a full ComicInfo.xml', () => {
    const info = parseComicInfoXml(FULL_XML);
    expect(info).not.toBeNull();
    expect(info!.title).toBe('The End');
    expect(info!.series).toBe('Saga');
    expect(info!.number).toBe('54');
    expect(info!.count).toBe(54);
    expect(info!.volume).toBe(2012);
    expect(info!.summary).toBe('The final issue of arc nine.');
    expect(info!.coverDate).toBe('2018-07-25');
    expect(info!.creators).toEqual([
      { name: 'Brian K. Vaughan', role: 'writer' },
      { name: 'Fiona Staples', role: 'penciller' },
      { name: 'Fiona Staples', role: 'inker' },
      { name: 'Fiona Staples', role: 'colorist' },
      { name: 'Fonografiks', role: 'letterer' },
      { name: 'Fiona Staples', role: 'cover_artist' },
      { name: 'Eric Stephenson', role: 'editor' },
      { name: 'Other Editor', role: 'editor' },
    ]);
    expect(info!.publisher).toBe('Image Comics');
    expect(info!.genres).toEqual(['Science Fiction', 'Fantasy']);
    expect(info!.pageCount).toBe(32);
    expect(info!.languageIso).toBe('en');
    expect(info!.ageRating).toBe('Mature 17+');
    expect(info!.format).toBe('single_issue');
    expect(info!.frontCoverPageIndex).toBe(0);
  });

  it('maps Format values to the format enum', () => {
    const xml = (format: string) =>
      `<ComicInfo><Series>X</Series><Format>${format}</Format></ComicInfo>`;
    expect(parseComicInfoXml(xml('TPB'))!.format).toBe('tpb');
    expect(parseComicInfoXml(xml('Trade Paperback'))!.format).toBe('tpb');
    expect(parseComicInfoXml(xml('Omnibus'))!.format).toBe('omnibus');
    expect(parseComicInfoXml(xml('Annual'))!.format).toBe('annual');
    expect(parseComicInfoXml(xml('One-Shot'))!.format).toBe('one_shot');
    expect(parseComicInfoXml(xml('Graphic Novel'))!.format).toBe(
      'graphic_novel',
    );
    expect(parseComicInfoXml(xml('Limited Series'))!.format).toBe('other');
  });

  it('handles partial date (year only)', () => {
    const info = parseComicInfoXml(
      '<ComicInfo><Series>X</Series><Year>2020</Year></ComicInfo>',
    );
    expect(info!.coverDate).toBe('2020-01-01');
  });

  it('returns null for malformed XML', () => {
    expect(parseComicInfoXml('not xml at all <<<')).toBeNull();
  });

  it('treats small Volume values as volume number, not year', () => {
    const info = parseComicInfoXml(
      '<ComicInfo><Series>X</Series><Volume>2</Volume></ComicInfo>',
    );
    expect(info!.volume).toBe(2);
    expect(info!.volumeIsYear).toBe(false);
  });

  it('flags year-style Volume values', () => {
    const info = parseComicInfoXml(
      '<ComicInfo><Series>X</Series><Volume>2012</Volume></ComicInfo>',
    );
    expect(info!.volume).toBe(2012);
    expect(info!.volumeIsYear).toBe(true);
  });
});
