export type ConfirmedProjectScope = {
    rootProjectId: string;
    mode: 'current_tree' | 'member_all';
    selectionExplicit: boolean;
    selectedProjectIds: string[];
    effectiveProjectIds: string[];
    schedulingAllowed?: boolean;
};

let confirmedProjectScope: ConfirmedProjectScope | null = null;

export const getConfirmedProjectScope = (): ConfirmedProjectScope | null => confirmedProjectScope;

export const setConfirmedProjectScope = (scope: ConfirmedProjectScope | null): void => {
    confirmedProjectScope = scope;
};
