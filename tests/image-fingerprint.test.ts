import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { visualDifference, visualHash, visuallyEqual } from '../src/image-fingerprint.js';

const original = Buffer.from(`
  <svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="1280" height="800" fill="#f7f9fc"/>
    <path d="M60 80 L180 200 L60 320 L130 320 L250 200 L130 80 Z" fill="#17263b"/>
    <rect x="310" y="100" width="520" height="70" rx="20" fill="#101820"/>
    <rect x="310" y="220" width="820" height="28" rx="14" fill="#d7e1ea"/>
    <rect x="310" y="280" width="680" height="28" rx="14" fill="#d7e1ea"/>
    <rect x="760" y="390" width="390" height="280" rx="24" fill="#ffffff" stroke="#c7d1db"/>
    <rect x="790" y="440" width="320" height="54" rx="12" fill="#dceeff"/>
  </svg>`);

const changed = Buffer.from(`
  <svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="1280" height="800" fill="#f7f9fc"/>
    <path d="M55 75 C180 80 185 205 300 190 C210 235 180 330 70 320 L150 205 Z" fill="#17263b"/>
    <rect x="310" y="100" width="520" height="70" rx="20" fill="#101820"/>
    <rect x="310" y="220" width="820" height="28" rx="14" fill="#d7e1ea"/>
    <rect x="310" y="280" width="680" height="28" rx="14" fill="#d7e1ea"/>
    <rect x="760" y="390" width="390" height="280" rx="24" fill="#ffffff" stroke="#c7d1db"/>
    <rect x="790" y="440" width="320" height="54" rx="12" fill="#087aff"/>
  </svg>`);

test('matches the same image after thumbnail resizing and encoding', async () => {
  const source = await sharp(original).png().toBuffer();
  const thumbnail = await sharp(source).resize(320, 200, { fit: 'fill' }).png({ quality: 80 }).toBuffer();
  const [sourceFingerprint, thumbnailFingerprint] = await Promise.all([visualHash(source), visualHash(thumbnail)]);
  assert.equal(visuallyEqual(sourceFingerprint, thumbnailFingerprint), true);
  assert.ok(visualDifference(sourceFingerprint, thumbnailFingerprint) <= 0.012);
});

test('rejects similar layouts with materially different artwork', async () => {
  const [before, after] = await Promise.all([
    sharp(original).png().toBuffer().then(visualHash),
    sharp(changed).png().toBuffer().then(visualHash),
  ]);
  assert.equal(visuallyEqual(before, after), false);
  assert.ok(visualDifference(before, after) > 0.012);
});
