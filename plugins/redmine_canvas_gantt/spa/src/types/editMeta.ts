export interface InlineEditSettings {
    inline_edit_subject?: string;
    inline_edit_assigned_to?: string;
    inline_edit_status?: string;
    inline_edit_done_ratio?: string;
    inline_edit_due_date?: string;
    inline_edit_start_date?: string;
    inline_edit_custom_fields?: string;
}

export interface EditOption {
    id: number;
    name: string;
}

export type CustomFieldFormat = 'string' | 'int' | 'float' | 'list' | 'bool' | 'date' | 'text';

export interface CustomFieldMeta {
    id: number;
    name: string;
    fieldFormat: CustomFieldFormat;
    isRequired: boolean;
    regexp?: string | null;
    minLength?: number | null;
    maxLength?: number | null;
    possibleValues?: string[] | null;
}

export interface TaskEditMeta {
    task: {
        id: string;
        subject: string;
        assignedToId: number | null;
        statusId: number;
        doneRatio: number;
        dueDate: string | null;
        lockVersion: number;
    };
    editable: {
        subject: boolean;
        assignedToId: boolean;
        statusId: boolean;
        doneRatio: boolean;
        dueDate: boolean;
        customFieldValues: boolean;
    };
    options: {
        statuses: EditOption[];
        assignees: EditOption[];
        customFields: CustomFieldMeta[];
    };
    customFieldValues: Record<string, string | null>;
}

