import { orderProblem, placeItems } from '../reading-list-order';

describe('placeItems', () => {
  it('adds at the end by default, in the order given', () => {
    expect(placeItems(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('inserts before a position', () => {
    expect(placeItems(['a', 'b', 'c'], ['x', 'y'], 1)).toEqual([
      'a',
      'x',
      'y',
      'b',
      'c',
    ]);
    expect(placeItems(['a', 'b'], ['x'], 0)).toEqual(['x', 'a', 'b']);
  });

  it('treats a position past the end as the end', () => {
    expect(placeItems(['a'], ['x'], 9)).toEqual(['a', 'x']);
  });

  it('leaves items already in the list where they are', () => {
    expect(placeItems(['a', 'b', 'c'], ['c', 'x'], 0)).toEqual([
      'x',
      'a',
      'b',
      'c',
    ]);
  });

  it('adds a repeated item once', () => {
    expect(placeItems([], ['x', 'y', 'x'])).toEqual(['x', 'y']);
  });
});

describe('orderProblem', () => {
  it('accepts every item once in any order', () => {
    expect(orderProblem(['a', 'b', 'c'], ['c', 'a', 'b'])).toBeNull();
  });

  it('names missing and extra items', () => {
    expect(orderProblem(['a', 'b'], ['a', 'x'])).toBe(
      'Give every item in the reading list, once, in the new order. Missing: b. Not in it: x.',
    );
  });

  it('refuses an item given twice', () => {
    expect(orderProblem(['a', 'b'], ['a', 'b', 'a'])).toContain(
      'Some items are given twice.',
    );
  });
});
