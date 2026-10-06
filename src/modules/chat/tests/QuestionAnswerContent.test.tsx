import assert from 'node:assert/strict';

import { test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { QuestionAnswerContent } from '@/modules/chat/tools/ContentRenderers/QuestionAnswerContent';

// Regression coverage for the chat-interface crash where an AskUserQuestion
// payload loaded from a session transcript arrives with a non-array `questions`
// or a question missing its `options` array. Rendering must degrade gracefully
// instead of throwing "TypeError: e.map is not a function".

test('renders without throwing when questions is a non-array value', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        // Malformed: object instead of an array
        questions: { 0: { question: 'q?', options: [{ label: 'a' }] } } as never,
        answers: {},
      }),
    );
  });
});

test('renders without throwing when a question is missing options[]', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', header: 'H' } as never],
        answers: { 'Pick one?': 'X' },
      }),
    );
  });
});

test('renders without throwing when options[] contains malformed entries', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', options: [null, 'oops', { label: 'A' }] } as never],
        answers: { 'Pick one?': 'A, Custom' },
      }),
    );
  });
});

test('renders without throwing when a questions entry is null/non-object', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [null, 'oops', { question: 'Ok?', options: [{ label: 'A' }] }] as never,
        answers: {},
      }),
    );
  });
});

test('renders without throwing when an answer is a non-string value', () => {
  assert.doesNotThrow(() => {
    renderToStaticMarkup(
      React.createElement(QuestionAnswerContent, {
        questions: [{ question: 'Pick one?', options: [{ label: 'A' }] }],
        // Malformed: answer is an object instead of the expected string
        answers: { 'Pick one?': { unexpected: true } } as never,
      }),
    );
  });
});

test('still renders a well-formed question + answer', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [{ question: 'Pick one?', header: 'H', options: [{ label: 'A' }, { label: 'B' }] }],
      answers: { 'Pick one?': 'A' },
    }),
  );
  assert.ok(html.includes('Pick one?'));
});

test('an option label containing ", " is kept as one answer', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [{ question: 'Pick one?', options: [{ label: 'Yes, always' }, { label: 'No' }] }],
      answers: { 'Pick one?': 'Yes, always' },
    }),
  );
  // Split on ", " would render "Yes" and "always" as two chips, both unmatched
  // by an option and therefore both labelled custom.
  assert.ok(html.includes('Yes, always'));
  assert.ok(!html.includes('(custom)'));
});

// Fase 9, paso 4: while a question has no answer yet, the interactive
// AskUserQuestionPanel above the composer already shows its text — this
// transcript card repeating it is the "se ve dos veces" bug the plan calls
// out. Until an answer exists it must collapse to one line instead.

test('a pending question (no answers yet) does not repeat the question text', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [{ question: 'Is "blue" your favorite color?', header: 'H', options: [{ label: 'Yes' }, { label: 'No' }] }],
      answers: {},
    }),
  );
  assert.ok(!html.includes('Is &quot;blue&quot; your favorite color?') && !html.includes('Is "blue" your favorite color?'));
  assert.ok(html.toLowerCase().includes('open question'));
});

test('a pending multi-question set collapses to one line, not one per question', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [
        { question: 'A or B?', options: [{ label: 'A' }, { label: 'B' }] },
        { question: 'X, Y or Z?', options: [{ label: 'X' }, { label: 'Y' }, { label: 'Z' }] },
      ],
      answers: {},
    }),
  );
  assert.ok(!html.includes('A or B?'));
  assert.ok(!html.includes('X, Y or Z?'));
  assert.ok(html.includes('2 open questions'));
});

test('once answered, the question text is shown exactly once (the full summary)', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [{ question: 'A or B?', options: [{ label: 'A' }, { label: 'B' }] }],
      answers: { 'A or B?': 'A' },
    }),
  );
  const occurrences = html.split('A or B?').length - 1;
  assert.equal(occurrences, 1);
  assert.ok(!html.toLowerCase().includes('open question'));
});

test('a multi-select answer with no exact option still splits on ", "', () => {
  const html = renderToStaticMarkup(
    React.createElement(QuestionAnswerContent, {
      questions: [{ question: 'Pick some?', multiSelect: true, options: [{ label: 'A' }, { label: 'B' }] }],
      answers: { 'Pick some?': 'A, B' },
    }),
  );
  // Both halves must match an option, so neither is labelled custom and the
  // joined string never survives as a single chip.
  assert.ok(html.includes('>A</span>'));
  assert.ok(html.includes('>B</span>'));
  assert.ok(!html.includes('A, B'));
  assert.ok(!html.includes('(custom)'));
});
