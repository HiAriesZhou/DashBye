import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { detailHash, visualDifference, visualHash, visuallyEqual } from '../src/image-fingerprint.js';

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

// A settings page before and after a redesign: same palette and overall layout, but
// nested cards and inline links become one flat list with aligned controls.
function settingsPage(redesigned: boolean): Buffer {
  const rows = redesigned
    ? [0, 1, 2, 3].map((index) => `
        <rect x="420" y="${180 + index * 64}" width="760" height="64" fill="#ffffff" stroke="#e4e7ec"/>
        <rect x="440" y="${204 + index * 64}" width="120" height="14" rx="4" fill="#344054"/>
        <rect x="900" y="${196 + index * 64}" width="260" height="30" rx="8" fill="#ffffff" stroke="#d0d5dd"/>`).join('')
    : `<rect x="420" y="160" width="760" height="300" rx="16" fill="#ffffff" stroke="#e4e7ec"/>
       <rect x="450" y="190" width="700" height="150" rx="12" fill="#f9fafb" stroke="#e4e7ec"/>
       <rect x="470" y="215" width="80" height="12" rx="4" fill="#667085"/>
       <rect x="470" y="240" width="380" height="34" rx="8" fill="#eef0f3"/>
       <rect x="880" y="215" width="60" height="12" rx="4" fill="#667085"/>
       <rect x="880" y="245" width="140" height="14" rx="4" fill="#344054"/>
       <rect x="450" y="370" width="150" height="14" rx="4" fill="#344054"/>
       <rect x="1080" y="370" width="70" height="14" rx="4" fill="#344054"/>`;
  return Buffer.from(`
    <svg width="1280" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="1280" height="800" fill="#f7f7f5"/>
      <rect x="0" y="0" width="300" height="800" fill="#f2f1ee"/>
      <rect x="420" y="90" width="160" height="30" rx="6" fill="#101828"/>
      ${rows}
    </svg>`);
}

test('screenshot fingerprints ignore thumbnail re-encoding', async () => {
  const source = await sharp(settingsPage(true)).png().toBuffer();
  const thumbnail = await sharp(source).resize(320, 200, { fit: 'fill' }).jpeg({ quality: 80 }).toBuffer();
  const [sourceFingerprint, thumbnailFingerprint] = await Promise.all([detailHash(source), detailHash(thumbnail)]);
  assert.equal(visuallyEqual(sourceFingerprint, thumbnailFingerprint), true);
});

test('screenshot fingerprints detect a redesign that the coarse fingerprint misses', async () => {
  const [before, after] = await Promise.all([
    sharp(settingsPage(false)).png().toBuffer(),
    sharp(settingsPage(true)).png().toBuffer(),
  ]);
  assert.equal(visuallyEqual(await visualHash(before), await visualHash(after)), true);
  assert.equal(visuallyEqual(await detailHash(before), await detailHash(after)), false);
});

test('fingerprints of different versions never compare as equal', async () => {
  const image = await sharp(settingsPage(true)).png().toBuffer();
  assert.equal(visuallyEqual(await visualHash(image), await detailHash(image)), false);
});
