import { describe, expect, it } from 'vitest';
import { classifyIssueDialogForm } from './issueDialogForms';

const formFrom = (html: string): HTMLFormElement => {
    const doc = document.implementation.createHTMLDocument('form');
    doc.body.innerHTML = html;
    return doc.body.querySelector('form') as HTMLFormElement;
};

describe('classifyIssueDialogForm', () => {
    it.each([
        ['<form id="new_time_entry"></form>', 'time_entry'],
        ['<form class="new_time_entry"></form>', 'time_entry'],
        ['<form id="edit_time_entry_42"></form>', 'time_entry'],
        ['<form><input name="time_entry[hours]" /></form>', 'time_entry'],
        ['<form><select name="time_entry[activity_id]"></select></form>', 'time_entry'],
        ['<form><textarea name="time_entry[comments]"></textarea></form>', 'time_entry'],
        ['<form id="issue-form"></form>', 'issue'],
        ['<form id="issue-form"><input name="time_entry[hours]" /></form>', 'issue'],
        ['<form id="journal-7-form"></form>', 'journal'],
        ['<form action="/journals/7"><textarea name="journal[notes]"></textarea></form>', 'journal'],
        ['<form id="query_form" action="/projects/demo/time_entries"></form>', 'query'],
        ['<form id="query_form" action="/projects/demo/time_entries"><input name="time_entry[hours]" /></form>', 'query'],
        ['<form id="query-form" action="/projects/demo/time_entries"></form>', 'query'],
        ['<form id="search_form" action="/projects/demo/time_entries"><input name="format" value="csv" /></form>', null],
        ['<form action="/projects/demo/time_entries"></form>', null]
    ] as const)('classifies %s as %s', (html, expected) => {
        expect(classifyIssueDialogForm(formFrom(html))).toBe(expected);
    });
});
