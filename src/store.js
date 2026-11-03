'use strict';

const fs = require('node:fs');
const path = require('node:path');

const THEMES = Object.freeze(['butter', 'mint', 'lilac', 'peach', 'sky']);
const SIZE = Object.freeze({ width: 326, height: 410, minWidth: 270, minHeight: 290 });

function normalizeNote(raw, fallbackId) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const bounds = data.bounds && typeof data.bounds === 'object' ? data.bounds : {};
  const coordinate = (value) => Number.isFinite(value) ? Math.round(value) : null;
  return {
    id: typeof data.id === 'string' && data.id ? data.id : fallbackId,
    title: typeof data.title === 'string' ? data.title.slice(0, 120) : '',
    content: typeof data.content === 'string' ? data.content.slice(0, 30000) : '',
    color: THEMES.includes(data.color) ? data.color : 'butter',
    pinned: data.pinned !== false,
    hidden: data.hidden === true,
    bounds: {
      x: coordinate(bounds.x),
      y: coordinate(bounds.y),
      width: Number.isFinite(bounds.width) ? Math.max(SIZE.minWidth, Math.round(bounds.width)) : SIZE.width,
      height: Number.isFinite(bounds.height) ? Math.max(SIZE.minHeight, Math.round(bounds.height)) : SIZE.height
    },
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
  };
}

function applyPatch(note, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  let changed = false;
  for (const key of ['title', 'content']) {
    if (typeof patch[key] === 'string') {
      const trimmed = patch[key].slice(0, key === 'title' ? 120 : 30000);
      if (trimmed !== note[key]) { note[key] = trimmed; changed = true; }
    }
  }
  if (THEMES.includes(patch.color) && patch.color !== note.color) {
    note.color = patch.color;
    changed = true;
  }
  if (changed) note.updatedAt = new Date().toISOString();
  return changed;
}

function readStore(filePath, newId) {
  if (!fs.existsSync(filePath)) return { version: 1, notes: [] };
  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!json || !Array.isArray(json.notes)) throw new Error('Invalid notes format');
    const ids = new Set();
    const notes = json.notes.filter((x) => x && typeof x === 'object').map((item) => {
      const note = normalizeNote(item, newId());
      if (ids.has(note.id)) note.id = newId();
      ids.add(note.id);
      return note;
    });
    return { version: 1, notes };
  } catch (error) {
    // A broken file is backed up rather than silently overwritten.
    const backup = `${filePath}.corrupt-${Date.now()}`;
    fs.copyFileSync(filePath, backup);
    console.error('便签文件读取失败，原文件备份至：', backup, error);
    return { version: 1, notes: [] };
  }
}

function writeStore(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ version: 1, notes: state.notes }, null, 2), 'utf8');
  try {
    fs.renameSync(temp, filePath);
  } catch (error) {
    // Windows may reject renaming over an existing destination.
    if (process.platform === 'win32' && fs.existsSync(filePath)) {
      fs.copyFileSync(temp, filePath);
      fs.unlinkSync(temp);
    } else {
      throw error;
    }
  }
}

module.exports = { THEMES, SIZE, normalizeNote, applyPatch, readStore, writeStore };
