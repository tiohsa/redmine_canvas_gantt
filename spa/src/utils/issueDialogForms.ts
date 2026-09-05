export type IssueDialogFormTarget = 'journal' | 'time_entry' | 'issue' | 'query' | null;

const isQueryForm = (form: HTMLFormElement): boolean => (
    form.id === 'query_form' || form.id === 'query-form'
);

const isJournalForm = (form: HTMLFormElement): boolean => (
    form.getAttribute('action')?.includes('/journals/') === true ||
    /^journal-.*-form$/.test(form.id) ||
    form.querySelector('textarea[name="journal[notes]"]') !== null
);

const hasTimeEntryField = (form: HTMLFormElement): boolean => (
    Array.from(form.querySelectorAll('input, select, textarea')).some((field) => (
        field.getAttribute('name')?.startsWith('time_entry[') === true
    ))
);

const isTimeEntryEditorForm = (form: HTMLFormElement): boolean => {
    if (isQueryForm(form)) return false;

    return form.id === 'new_time_entry' ||
        form.classList.contains('new_time_entry') ||
        form.id.startsWith('edit_time_entry') ||
        hasTimeEntryField(form);
};

export const classifyIssueDialogForm = (form: HTMLFormElement): IssueDialogFormTarget => {
    if (isQueryForm(form)) return 'query';
    if (isJournalForm(form)) return 'journal';
    if (form.id === 'issue-form') return 'issue';
    if (isTimeEntryEditorForm(form)) return 'time_entry';
    return null;
};
