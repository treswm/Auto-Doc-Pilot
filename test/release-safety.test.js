import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRevisionPreservesStructure, sectionRange } from '../api/release-notes.js';

const article = [
  '<h2>Adding Users</h2><p>Existing instructions.</p>',
  '<h2>Managing Users</h2><p>Existing instructions.</p>',
  '<h2>Deactivate a User</h2><p>Original deactivation workflow.</p>',
].join('');

test('locates only the exact target heading, not text across earlier headings', () => {
  const range = sectionRange(article, 'Deactivate a User');
  assert.equal(article.slice(range.start, range.end), '<h2>Deactivate a User</h2><p>Original deactivation workflow.</p>');
});

test('rejects a revision that removes unrelated article headings', () => {
  const destructiveRevision = '<h2>Deactivate a User</h2><p>New workflow.</p>';
  assert.throws(
    () => assertRevisionPreservesStructure(article, destructiveRevision),
    /would remove the existing "adding users" heading/i,
  );
});
