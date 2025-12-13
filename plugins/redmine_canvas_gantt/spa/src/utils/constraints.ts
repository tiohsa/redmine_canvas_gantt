import type { Relation, Task } from '../types';

const COMPLETED_STATUS_IDS = new Set([3, 5]);
const LOCKED_STATUS_IDS = new Set([5]);

const calculateWeightedProgress = (children: Task[]): number | null => {
    if (children.length === 0) return null;

    const weights = children.map((child) => Math.max(1, child.dueDate - child.startDate));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    if (totalWeight === 0) return null;

    const weighted = children.reduce((sum, child, index) => sum + child.ratioDone * weights[index], 0);
    return weighted / totalWeight;
};

/**
 * 親子関係の暗黙ルールをクライアント側で補完する。
 * - 親は子の最小開始日/最大終了日に合わせて期間を広げる
 * - 親の進捗率は子チケットの期間加重平均を採用（工数未利用のため代替）
 * - hasChildren フラグを再計算
 */
export const applyHierarchyRules = (tasks: Task[]): Task[] => {
    const next = tasks.map((task) => ({ ...task, hasChildren: false }));
    const byId = new Map(next.map((t) => [t.id, t]));
    const childrenMap = new Map<string, Task[]>();

    next.forEach((task) => {
        if (!task.parentId) return;
        const siblings = childrenMap.get(task.parentId) ?? [];
        siblings.push(task);
        childrenMap.set(task.parentId, siblings);
    });

    const visited = new Set<string>();
    const visit = (taskId: string) => {
        if (visited.has(taskId)) return;
        visited.add(taskId);

        const task = byId.get(taskId);
        const children = childrenMap.get(taskId);

        if (!task || !children || children.length === 0) return;

        // まず子を更新してから親を集約
        children.forEach((child) => visit(child.id));

        const minStart = Math.min(...children.map((c) => c.startDate));
        const maxDue = Math.max(...children.map((c) => c.dueDate));
        const weightedProgress = calculateWeightedProgress(children);

        task.hasChildren = true;
        task.startDate = Math.min(task.startDate, minStart);
        task.dueDate = Math.max(task.dueDate, maxDue);
        if (weightedProgress !== null && Number.isFinite(weightedProgress)) {
            task.ratioDone = Math.round(weightedProgress);
        }
    };

    next.forEach((task) => visit(task.id));
    return next;
};

/**
 * 依存関係（precedes/follows/blocks）の論理制約を考慮して期間を補正する。
 * 「先行タスクの終了日以降に後続を開始する」動きをスナップとして実装。
 */
export const enforceDependencyConstraints = (
    taskId: string,
    proposedStart: number,
    proposedDue: number,
    tasks: Task[],
    relations: Relation[]
): { startDate: number; dueDate: number; warning: string | null } => {
    let startDate = proposedStart;
    let dueDate = Math.max(proposedStart, proposedDue);
    let warning: string | null = null;

    const predecessors = relations
        .filter((rel) => {
            if (rel.type === 'precedes' || rel.type === 'blocks') {
                return rel.to === taskId;
            }
            if (rel.type === 'follows') {
                return rel.from === taskId;
            }
            if (rel.type === 'blocked') {
                return rel.from === taskId;
            }
            return false;
        })
        .map((rel) => {
            if (rel.type === 'follows' || rel.type === 'blocked') return rel.to;
            return rel.from;
        });

    const predecessorTasks = predecessors
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => Boolean(t));

    if (predecessorTasks.length > 0) {
        const latestEnd = Math.max(...predecessorTasks.map((t) => t.dueDate));
        if (startDate < latestEnd) {
            startDate = latestEnd;
            dueDate = Math.max(dueDate, latestEnd);
            warning = '依存関係により開始日を先行タスク終了日にスナップしました。';
        }
    }

    if (dueDate < startDate) {
        dueDate = startDate;
    }

    return { startDate, dueDate, warning };
};

/**
 * 状態に応じた操作可否・進捗率を補正する。
 */
export const normalizeStatusRules = (task: Task): Task => {
    const forceCompleted = COMPLETED_STATUS_IDS.has(task.statusId);
    const locked = LOCKED_STATUS_IDS.has(task.statusId);

    return {
        ...task,
        ratioDone: forceCompleted ? 100 : task.ratioDone,
        editable: task.editable && !locked
    };
};

/**
 * APIからのデータに開始日/期限日の欠損や逆転があった場合の警告文を返す。
 */
export const buildDateWarnings = (tasks: Task[]): string[] => {
    const warnings: string[] = [];

    tasks.forEach((task) => {
        if (!Number.isFinite(task.startDate) || !Number.isFinite(task.dueDate)) {
            warnings.push(`チケット#${task.id} の日付が不正なため補完しました。`);
            return;
        }

        if (task.startDate > task.dueDate) {
            warnings.push(`チケット#${task.id} の開始日が期限日を超えていたため補正しました。`);
        }
    });

    return warnings;
};
