const ACQUISITION_TYPE =
  'application/atom+xml;profile=opds-catalog;kind=acquisition';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildOpenSearchDescription(
  baseUrl: string,
  name: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${escapeXml(name)}</ShortName>
  <Description>Search the ${escapeXml(name)} catalog</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="${ACQUISITION_TYPE}" template="${escapeXml(baseUrl)}/search?q={searchTerms}"/>
</OpenSearchDescription>`;
}

export function searchFeedUrl(
  baseUrl: string,
  query: string,
  page: number,
): string {
  return `${baseUrl}/search?${new URLSearchParams({ q: query, page: String(page) })}`;
}

export function searchPaginationLinks(
  baseUrl: string,
  query: string,
  page: number,
  totalPages: number,
): string {
  const link = (rel: string, target: number) =>
    `\n  <link rel="${rel}" href="${escapeXml(searchFeedUrl(baseUrl, query, target))}" type="${ACQUISITION_TYPE}"/>`;
  return (
    (page > 1 ? link('previous', page - 1) : '') +
    (page < totalPages ? link('next', page + 1) : '')
  );
}
