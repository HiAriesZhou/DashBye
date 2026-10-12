import test from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTED_DATA_CATEGORIES, closestCollectedDataCategory, isCollectedDataCategory } from '../src/privacy-categories.js';

test('lists every Chrome Web Store collected-data category', () => {
  assert.deepEqual(COLLECTED_DATA_CATEGORIES, [
    'personallyIdentifiableInformation',
    'healthInformation',
    'financialAndPaymentInformation',
    'authenticationInformation',
    'personalCommunications',
    'location',
    'webHistory',
    'userActivity',
    'websiteContent',
  ]);
});

test('recognizes only exact category identifiers', () => {
  assert.equal(isCollectedDataCategory('authenticationInformation'), true);
  assert.equal(isCollectedDataCategory('authenticationInfo'), false);
  assert.equal(isCollectedDataCategory('WebHistory'), false);
});

test('suggests the closest valid category', () => {
  assert.equal(closestCollectedDataCategory('authenticationInfo'), 'authenticationInformation');
  assert.equal(closestCollectedDataCategory('webhistory'), 'webHistory');
  assert.equal(closestCollectedDataCategory('websiteContents'), 'websiteContent');
  assert.equal(closestCollectedDataCategory('locaton'), 'location');
});
