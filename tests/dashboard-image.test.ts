import test from 'node:test';
import assert from 'node:assert/strict';
import { originalImageSource } from '../src/dashboard-image.js';

const path = '/fictional-image-key';

test('requests the stored original instead of the preview rendition', () => {
  assert.equal(originalImageSource(`https://lh3.googleusercontent.com${path}=w320-h200-rw`), `https://lh3.googleusercontent.com${path}=s0`);
  assert.equal(originalImageSource(`https://lh5.googleusercontent.com${path}=s256-rw`), `https://lh5.googleusercontent.com${path}=s0`);
  assert.equal(originalImageSource(`https://lh3.googleusercontent.com${path}`), `https://lh3.googleusercontent.com${path}=s0`);
});

test('keeps local upload previews as they are', () => {
  assert.equal(originalImageSource('blob:https://chromewebstore.google.com/0000-1111'), 'blob:https://chromewebstore.google.com/0000-1111');
  assert.equal(originalImageSource('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
});

test('rejects sources that are not store images', () => {
  assert.equal(originalImageSource('http://lh3.googleusercontent.com/fictional=s0'), null);
  assert.equal(originalImageSource('https://example.com/fictional=w320-h200-rw'), null);
  assert.equal(originalImageSource('https://lh3.googleusercontent.com.example.com/fictional=s0'), null);
  assert.equal(originalImageSource(`https://lh3.googleusercontent.com${path}=s0?redirect=1`), null);
  assert.equal(originalImageSource('data:text/html,<p>x</p>'), null);
  assert.equal(originalImageSource('not a url'), null);
});
