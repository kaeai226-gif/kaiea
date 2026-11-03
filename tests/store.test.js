'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeNote, applyPatch, readStore, writeStore } = require('../src/store');

test('normalizeNote replaces invalid fields and retains valid notes', () => {
  const note = normalizeNote({ title: '你好', content: '记得喝水', color: 'mint', bounds: { width: 90, height: 100 }, pinned: false }, 'fallback');
  assert.equal(note.id, 'fallback');
  assert.equal(note.color, 'mint');
  assert.equal(note.pinned, false);
  assert.equal(note.bounds.width, 270);
  assert.equal(note.bounds.height, 290);
});

test('applyPatch only accepts allowed fields and updates content', () => {
  const note = normalizeNote({}, 'one');
  const changed = applyPatch(note, { title: '备忘', color: 'lilac', pinned: false, id: 'two', ignored: 'x' });
  assert.equal(changed, true);
  assert.equal(note.title, '备忘');
  assert.equal(note.color, 'lilac');
  assert.equal(note.pinned, true);
  assert.equal(note.id, 'one');
  assert.equal(applyPatch(note, { title: '备忘' }), false);
});

test('read/write round trip and corrupt-data backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tietie-'));
  const filename = path.join(dir, 'notes.json');
  try {
    const state = { version: 1, notes: [normalizeNote({ title: 'hello' }, 'id-1')] };
    writeStore(filename, state);
    const loaded = readStore(filename, () => 'new-id');
    assert.equal(loaded.notes[0].title, 'hello');
    fs.writeFileSync(filename, '{broken', 'utf8');
    assert.equal(readStore(filename, () => 'new-id').notes.length, 0);
    assert(fs.readdirSync(dir).some((file) => file.includes('.corrupt-')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
