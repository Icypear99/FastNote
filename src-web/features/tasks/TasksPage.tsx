import {useEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, MouseEvent, RefObject} from 'react';
import {createPortal} from 'react-dom';
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {CollisionDetection, DragEndEvent} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS as DndCss} from '@dnd-kit/utilities';
import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Filter,
  FolderPlus,
  Gauge,
  LayoutGrid,
  Link2,
  List,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  format,
  getISOWeek,
  getISOWeekYear,
  isSameDay,
  isSameWeek,
  startOfWeek,
} from 'date-fns';
import type {Project, Task, TaskPlacement, TaskPriority, TaskStatus} from '../../shared/types';
import {commands} from '../../core/services/commands';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Item} from '@astryxdesign/core/Item';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {VStack} from '@astryxdesign/core/VStack';
import {AppConfirmDialog, useAppFeedback} from '../../shared/components/feedback';

const statuses: TaskStatus[] = ['todo', 'in_progress', 'done'];
const statusText: Record<TaskStatus, string> = {todo: '待办', in_progress: '进行中', done: '已完成'};
const priorities: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];
const priorityText: Record<TaskPriority, string> = {
  P0: 'P0-紧急',
  P1: 'P1-高',
  P2: 'P2-中',
  P3: 'P3-低',
};

type ViewMode = 'board' | 'list' | 'week';
type TrashTab = 'projects' | 'tasks';
type TaskFilterField = 'title' | 'status' | 'priority' | 'dueDate' | 'progress' | 'description' | 'projectId';
type TaskFilterOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'before' | 'after' | 'gte' | 'lte';
type DrawerState =
  | {mode: 'create'; launchStatus: TaskStatus; launchProjectId: string; launchDueDate: string}
  | {mode: 'edit'; taskId: string};

const TASK_VIEW_MODE_STORAGE_KEY = 'fastnote:tasks:view-mode';
const weekStartsOn = 1 as const;
const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const priorityOrder: Record<TaskPriority, number> = {P0: 0, P1: 1, P2: 2, P3: 3};
const boardTaskDragId = (taskId: string) => `board-task:${taskId}`;
const boardColumnDragId = (status: TaskStatus) => `board-column:${status}`;
const weekTaskDragId = (taskId: string) => `week-task:${taskId}`;
const weekDayDragId = (dateKey: string) => `week-day:${dateKey}`;
const taskCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  const taskCollisions = pointerCollisions.filter(({id}) => String(id).includes('-task:'));
  if (taskCollisions.length > 0) return taskCollisions;
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

const readStoredViewMode = (): ViewMode => {
  const stored = localStorage.getItem(TASK_VIEW_MODE_STORAGE_KEY);
  return stored === 'board' || stored === 'list' || stored === 'week' ? stored : 'board';
};

const localDateKey = (date: Date) => format(date, 'yyyy-MM-dd');
const getWeekStart = (date: Date) => startOfWeek(date, {weekStartsOn});

const getIsoWeekValue = (date: Date) => {
  const week = String(getISOWeek(date)).padStart(2, '0');
  return `${getISOWeekYear(date)}-W${week}`;
};

const parseIsoWeekValue = (value: string) => {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  const firstIsoWeekStart = getWeekStart(new Date(year, 0, 4));
  const result = addWeeks(firstIsoWeekStart, week - 1);
  return getISOWeekYear(result) === year && getISOWeek(result) === week ? result : null;
};

const getMonthWeekLabel = (weekStart: Date) => {
  const weekOfMonth = Math.floor((weekStart.getDate() - 1) / 7) + 1;
  return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月第${weekOfMonth}周`;
};

const getWeekRangeLabel = (weekStart: Date, weekEnd: Date) => {
  if (weekStart.getFullYear() !== weekEnd.getFullYear()) {
    return `${format(weekStart, 'yyyy年M月d日')}-${format(weekEnd, 'yyyy年M月d日')}`;
  }
  if (weekStart.getMonth() !== weekEnd.getMonth()) {
    return `${format(weekStart, 'M月d日')}-${format(weekEnd, 'M月d日')}`;
  }
  return `${format(weekStart, 'M月d日')}-${format(weekEnd, 'd日')}`;
};

const sortWeekTasks = (left: Task, right: Task) => {
  const completionDifference = Number(left.status === 'done') - Number(right.status === 'done');
  if (completionDifference !== 0) return completionDifference;
  const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priorityDifference !== 0) return priorityDifference;
  return left.orderNum - right.orderNum;
};

const sortByOrderNum = (left: Task, right: Task) => {
  const orderDifference = left.orderNum - right.orderNum;
  return orderDifference !== 0 ? orderDifference : left.createdAt.localeCompare(right.createdAt);
};

const sortOverdueTasks = (left: Task, right: Task) => {
  const priorityDifference = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priorityDifference !== 0) return priorityDifference;
  const dateDifference = left.dueDate.localeCompare(right.dueDate);
  return dateDifference !== 0 ? dateDifference : left.orderNum - right.orderNum;
};

function sortByArchivedAt(left: {archivedAt?: string}, right: {archivedAt?: string}) {
  return Date.parse(right.archivedAt ?? '') - Date.parse(left.archivedAt ?? '');
}

interface TaskDraft {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  parentId: string;
  progress: number;
  description: string;
  projectId: string;
}

interface TaskDragData {
  surface: 'board' | 'week';
  taskId?: string;
  groupId: string;
}

interface TaskFilterCondition {
  id: string;
  field: TaskFilterField;
  operator: TaskFilterOperator;
  value: string;
}

interface TaskFilterOption<T extends string> {
  value: T;
  label: string;
}

const taskFilterFields: TaskFilterOption<TaskFilterField>[] = [
  {value: 'title', label: '任务名称'},
  {value: 'status', label: '状态'},
  {value: 'priority', label: '优先级'},
  {value: 'dueDate', label: '截止日期'},
  {value: 'progress', label: '进度'},
  {value: 'description', label: '备注'},
  {value: 'projectId', label: '所属项目'},
];

const textFilterOperators: TaskFilterOption<TaskFilterOperator>[] = [
  {value: 'contains', label: '包含'},
  {value: 'not_contains', label: '不包含'},
  {value: 'equals', label: '等于'},
  {value: 'not_equals', label: '不等于'},
];

const selectFilterOperators: TaskFilterOption<TaskFilterOperator>[] = [
  {value: 'equals', label: '等于'},
  {value: 'not_equals', label: '不等于'},
];

const dateFilterOperators: TaskFilterOption<TaskFilterOperator>[] = [
  {value: 'equals', label: '等于'},
  {value: 'before', label: '早于'},
  {value: 'after', label: '晚于'},
];

const numberFilterOperators: TaskFilterOption<TaskFilterOperator>[] = [
  {value: 'equals', label: '等于'},
  {value: 'gte', label: '大于等于'},
  {value: 'lte', label: '小于等于'},
];

const getTaskFilterOperators = (field: TaskFilterField) => {
  if (field === 'dueDate') return dateFilterOperators;
  if (field === 'progress') return numberFilterOperators;
  if (field === 'status' || field === 'priority' || field === 'projectId') return selectFilterOperators;
  return textFilterOperators;
};

const createTaskFilterCondition = (): TaskFilterCondition => ({
  id: crypto.randomUUID(),
  field: 'title',
  operator: 'contains',
  value: '',
});

const taskMatchesFilter = (task: Task, condition: TaskFilterCondition) => {
  const value = condition.value.trim();
  if (!value) return true;

  if (condition.field === 'progress') {
    const expected = Number(value);
    if (!Number.isFinite(expected)) return true;
    if (condition.operator === 'gte') return task.progress >= expected;
    if (condition.operator === 'lte') return task.progress <= expected;
    return task.progress === expected;
  }

  if (condition.field === 'dueDate') {
    if (!task.dueDate) return condition.operator === 'not_equals';
    if (condition.operator === 'before') return task.dueDate < value;
    if (condition.operator === 'after') return task.dueDate > value;
    if (condition.operator === 'not_equals') return task.dueDate !== value;
    return task.dueDate === value;
  }

  const actual = condition.field === 'projectId'
    ? task.projectId ?? 'none'
    : String(task[condition.field] ?? '');
  const normalizedActual = actual.toLocaleLowerCase('zh-CN');
  const normalizedValue = value.toLocaleLowerCase('zh-CN');
  if (condition.operator === 'contains') return normalizedActual.includes(normalizedValue);
  if (condition.operator === 'not_contains') return !normalizedActual.includes(normalizedValue);
  if (condition.operator === 'not_equals') return actual !== value;
  return actual === value;
};

const emptyDraft = (status: TaskStatus, projectId: string): TaskDraft => ({
  title: '',
  status,
  priority: 'P2',
  dueDate: '',
  parentId: '',
  progress: 0,
  description: '',
  projectId,
});

const taskDraft = (task: Task): TaskDraft => ({
  title: task.title,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  parentId: task.parentId ?? '',
  progress: task.progress,
  description: task.description,
  projectId: task.projectId ?? '',
});

const serializeDraft = (draft: TaskDraft) => JSON.stringify(draft);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function formatTimestamp(value: string | undefined) {
  if (!value) return '提交后自动生成';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function TasksPage({
  projects,
  tasks,
  run,
}: {
  projects: Project[];
  tasks: Task[];
  run: <T>(action: Promise<T>) => Promise<T>;
}) {
  const feedback = useAppFeedback();
  const activeProjects = useMemo(() => projects.filter((project) => !project.archivedAt), [projects]);
  const archivedProjects = useMemo(
    () => projects.filter((project) => project.archivedAt).sort(sortByArchivedAt),
    [projects],
  );
  const persistedActiveTasks = useMemo(() => tasks.filter((task) => !task.archivedAt), [tasks]);
  const archivedTasks = useMemo(
    () => tasks.filter((task) => task.archivedAt).sort(sortByArchivedAt),
    [tasks],
  );
  const [optimisticTasks, setOptimisticTasks] = useState<Task[] | null>(null);
  const activeTasks = optimisticTasks ?? persistedActiveTasks;
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [trashTab, setTrashTab] = useState<TrashTab>('projects');
  const [isProjectRailCollapsed, setIsProjectRailCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode);
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => getWeekStart(new Date()));
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft('todo', ''));
  const [draftBaseline, setDraftBaseline] = useState(() => serializeDraft(emptyDraft('todo', '')));
  const [drawerError, setDrawerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{type: 'project'; item: Project} | {type: 'task'; item: Task}>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoringKey, setRestoringKey] = useState('');
  const [actionBanner, setActionBanner] = useState<{status: 'warning' | 'error'; title: string; description: string}>();
  const [isProjectCreateOpen, setIsProjectCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#2563eb');
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null);
  const [projectMenuName, setProjectMenuName] = useState('');
  const [projectMenuColor, setProjectMenuColor] = useState('#2563eb');
  const [projectMenuError, setProjectMenuError] = useState('');
  const [projectMenuPosition, setProjectMenuPosition] = useState<{left: number; top: number} | null>(null);
  const [taskDragError, setTaskDragError] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [filterConditions, setFilterConditions] = useState<TaskFilterCondition[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isBoardListWeekScoped, setIsBoardListWeekScoped] = useState(false);
  const projectMenuRef = useRef<HTMLElement>(null);
  const projectMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, {activationConstraint: {distance: 6}}),
    useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
  );

  const weekDays = useMemo(
    () => eachDayOfInterval({start: selectedWeekStart, end: addDays(selectedWeekStart, 6)}),
    [selectedWeekStart],
  );
  const weekStartKey = localDateKey(selectedWeekStart);
  const weekEndKey = localDateKey(weekDays[6]);
  const isCurrentWeek = isSameWeek(selectedWeekStart, new Date(), {weekStartsOn});

  const weekScopedTasks = useMemo(() => activeTasks.filter((task) => {
    if (!task.dueDate) return task.status === 'todo';
    if (task.dueDate >= weekStartKey && task.dueDate <= weekEndKey) return true;
    return isCurrentWeek && task.dueDate < weekStartKey && task.status !== 'done';
  }), [activeTasks, isCurrentWeek, weekEndKey, weekStartKey]);

  const isWeekScopeActive = viewMode === 'week' || isBoardListWeekScoped;
  const timeScopedTasks = isWeekScopeActive ? weekScopedTasks : activeTasks;
  const activeFilterConditions = useMemo(
    () => filterConditions.filter((condition) => condition.value.trim()),
    [filterConditions],
  );
  const navigationTasks = useMemo(
    () => timeScopedTasks.filter((task) => activeFilterConditions.every((condition) => taskMatchesFilter(task, condition))),
    [activeFilterConditions, timeScopedTasks],
  );
  const filteredTasks = useMemo(() => {
    if (selectedProjectId === 'all') return navigationTasks;
    if (selectedProjectId === 'none') return navigationTasks.filter((task) => !task.projectId);
    return navigationTasks.filter((task) => task.projectId === selectedProjectId);
  }, [navigationTasks, selectedProjectId]);

  const datedWeekTasks = useMemo(
    () => filteredTasks.filter((task) => task.dueDate >= weekStartKey && task.dueDate <= weekEndKey).sort(sortByOrderNum),
    [filteredTasks, weekEndKey, weekStartKey],
  );
  const undatedTodoTasks = useMemo(
    () => filteredTasks.filter((task) => !task.dueDate && task.status === 'todo').sort(sortWeekTasks),
    [filteredTasks],
  );
  const overdueTasks = useMemo(
    () => filteredTasks.filter((task) => task.dueDate && task.dueDate < weekStartKey && task.status !== 'done').sort(sortOverdueTasks),
    [filteredTasks, weekStartKey],
  );

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const selectedProject = activeProjects.find((project) => project.id === selectedProjectId);
  const selectedProjectLabel = selectedProjectId === 'trash'
    ? '回收站'
    : selectedProject?.name ?? (selectedProjectId === 'none' ? '未分配' : '全部任务');
  const editingTask = drawer?.mode === 'edit' ? activeTasks.find((task) => task.id === drawer.taskId) : undefined;
  const isDraftDirty = Boolean(drawer) && serializeDraft(draft) !== draftBaseline;

  useEffect(() => {
    localStorage.setItem(TASK_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    setOptimisticTasks(null);
  }, [tasks]);

  useEffect(() => {
    if (!projectMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && !projectMenuRef.current?.contains(target)
        && !projectMenuTriggerRef.current?.contains(target)
      ) {
        setProjectMenuId(null);
      }
    };
    const closeOnViewportChange = () => setProjectMenuId(null);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', closeOnViewportChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', closeOnViewportChange);
    };
  }, [projectMenuId]);

  useEffect(() => {
    if (!isFilterOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && !filterPopoverRef.current?.contains(target)
        && !filterTriggerRef.current?.contains(target)
      ) {
        setIsFilterOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFilterOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFilterOpen]);

  useEffect(() => {
    if (!drawer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showDiscardConfirm) {
        setShowDiscardConfirm(false);
      } else if (isDraftDirty) {
        setShowDiscardConfirm(true);
      } else {
        setDrawer(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawer, isDraftDirty, showDiscardConfirm]);

  const projectContextId = selectedProject ? selectedProject.id : '';

  const openCreateDrawer = (status: TaskStatus = 'todo', dueDate = '') => {
    const nextDraft = {...emptyDraft(status, projectContextId), dueDate};
    setDrawer({mode: 'create', launchStatus: status, launchProjectId: projectContextId, launchDueDate: dueDate});
    setDraft(nextDraft);
    setDraftBaseline(serializeDraft(nextDraft));
    setDrawerError('');
    setShowDiscardConfirm(false);
    setIsProjectCreateOpen(false);
    setNewProjectName('');
  };

  const openEditDrawer = (task: Task) => {
    const nextDraft = taskDraft(task);
    setDrawer({mode: 'edit', taskId: task.id});
    setDraft(nextDraft);
    setDraftBaseline(serializeDraft(nextDraft));
    setDrawerError('');
    setShowDiscardConfirm(false);
    setIsProjectCreateOpen(false);
  };

  const closeDrawer = () => {
    setDrawer(null);
    setShowDiscardConfirm(false);
    setDrawerError('');
  };

  const requestDrawerClose = () => {
    if (isSubmitting) return;
    if (isDraftDirty) setShowDiscardConfirm(true);
    else closeDrawer();
  };

  const submitTask = async (continueAdding: boolean) => {
    if (!drawer || isSubmitting) return;
    const title = draft.title.trim();
    if (!title) {
      setDrawerError('请输入任务名称。');
      return;
    }

    setIsSubmitting(true);
    setDrawerError('');
    try {
      const payload = {
        title,
        description: draft.description.trim(),
        status: draft.status,
        priority: draft.priority,
        dueDate: draft.dueDate,
        parentId: draft.parentId,
        progress: Math.min(100, Math.max(0, draft.progress)),
        projectId: draft.projectId,
      };
      if (drawer.mode === 'edit') {
        await run(commands.updateTask({id: drawer.taskId, ...payload}));
        closeDrawer();
      } else {
        await run(commands.createTask({...payload, type: 'task', labels: []}));
        if (continueAdding) {
          const nextDraft = {
            ...emptyDraft(drawer.launchStatus, drawer.launchProjectId),
            dueDate: drawer.launchDueDate,
          };
          setDraft(nextDraft);
          setDraftBaseline(serializeDraft(nextDraft));
          setIsProjectCreateOpen(false);
          setNewProjectName('');
        } else {
          closeDrawer();
        }
      }
    } catch (error) {
      setDrawerError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestTaskDelete = (task: Task) => {
    if (isSubmitting || isDeleting) return;
    setActionBanner(undefined);
    setPendingDelete({type: 'task', item: task});
  };

  const createAndSelectProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setDrawerError('请输入项目名称。');
      return;
    }
    setIsSubmitting(true);
    setDrawerError('');
    try {
      const project = await run(commands.createProject({name, color: newProjectColor}));
      setDraft((current) => ({...current, projectId: project.id}));
      setIsProjectCreateOpen(false);
      setNewProjectName('');
    } catch (error) {
      setDrawerError(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openProjectMenu = (event: MouseEvent<HTMLButtonElement>, project: Project) => {
    event.stopPropagation();
    if (projectMenuId === project.id) {
      setProjectMenuId(null);
      setProjectMenuPosition(null);
      return;
    }
    const triggerRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 250;
    const menuHeight = 220;
    const viewportMargin = 12;
    setProjectMenuPosition({
      left: Math.min(triggerRect.right + 8, window.innerWidth - menuWidth - viewportMargin),
      top: Math.max(viewportMargin, Math.min(triggerRect.top, window.innerHeight - menuHeight - viewportMargin)),
    });
    setProjectMenuId(project.id);
    setProjectMenuName(project.name);
    setProjectMenuColor(project.color);
    setProjectMenuError('');
  };

  const saveProject = async (project: Project) => {
    const name = projectMenuName.trim();
    if (!name) {
      setProjectMenuError('请输入项目名称。');
      return;
    }
    try {
      await run(commands.updateProject({id: project.id, name, color: projectMenuColor}));
      setProjectMenuId(null);
    } catch (error) {
      setProjectMenuError(errorMessage(error));
    }
  };

  const requestProjectDelete = (project: Project) => {
    const taskCount = activeTasks.filter((task) => task.projectId === project.id).length;
    if (taskCount > 0) {
      setProjectMenuId(null);
      setActionBanner({
        status: 'warning',
        title: '无法删除项目',
        description: `该项目仍有关联任务（${taskCount}），请先转移或删除关联任务。`,
      });
      return;
    }
    setProjectMenuId(null);
    setActionBanner(undefined);
    setPendingDelete({type: 'project', item: project});
  };

  const deletePendingItem = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setActionBanner(undefined);
    try {
      if (pendingDelete.type === 'project') {
        await run(commands.archiveProject(pendingDelete.item.id));
        if (selectedProjectId === pendingDelete.item.id) setSelectedProjectId('all');
        feedback.success(`项目“${pendingDelete.item.name}”已移入回收站。`, 'project-delete-success');
      } else {
        await run(commands.archiveTask(pendingDelete.item.id));
        if (editingTask?.id === pendingDelete.item.id) closeDrawer();
        feedback.success(`任务“${pendingDelete.item.title}”已移入回收站。`, 'task-delete-success');
      }
      setPendingDelete(undefined);
    } catch (error) {
      const message = errorMessage(error);
      setActionBanner({status: 'error', title: '删除失败', description: message});
      feedback.error(message, 'delete-action-error');
    } finally {
      setIsDeleting(false);
    }
  };

  const restoreProject = async (project: Project) => {
    if (restoringKey) return;
    setRestoringKey(`project:${project.id}`);
    setActionBanner(undefined);
    try {
      await run(commands.restoreProject(project.id));
      feedback.success(`项目“${project.name}”已恢复。`, 'project-restore-success');
    } catch (error) {
      const message = errorMessage(error);
      setActionBanner({status: 'error', title: '恢复项目失败', description: message});
      feedback.error(message, 'project-restore-error');
    } finally {
      setRestoringKey('');
    }
  };

  const restoreTask = async (task: Task) => {
    if (restoringKey) return;
    setRestoringKey(`task:${task.id}`);
    setActionBanner(undefined);
    try {
      await run(commands.restoreTask(task.id));
      feedback.success(`任务“${task.title}”已恢复。`, 'task-restore-success');
    } catch (error) {
      const message = errorMessage(error);
      setActionBanner({status: 'error', title: '恢复任务失败', description: message});
      feedback.error(message, 'task-restore-error');
    } finally {
      setRestoringKey('');
    }
  };

  const updateDraft = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((current) => ({...current, [key]: value}));
    setDrawerError('');
  };

  const persistTaskPlacements = async (placements: TaskPlacement[]) => {
    const placementById = new Map(placements.map((placement) => [placement.id, placement]));
    const changedPlacements = [...placementById.values()].filter((placement) => {
      const task = activeTasks.find((item) => item.id === placement.id);
      return task && (
        task.status !== placement.status
        || task.dueDate !== placement.dueDate
        || task.orderNum !== placement.orderNum
      );
    });
    if (changedPlacements.length === 0) return;

    const changedById = new Map(changedPlacements.map((placement) => [placement.id, placement]));
    setTaskDragError('');
    setIsReordering(true);
    setOptimisticTasks(activeTasks.map((task) => {
      const placement = changedById.get(task.id);
      return placement ? {...task, ...placement} : task;
    }));
    try {
      await run(commands.reorderTasks(changedPlacements));
    } catch (error) {
      setOptimisticTasks(null);
      setTaskDragError(`无法保存任务位置：${errorMessage(error)}`);
    } finally {
      setIsReordering(false);
    }
  };

  const handleBoardDragEnd = (event: DragEndEvent) => {
    const activeData = event.active.data.current as TaskDragData | undefined;
    const overData = event.over?.data.current as TaskDragData | undefined;
    if (!event.over || activeData?.surface !== 'board' || overData?.surface !== 'board' || !activeData.taskId) return;

    const activeTask = activeTasks.find((task) => task.id === activeData.taskId);
    if (!activeTask) return;
    const sourceStatus = activeTask.status;
    const targetStatus = overData.groupId as TaskStatus;
    if (!statuses.includes(targetStatus)) return;
    const overTaskId = overData.taskId;
    const sourceTasks = activeTasks.filter((task) => task.status === sourceStatus).sort(sortByOrderNum);

    if (sourceStatus === targetStatus) {
      const activeIndex = sourceTasks.findIndex((task) => task.id === activeTask.id);
      const overIndex = overTaskId
        ? sourceTasks.findIndex((task) => task.id === overTaskId)
        : sourceTasks.length - 1;
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return;
      const reorderedTasks = arrayMove(sourceTasks, activeIndex, overIndex);
      void persistTaskPlacements(reorderedTasks.map((task, index) => ({
        id: task.id,
        status: sourceStatus,
        dueDate: task.dueDate,
        orderNum: index + 1,
      })));
      return;
    }

    const nextSourceTasks = sourceTasks.filter((task) => task.id !== activeTask.id);
    const nextTargetTasks = activeTasks.filter((task) => task.status === targetStatus).sort(sortByOrderNum);
    const targetIndex = overTaskId
      ? nextTargetTasks.findIndex((task) => task.id === overTaskId)
      : nextTargetTasks.length;
    nextTargetTasks.splice(targetIndex < 0 ? nextTargetTasks.length : targetIndex, 0, {...activeTask, status: targetStatus});
    void persistTaskPlacements([
      ...nextSourceTasks.map((task, index) => ({
        id: task.id,
        status: sourceStatus,
        dueDate: task.dueDate,
        orderNum: index + 1,
      })),
      ...nextTargetTasks.map((task, index) => ({
        id: task.id,
        status: targetStatus,
        dueDate: task.dueDate,
        orderNum: index + 1,
      })),
    ]);
  };

  const handleWeekDragEnd = (event: DragEndEvent) => {
    const activeData = event.active.data.current as TaskDragData | undefined;
    const overData = event.over?.data.current as TaskDragData | undefined;
    if (!event.over || activeData?.surface !== 'week' || overData?.surface !== 'week' || !activeData.taskId) return;

    const activeTask = activeTasks.find((task) => task.id === activeData.taskId);
    if (!activeTask) return;
    const sourceDate = activeTask.dueDate;
    const targetDate = overData.groupId;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return;
    const overTaskId = overData.taskId;
    const sourceTasks = activeTasks.filter((task) => task.dueDate === sourceDate).sort(sortByOrderNum);

    if (sourceDate === targetDate) {
      const activeIndex = sourceTasks.findIndex((task) => task.id === activeTask.id);
      const overIndex = overTaskId
        ? sourceTasks.findIndex((task) => task.id === overTaskId)
        : sourceTasks.length - 1;
      if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return;
      const reorderedTasks = arrayMove(sourceTasks, activeIndex, overIndex);
      void persistTaskPlacements(reorderedTasks.map((task, index) => ({
        id: task.id,
        status: task.status,
        dueDate: sourceDate,
        orderNum: index + 1,
      })));
      return;
    }

    const nextSourceTasks = sourceTasks.filter((task) => task.id !== activeTask.id);
    const nextTargetTasks = activeTasks.filter((task) => task.dueDate === targetDate).sort(sortByOrderNum);
    const targetIndex = overTaskId
      ? nextTargetTasks.findIndex((task) => task.id === overTaskId)
      : nextTargetTasks.length;
    nextTargetTasks.splice(targetIndex < 0 ? nextTargetTasks.length : targetIndex, 0, {...activeTask, dueDate: targetDate});
    void persistTaskPlacements([
      ...nextSourceTasks.map((task, index) => ({
        id: task.id,
        status: task.status,
        dueDate: sourceDate,
        orderNum: index + 1,
      })),
      ...nextTargetTasks.map((task, index) => ({
        id: task.id,
        status: task.status,
        dueDate: targetDate,
        orderNum: index + 1,
      })),
    ]);
  };

  const toggleFilterPopover = () => {
    if (!isFilterOpen && filterConditions.length === 0) {
      setFilterConditions([createTaskFilterCondition()]);
    }
    setIsFilterOpen((current) => !current);
  };

  const updateFilterCondition = (id: string, patch: Partial<TaskFilterCondition>) => {
    setFilterConditions((current) => current.map((condition) =>
      condition.id === id ? {...condition, ...patch} : condition,
    ));
  };

  const updateFilterField = (id: string, field: TaskFilterField) => {
    const operator = getTaskFilterOperators(field)[0].value;
    updateFilterCondition(id, {field, operator, value: ''});
  };

  const addFilterCondition = () => {
    setFilterConditions((current) => [...current, createTaskFilterCondition()]);
  };

  const removeFilterCondition = (id: string) => {
    setFilterConditions((current) => current.filter((condition) => condition.id !== id));
  };

  const moveBoardListWeek = (offset: number) => {
    setSelectedWeekStart((current) => addWeeks(current, offset));
    setIsBoardListWeekScoped(true);
  };

  const selectCurrentWeek = () => {
    setSelectedWeekStart(getWeekStart(new Date()));
    setIsBoardListWeekScoped(true);
  };

  const weekLabel = getMonthWeekLabel(selectedWeekStart);
  const weekRangeLabel = getWeekRangeLabel(selectedWeekStart, weekDays[6]);
  const trashCount = archivedProjects.length + archivedTasks.length;
  const isTrash = selectedProjectId === 'trash';
  const selectedItemCount = isTrash ? trashCount : filteredTasks.length;

  return (
    <div className={`task-workspace ${isProjectRailCollapsed ? 'project-rail-collapsed' : ''}`}>
      <aside className={`project-rail ${isProjectRailCollapsed ? 'collapsed' : ''}`}>
        {isProjectRailCollapsed ? (
          <button
            className="project-rail-capsule"
            type="button"
            title="展开项目导航"
            aria-label={`展开项目导航，当前${selectedProjectLabel}，${selectedItemCount}条记录`}
            style={{
              '--capsule-text-color': isTrash
                ? 'var(--danger)'
                : selectedProject?.color ?? (selectedProjectId === 'none' ? 'var(--text-secondary)' : 'var(--accent)'),
            } as CSSProperties}
            onClick={() => setIsProjectRailCollapsed(false)}
          >
            <PanelLeftOpen />
            <span>{selectedProjectLabel}</span>
            <small>{selectedItemCount}</small>
          </button>
        ) : (
          <>
        <div className="rail-heading project-rail-heading">
          <span className="project-rail-title">
            <span>项目</span>
            <strong>{activeProjects.length}</strong>
          </span>
          <button
            className="project-rail-toggle"
            type="button"
            title="收起项目导航"
            aria-label="收起项目导航"
            onClick={() => {
              setProjectMenuId(null);
              setProjectMenuPosition(null);
              setIsProjectRailCollapsed(true);
            }}
          >
            <PanelLeftClose />
          </button>
        </div>
        <button className={`project-filter ${selectedProjectId === 'all' ? 'active' : ''}`} type="button" onClick={() => setSelectedProjectId('all')}>
          <span className="project-color-dot neutral" />
          <span>全部任务</span>
          <small>{navigationTasks.length}</small>
        </button>
        <button className={`project-filter ${selectedProjectId === 'none' ? 'active' : ''}`} type="button" onClick={() => setSelectedProjectId('none')}>
          <span className="project-color-dot muted" />
          <span>未分配</span>
          <small>{navigationTasks.filter((task) => !task.projectId).length}</small>
        </button>
        <div className="project-filter-list">
          {activeProjects.map((project) => {
            const projectTaskCount = navigationTasks.filter((task) => task.projectId === project.id).length;
            const isMenuOpen = projectMenuId === project.id;
            return (
              <div className={`project-filter-row ${selectedProjectId === project.id ? 'active' : ''}`} key={project.id}>
                <button className="project-filter" type="button" onClick={() => setSelectedProjectId(project.id)}>
                  <span className="project-color-dot" style={{'--item-color': project.color} as CSSProperties} />
                  <span>{project.name}</span>
                  <small>{projectTaskCount}</small>
                </button>
                <button ref={isMenuOpen ? projectMenuTriggerRef : undefined} className="project-menu-trigger" type="button" title="管理项目" aria-label={`管理项目 ${project.name}`} onClick={(event) => openProjectMenu(event, project)}>
                  <MoreHorizontal />
                </button>
                {isMenuOpen && projectMenuPosition && createPortal(
                  <section ref={projectMenuRef} className="project-menu-popover" style={projectMenuPosition} aria-label={`编辑项目 ${project.name}`}>
                    <label>
                      <span>项目名称</span>
                      <input value={projectMenuName} onChange={(event) => setProjectMenuName(event.target.value)} />
                    </label>
                    <label>
                      <span>项目颜色</span>
                      <span className="project-color-control">
                        <input type="color" value={projectMenuColor} onChange={(event) => setProjectMenuColor(event.target.value)} />
                        <small>{projectMenuColor}</small>
                      </span>
                    </label>
                    {projectMenuError && <p className="task-form-error">{projectMenuError}</p>}
                    <div className="project-menu-actions">
                      <button className="project-archive-btn" type="button" onClick={() => requestProjectDelete(project)}>
                        <Trash2 />
                        删除项目
                      </button>
                      <button className="primary-btn" type="button" onClick={() => void saveProject(project)}>
                        <Save />
                        保存
                      </button>
                    </div>
                  </section>,
                  document.body,
                )}
              </div>
            );
          })}
        </div>
        <button
          className={`project-filter project-trash-filter ${isTrash ? 'active' : ''}`}
          type="button"
          onClick={() => {
            setProjectMenuId(null);
            setSelectedProjectId('trash');
          }}
        >
          <span className="project-trash-label">
            <Trash2 aria-hidden="true" />
            <span>回收站</span>
          </span>
          <small>{trashCount}</small>
        </button>
          </>
        )}
      </aside>

      <section className={`task-main ${viewMode === 'week' ? 'week-view' : ''} ${isTrash ? 'trash-view' : ''} ${actionBanner || taskDragError ? 'has-feedback' : ''}`}>
        <header className="task-module-header">
          <div>
            <span className="section-label">项目任务</span>
            <h2>{isTrash ? '回收站' : selectedProject?.name ?? (selectedProjectId === 'none' ? '未分配任务' : '全部任务')}</h2>
          </div>
          {!isTrash && <div className="task-header-actions">
            <div className="segmented" aria-label="任务视图">
              <button className={viewMode === 'board' ? 'active' : ''} type="button" onClick={() => setViewMode('board')}>
                <LayoutGrid />
                看板
              </button>
              <button className={viewMode === 'list' ? 'active' : ''} type="button" onClick={() => setViewMode('list')}>
                <List />
                列表
              </button>
              <button className={viewMode === 'week' ? 'active' : ''} type="button" onClick={() => setViewMode('week')}>
                <CalendarDays />
                周日历
              </button>
            </div>
            <button className="primary-btn task-add-record-btn" type="button" onClick={() => openCreateDrawer()}>
              <Plus />
              新增记录
            </button>
          </div>}
        </header>
        {(actionBanner || taskDragError) && (
          <VStack className="task-feedback-stack" gap={2} padding={3}>
            {actionBanner && (
              <Banner
                status={actionBanner.status}
                title={actionBanner.title}
                description={actionBanner.description}
                isDismissable
                onDismiss={() => setActionBanner(undefined)}
              />
            )}
            {taskDragError && (
              <Banner
                status="error"
                title="任务排序失败"
                description={taskDragError}
                isDismissable
                onDismiss={() => setTaskDragError('')}
              />
            )}
          </VStack>
        )}

        {!isTrash && <section className="task-filter-toolbar" aria-label="任务筛选工具栏">
          <div className="task-filter-toolbar-left">
            <button
              ref={filterTriggerRef}
              className={`task-filter-trigger ${activeFilterConditions.length > 0 ? 'active' : ''}`}
              type="button"
              aria-expanded={isFilterOpen}
              aria-haspopup="dialog"
              onClick={toggleFilterPopover}
            >
              <Filter />
              筛选
              {activeFilterConditions.length > 0 && <small>{activeFilterConditions.length}</small>}
              <ChevronDown />
            </button>
            {activeFilterConditions.length > 0 && (
              <>
                <span className="task-filter-result">显示 {filteredTasks.length} 条</span>
                <button className="task-filter-clear" type="button" onClick={() => setFilterConditions([])}>清空</button>
              </>
            )}
          </div>
          {viewMode !== 'week' && (
            <div className={`task-list-week-filter ${isBoardListWeekScoped ? 'active' : ''}`} aria-label="任务周范围">
              <span>{isBoardListWeekScoped ? weekRangeLabel : '全部时间'}</span>
              <button type="button" title="上一周" aria-label="上一周任务" onClick={() => moveBoardListWeek(-1)}>
                <ChevronLeft />
              </button>
              <button className="task-list-week-current" type="button" onClick={selectCurrentWeek}>
                {!isBoardListWeekScoped || isCurrentWeek ? '本周' : weekLabel}
              </button>
              <button type="button" title="下一周" aria-label="下一周任务" onClick={() => moveBoardListWeek(1)}>
                <ChevronRight />
              </button>
              {isBoardListWeekScoped && (
                <button
                  type="button"
                  title="显示全部时间"
                  aria-label="取消周筛选"
                  onClick={() => {
                    setIsBoardListWeekScoped(false);
                    setSelectedWeekStart(getWeekStart(new Date()));
                  }}
                >
                  <X />
                </button>
              )}
            </div>
          )}
          {viewMode === 'week' && (
            <div className="task-week-navigation" aria-label="周日历导航">
              <button type="button" title="上一周" aria-label="上一周" onClick={() => setSelectedWeekStart((current) => addWeeks(current, -1))}>
                <ChevronLeft />
              </button>
              <label className="task-week-picker">
                <CalendarDays />
                <strong>{weekLabel}</strong>
                <ChevronDown />
                <input
                  aria-label="选择周"
                  type="week"
                  value={getIsoWeekValue(selectedWeekStart)}
                  onClick={(event) => {
                    if (event.isTrusted) event.currentTarget.showPicker();
                  }}
                  onChange={(event) => {
                    const nextWeek = parseIsoWeekValue(event.target.value);
                    if (nextWeek) setSelectedWeekStart(nextWeek);
                  }}
                />
              </label>
              <button type="button" title="下一周" aria-label="下一周" onClick={() => setSelectedWeekStart((current) => addWeeks(current, 1))}>
                <ChevronRight />
              </button>
              <button className="task-week-today" type="button" disabled={isCurrentWeek} onClick={() => setSelectedWeekStart(getWeekStart(new Date()))}>
                本周
              </button>
            </div>
          )}
          {isFilterOpen && (
            <TaskFilterPopover
              rootRef={filterPopoverRef}
              conditions={filterConditions}
              projects={activeProjects}
              onAdd={addFilterCondition}
              onRemove={removeFilterCondition}
              onFieldChange={updateFilterField}
              onChange={updateFilterCondition}
              onClear={() => setFilterConditions([])}
              onClose={() => setIsFilterOpen(false)}
            />
          )}
        </section>}

        {isTrash ? (
          <TaskRecycleBin
            activeTab={trashTab}
            projects={archivedProjects}
            tasks={archivedTasks}
            projectById={projectById}
            restoringKey={restoringKey}
            onTabChange={setTrashTab}
            onRestoreProject={restoreProject}
            onRestoreTask={restoreTask}
          />
        ) : viewMode === 'board' ? (
          <DndContext sensors={dragSensors} collisionDetection={taskCollisionDetection} onDragEnd={handleBoardDragEnd}>
            <section className="task-board-scroll">
              <div className="task-board-grid">
                {statuses.map((status) => (
                  <BoardTaskColumn
                    key={status}
                    status={status}
                    tasks={filteredTasks.filter((task) => task.status === status).sort(sortByOrderNum)}
                    projectById={projectById}
                    disabled={isReordering}
                    onOpen={openEditDrawer}
                    onAdd={() => openCreateDrawer(status)}
                  />
                ))}
              </div>
            </section>
          </DndContext>
        ) : viewMode === 'list' ? (
          <section className="task-data-table">
            <div className="task-data-row task-data-row-head">
              <span>任务</span>
              <span>项目</span>
              <span>优先级</span>
              <span>状态</span>
              <span>进度</span>
              <span>截止日</span>
            </div>
            <div className="task-data-body">
              {filteredTasks.length === 0 && <div className="task-table-empty">暂无任务</div>}
              {filteredTasks.map((task) => {
                const project = task.projectId ? projectById.get(task.projectId) : undefined;
                return (
                  <button className="task-data-row" type="button" key={task.id} onClick={() => openEditDrawer(task)}>
                    <strong>{task.title}</strong>
                    <span>{project ? <ProjectToken project={project} /> : <small>未分配</small>}</span>
                    <span><PriorityPill priority={task.priority} /></span>
                    <span><span className={`task-status-pill ${task.status}`}>{statusText[task.status]}</span></span>
                    <span className="task-table-progress"><i style={{width: `${task.progress}%`}} /><small>{task.progress}%</small></span>
                    <span>{task.dueDate || '-'}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <DndContext sensors={dragSensors} collisionDetection={taskCollisionDetection} onDragEnd={handleWeekDragEnd}>
          <section className="task-week-view">
            <div className="task-week-focus-sections">
              {isCurrentWeek && overdueTasks.length > 0 && (
                <WeekFocusSection
                  className="overdue"
                  label="逾期待办"
                  tasks={overdueTasks}
                  projectById={projectById}
                  onOpen={openEditDrawer}
                />
              )}
              {undatedTodoTasks.length > 0 && (
                <WeekFocusSection
                  className="unscheduled"
                  label="未排期待办"
                  tasks={undatedTodoTasks}
                  projectById={projectById}
                  onOpen={openEditDrawer}
                  onAdd={() => openCreateDrawer('todo')}
                />
              )}
            </div>
            <div className="task-week-calendar-scroll">
              <div className="task-week-calendar">
                {weekDays.map((day, dayIndex) => {
                  const dateKey = localDateKey(day);
                  const dayTasks = datedWeekTasks.filter((task) => task.dueDate === dateKey);
                  return (
                    <WeekDayColumn
                      key={dateKey}
                      dateKey={dateKey}
                      dayLabel={dayLabels[dayIndex]}
                      dateLabel={format(day, 'M月d日')}
                      isToday={isSameDay(day, new Date())}
                      isWeekend={dayIndex > 4}
                      tasks={dayTasks}
                      projectById={projectById}
                      disabled={isReordering}
                      onOpen={openEditDrawer}
                      onAdd={() => openCreateDrawer('todo', dateKey)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
          </DndContext>
        )}
      </section>

      {drawer && (
        <section className="task-drawer-backdrop" aria-label="任务详情遮罩" onMouseDown={requestDrawerClose}>
          <aside className="task-drawer" role="dialog" aria-modal="true" aria-label={drawer.mode === 'create' ? '新增任务' : '编辑任务'} onMouseDown={(event) => event.stopPropagation()}>
            <header className="task-drawer-header">
              <div>
                <span>{drawer.mode === 'create' ? '新增记录' : '任务详情'}</span>
                <h2>{draft.title.trim() || '未命名记录'}</h2>
              </div>
              <button type="button" title="关闭" aria-label="关闭任务详情" onClick={requestDrawerClose}>
                <X />
              </button>
            </header>

            <div className="task-drawer-body">
              <section className="task-detail-form">
                <TaskField icon={<AlignLeft />} label="任务名称">
                  <input aria-label="任务名称" autoFocus value={draft.title} placeholder="请输入任务名称" onChange={(event) => updateDraft('title', event.target.value)} />
                </TaskField>
                <TaskField icon={<CircleCheck />} label="状态">
                  <TaskTagSelect
                    ariaLabel="状态"
                    value={draft.status}
                    options={statuses.map((status) => ({value: status, label: statusText[status], className: `task-status-pill ${status}`}))}
                    onChange={(value) => updateDraft('status', value as TaskStatus)}
                  />
                </TaskField>
                <TaskField icon={<MoreHorizontal />} label="优先级">
                  <TaskTagSelect
                    ariaLabel="优先级"
                    value={draft.priority}
                    options={priorities.map((priority) => ({value: priority, label: priorityText[priority], className: `priority-pill ${priority.toLowerCase()}`}))}
                    onChange={(value) => updateDraft('priority', value as TaskPriority)}
                  />
                </TaskField>
                <TaskField icon={<CalendarDays />} label="截止日期">
                  <input
                    aria-label="截止日期"
                    type="date"
                    value={draft.dueDate}
                    onClick={(event) => {
                      if (event.isTrusted) event.currentTarget.showPicker();
                    }}
                    onChange={(event) => updateDraft('dueDate', event.target.value)}
                  />
                </TaskField>
                <TaskField icon={<Link2 />} label="父任务">
                  <select aria-label="父任务" value={draft.parentId} onChange={(event) => updateDraft('parentId', event.target.value)}>
                    <option value="">无父任务</option>
                    {activeTasks.filter((task) => task.id !== editingTask?.id).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                  </select>
                </TaskField>
                <TaskField icon={<Gauge />} label="进度">
                  <div className="task-progress-field">
                    <input aria-label="任务进度" type="range" min="0" max="100" value={draft.progress} onChange={(event) => updateDraft('progress', Number(event.target.value))} />
                    <input aria-label="进度百分比" type="number" min="0" max="100" value={draft.progress} onChange={(event) => updateDraft('progress', Math.min(100, Math.max(0, Number(event.target.value))))} />
                    <span>%</span>
                  </div>
                </TaskField>
                <TaskField icon={<AlignLeft />} label="备注" align="start">
                  <textarea aria-label="备注" rows={4} value={draft.description} placeholder="请输入备注内容" onChange={(event) => updateDraft('description', event.target.value)} />
                </TaskField>
                <TaskField icon={<FolderPlus />} label="所属项目" align="start">
                  <div className="task-project-field">
                    <div>
                      <select aria-label="所属项目" value={draft.projectId} onChange={(event) => updateDraft('projectId', event.target.value)}>
                        <option value="">未分配项目</option>
                        {activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                      </select>
                      <button type="button" onClick={() => setIsProjectCreateOpen((value) => !value)}>
                        <Plus />
                        新建项目
                      </button>
                    </div>
                    {isProjectCreateOpen && (
                      <section className="task-inline-project-form">
                        <input aria-label="新项目名称" value={newProjectName} placeholder="项目名称" onChange={(event) => setNewProjectName(event.target.value)} />
                        <label title="项目颜色">
                          <input type="color" value={newProjectColor} onChange={(event) => setNewProjectColor(event.target.value)} />
                        </label>
                        <button className="primary-btn" type="button" disabled={isSubmitting} onClick={() => void createAndSelectProject()}>创建并关联</button>
                      </section>
                    )}
                  </div>
                </TaskField>
                <TaskField icon={<Clock3 />} label="创建时间">
                  <output>{formatTimestamp(editingTask?.createdAt)}</output>
                </TaskField>
                <TaskField icon={<Clock3 />} label="更新时间">
                  <output>{formatTimestamp(editingTask?.updatedAt)}</output>
                </TaskField>
              </section>
              {drawerError && <p className="task-form-error task-drawer-error">{drawerError}</p>}
            </div>

            <footer className="task-drawer-footer">
              {drawer.mode === 'edit' ? (
                <>
                  <button className="task-archive-action" type="button" disabled={isSubmitting || isDeleting} onClick={() => editingTask && requestTaskDelete(editingTask)}>
                    <Trash2 />
                    删除任务
                  </button>
                  <button className="primary-btn" type="button" disabled={isSubmitting} onClick={() => void submitTask(false)}>
                    <Save />
                    {isSubmitting ? '保存中...' : '保存'}
                  </button>
                </>
              ) : (
                <>
                  <span />
                  <div>
                    <button type="button" disabled={isSubmitting} onClick={() => void submitTask(true)}>提交并继续添加</button>
                    <button className="primary-btn" type="button" disabled={isSubmitting} onClick={() => void submitTask(false)}>{isSubmitting ? '提交中...' : '提交'}</button>
                  </div>
                </>
              )}
            </footer>
          </aside>

        </section>
      )}
      <AppConfirmDialog
        isOpen={Boolean(pendingDelete)}
        onOpenChange={(isOpen) => !isOpen && !isDeleting && setPendingDelete(undefined)}
        title={pendingDelete?.type === 'project'
          ? `删除项目“${pendingDelete.item.name}”？`
          : `删除任务“${pendingDelete?.item.title ?? ''}”？`}
        description={`${pendingDelete?.type === 'project' ? '项目' : '任务'}将移入回收站，之后可以恢复。`}
        actionLabel={pendingDelete?.type === 'project' ? '删除项目' : '删除任务'}
        isLoading={isDeleting}
        onAction={deletePendingItem}
      />
      <AppConfirmDialog
        isOpen={showDiscardConfirm}
        onOpenChange={(isOpen) => !isOpen && setShowDiscardConfirm(false)}
        title="放弃未保存的修改？"
        description="当前任务内容尚未提交，关闭后这些修改将不会保留。"
        actionLabel="放弃修改"
        cancelLabel="继续编辑"
        onAction={closeDrawer}
      />
    </div>
  );
}

function TaskRecycleBin({
  activeTab,
  projects,
  tasks,
  projectById,
  restoringKey,
  onTabChange,
  onRestoreProject,
  onRestoreTask,
}: {
  activeTab: TrashTab;
  projects: Project[];
  tasks: Task[];
  projectById: Map<string, Project>;
  restoringKey: string;
  onTabChange: (tab: TrashTab) => void;
  onRestoreProject: (project: Project) => Promise<void>;
  onRestoreTask: (task: Task) => Promise<void>;
}) {
  const isProjectTab = activeTab === 'projects';
  const isEmpty = isProjectTab ? projects.length === 0 : tasks.length === 0;

  return (
    <VStack as="section" className="task-recycle-bin" gap={0} aria-label="项目任务回收站">
      <TabList value={activeTab} onChange={(value) => onTabChange(value as TrashTab)} hasDivider>
        <Tab value="projects" label="项目" endContent={<Badge label={projects.length} variant="neutral" />} />
        <Tab value="tasks" label="任务" endContent={<Badge label={tasks.length} variant="neutral" />} />
      </TabList>
      {isEmpty ? (
        <EmptyState
          icon={<Trash2 />}
          title={isProjectTab ? '没有已删除的项目' : '没有已删除的任务'}
          description="删除的内容会保留在这里，并且可以随时恢复。"
        />
      ) : (
        <VStack as="ul" className="task-recycle-list" gap={0}>
          {isProjectTab
            ? projects.map((project) => (
                <Item
                  key={project.id}
                  as="li"
                  density="spacious"
                  startContent={<span className="project-color-dot" style={{'--item-color': project.color} as CSSProperties} />}
                  label={project.name}
                  description={`删除于 ${formatTimestamp(project.archivedAt)}`}
                  endContent={(
                    <Button
                      label="恢复项目"
                      size="sm"
                      variant="ghost"
                      icon={<RotateCcw />}
                      isLoading={restoringKey === `project:${project.id}`}
                      isDisabled={Boolean(restoringKey) && restoringKey !== `project:${project.id}`}
                      onClick={() => void onRestoreProject(project)}
                    />
                  )}
                />
              ))
            : tasks.map((task) => {
                const project = task.projectId ? projectById.get(task.projectId) : undefined;
                const projectLabel = project?.name ?? (task.projectId ? '项目不可用' : '未分配');
                return (
                  <Item
                    key={task.id}
                    as="li"
                    density="spacious"
                    startContent={<CircleCheck aria-hidden="true" />}
                    label={task.title}
                    description={`${statusText[task.status]} · ${projectLabel} · 删除于 ${formatTimestamp(task.archivedAt)}`}
                    endContent={(
                      <Button
                        label="恢复任务"
                        size="sm"
                        variant="ghost"
                        icon={<RotateCcw />}
                        isLoading={restoringKey === `task:${task.id}`}
                        isDisabled={Boolean(restoringKey) && restoringKey !== `task:${task.id}`}
                        onClick={() => void onRestoreTask(task)}
                      />
                    )}
                  />
                );
              })}
        </VStack>
      )}
    </VStack>
  );
}

function TaskFilterPopover({
  rootRef,
  conditions,
  projects,
  onAdd,
  onRemove,
  onFieldChange,
  onChange,
  onClear,
  onClose,
}: {
  rootRef: RefObject<HTMLElement | null>;
  conditions: TaskFilterCondition[];
  projects: Project[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onFieldChange: (id: string, field: TaskFilterField) => void;
  onChange: (id: string, patch: Partial<TaskFilterCondition>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <section ref={rootRef} className="task-filter-popover" role="dialog" aria-label="任务筛选">
      <header className="task-filter-popover-header">
        <span>
          <Filter />
          <strong>筛选条件</strong>
          <small>同时满足以下条件</small>
        </span>
        <button type="button" title="关闭筛选" aria-label="关闭筛选" onClick={onClose}><X /></button>
      </header>
      <div className="task-filter-condition-list">
        {conditions.length === 0 && <span className="task-filter-empty">尚未添加筛选条件</span>}
        {conditions.map((condition, index) => (
          <div className="task-filter-condition" key={condition.id}>
            <span className="task-filter-joiner">{index === 0 ? '当' : '且'}</span>
            <select
              aria-label={`筛选字段 ${index + 1}`}
              value={condition.field}
              onChange={(event) => onFieldChange(condition.id, event.target.value as TaskFilterField)}
            >
              {taskFilterFields.map((field) => <option value={field.value} key={field.value}>{field.label}</option>)}
            </select>
            <select
              aria-label={`筛选方式 ${index + 1}`}
              value={condition.operator}
              onChange={(event) => onChange(condition.id, {operator: event.target.value as TaskFilterOperator})}
            >
              {getTaskFilterOperators(condition.field).map((operator) => (
                <option value={operator.value} key={operator.value}>{operator.label}</option>
              ))}
            </select>
            <TaskFilterValueControl
              condition={condition}
              projects={projects}
              ariaLabel={`筛选值 ${index + 1}`}
              onChange={(value) => onChange(condition.id, {value})}
            />
            <button className="task-filter-remove" type="button" title="删除条件" aria-label={`删除筛选条件 ${index + 1}`} onClick={() => onRemove(condition.id)}>
              <Trash2 />
            </button>
          </div>
        ))}
        <button className="task-filter-add" type="button" onClick={onAdd}>
          <Plus />
          添加条件
        </button>
      </div>
      <footer className="task-filter-popover-footer">
        <button type="button" disabled={conditions.length === 0} onClick={onClear}>重置</button>
        <button className="primary-btn" type="button" onClick={onClose}>完成</button>
      </footer>
    </section>
  );
}

function TaskFilterValueControl({
  condition,
  projects,
  ariaLabel,
  onChange,
}: {
  condition: TaskFilterCondition;
  projects: Project[];
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  if (condition.field === 'status') {
    return (
      <select aria-label={ariaLabel} value={condition.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择状态</option>
        {statuses.map((status) => <option value={status} key={status}>{statusText[status]}</option>)}
      </select>
    );
  }
  if (condition.field === 'priority') {
    return (
      <select aria-label={ariaLabel} value={condition.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择优先级</option>
        {priorities.map((priority) => <option value={priority} key={priority}>{priorityText[priority]}</option>)}
      </select>
    );
  }
  if (condition.field === 'projectId') {
    return (
      <select aria-label={ariaLabel} value={condition.value} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择项目</option>
        <option value="none">未分配项目</option>
        {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
      </select>
    );
  }
  if (condition.field === 'dueDate') {
    return (
      <input
        aria-label={ariaLabel}
        type="date"
        value={condition.value}
        onClick={(event) => {
          if (event.isTrusted) event.currentTarget.showPicker();
        }}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (condition.field === 'progress') {
    return <input aria-label={ariaLabel} type="number" min="0" max="100" value={condition.value} placeholder="0-100" onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <input
      aria-label={ariaLabel}
      value={condition.value}
      placeholder={condition.field === 'title' ? '输入任务名称' : '输入备注关键词'}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function BoardTaskColumn({
  status,
  tasks,
  projectById,
  disabled,
  onOpen,
  onAdd,
}: {
  status: TaskStatus;
  tasks: Task[];
  projectById: Map<string, Project>;
  disabled: boolean;
  onOpen: (task: Task) => void;
  onAdd: () => void;
}) {
  const {setNodeRef, isOver} = useDroppable({
    id: boardColumnDragId(status),
    data: {surface: 'board', groupId: status} satisfies TaskDragData,
    disabled,
  });

  return (
    <section className={`task-board-column status-${status} ${isOver ? 'drag-over' : ''}`}>
      <header className="task-board-column-head">
        <span className={`task-status-pill ${status}`}>{statusText[status]}</span>
        <small>{tasks.length}</small>
        <button type="button" title={`新增${statusText[status]}任务`} aria-label={`新增${statusText[status]}任务`} onClick={onAdd}>
          <Plus />
        </button>
      </header>
      <SortableContext items={tasks.map((task) => boardTaskDragId(task.id))} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="task-board-list">
          {tasks.length === 0 && <span className="task-column-empty">暂无任务</span>}
          {tasks.map((task) => (
            <SortableBoardTaskCard
              key={task.id}
              task={task}
              project={task.projectId ? projectById.get(task.projectId) : undefined}
              disabled={disabled}
              onOpen={() => onOpen(task)}
            />
          ))}
        </div>
      </SortableContext>
      <button className="task-column-add" type="button" onClick={onAdd}>
        <Plus />
        <span>新增记录</span>
      </button>
    </section>
  );
}

function SortableBoardTaskCard({task, project, disabled, onOpen}: {task: Task; project?: Project; disabled: boolean; onOpen: () => void}) {
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
    id: boardTaskDragId(task.id),
    data: {surface: 'board', taskId: task.id, groupId: task.status} satisfies TaskDragData,
    disabled,
  });
  const style: CSSProperties = {
    transform: DndCss.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 3 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      className={`task-board-card task-sortable-card ${isDragging ? 'dragging' : ''}`}
      type="button"
      title="拖动调整顺序或状态"
      style={style}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <strong>{task.title}</strong>
      <div className="task-card-pills">
        <span className={`task-status-pill ${task.status}`}>{statusText[task.status]}</span>
        <PriorityPill priority={task.priority} />
      </div>
      {project && <ProjectToken project={project} />}
      <span className="task-card-date">
        <CalendarDays />
        {task.dueDate || '未设置截止日期'}
      </span>
    </button>
  );
}

function WeekDayColumn({
  dateKey,
  dayLabel,
  dateLabel,
  isToday,
  isWeekend,
  tasks,
  projectById,
  disabled,
  onOpen,
  onAdd,
}: {
  dateKey: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isWeekend: boolean;
  tasks: Task[];
  projectById: Map<string, Project>;
  disabled: boolean;
  onOpen: (task: Task) => void;
  onAdd: () => void;
}) {
  const {setNodeRef, isOver} = useDroppable({
    id: weekDayDragId(dateKey),
    data: {surface: 'week', groupId: dateKey} satisfies TaskDragData,
    disabled,
  });

  return (
    <section className={`task-week-day ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${isOver ? 'drag-over' : ''}`}>
      <header className="task-week-day-header">
        <span>
          <small>{dayLabel}</small>
          <strong>{dateLabel}</strong>
        </span>
        <span className="task-week-day-actions">
          <small>{tasks.length}</small>
          <button type="button" title={`在${dateLabel}新增任务`} aria-label={`在${dateLabel}新增任务`} onClick={onAdd}>
            <Plus />
          </button>
        </span>
      </header>
      <SortableContext items={tasks.map((task) => weekTaskDragId(task.id))} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="task-week-day-list">
          {tasks.length === 0 && <span className="task-week-day-empty">暂无任务</span>}
          {tasks.map((task) => (
            <SortableWeekTaskCard
              key={task.id}
              task={task}
              project={task.projectId ? projectById.get(task.projectId) : undefined}
              disabled={disabled}
              onOpen={() => onOpen(task)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function SortableWeekTaskCard({task, project, disabled, onOpen}: {task: Task; project?: Project; disabled: boolean; onOpen: () => void}) {
  const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({
    id: weekTaskDragId(task.id),
    data: {surface: 'week', taskId: task.id, groupId: task.dueDate} satisfies TaskDragData,
    disabled,
  });
  const style: CSSProperties = {
    transform: DndCss.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 3 : undefined,
  };

  return (
    <button
      ref={setNodeRef}
      className={`task-week-card task-sortable-card ${task.status === 'done' ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
      type="button"
      title="拖动调整顺序或截止日期"
      style={style}
      onClick={onOpen}
      {...attributes}
      {...listeners}
    >
      <strong>{task.title}</strong>
      <span className="task-week-card-pills">
        <span className={`task-status-pill ${task.status}`}>{statusText[task.status]}</span>
        <PriorityPill priority={task.priority} />
      </span>
      {project && <ProjectToken project={project} />}
    </button>
  );
}

function WeekFocusSection({
  className,
  label,
  tasks,
  projectById,
  onOpen,
  onAdd,
}: {
  className: 'overdue' | 'unscheduled';
  label: string;
  tasks: Task[];
  projectById: Map<string, Project>;
  onOpen: (task: Task) => void;
  onAdd?: () => void;
}) {
  return (
    <section className={`task-week-focus-row ${className}`}>
      <header>
        <span>
          <strong>{label}</strong>
          <small>{tasks.length}</small>
        </span>
        {onAdd && (
          <button type="button" title={`新增${label}`} aria-label={`新增${label}`} onClick={onAdd}>
            <Plus />
          </button>
        )}
      </header>
      <div className="task-week-focus-list">
        {tasks.length === 0 && <span className="task-week-focus-empty">暂无{label}</span>}
        {tasks.map((task) => {
          const project = task.projectId ? projectById.get(task.projectId) : undefined;
          return (
            <button className="task-week-focus-card" type="button" key={task.id} onClick={() => onOpen(task)}>
              <strong>{task.title}</strong>
              <span>
                <span className={`task-status-pill ${task.status}`}>{statusText[task.status]}</span>
                <PriorityPill priority={task.priority} />
                {project && <ProjectToken project={project} />}
                {task.dueDate && <small>{task.dueDate}</small>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface TaskTagOption {
  value: string;
  label: string;
  className: string;
}

function TaskTagSelect({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: TaskTagOption[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const filteredOptions = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) setIsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`task-tag-picker ${isOpen ? 'open' : ''}`}>
      <button
        className="task-tag-picker-trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((current) => !current);
          setQuery('');
        }}
      >
        <span className={selectedOption.className}>{selectedOption.label}</span>
        <ChevronDown />
      </button>
      {isOpen && (
        <section className="task-tag-picker-menu">
          <label className="task-tag-picker-search">
            <Search />
            <input autoFocus aria-label={`搜索${ariaLabel}选项`} value={query} placeholder="搜索选项" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="task-tag-picker-options" role="listbox" aria-label={`${ariaLabel}选项`}>
            {filteredOptions.map((option) => (
              <button
                className={option.value === value ? 'active' : ''}
                type="button"
                role="option"
                aria-selected={option.value === value}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                <span className={option.className}>{option.label}</span>
                {option.value === value && <Check />}
              </button>
            ))}
            {filteredOptions.length === 0 && <span className="task-tag-picker-empty">没有匹配选项</span>}
          </div>
        </section>
      )}
    </div>
  );
}

function PriorityPill({priority}: {priority: TaskPriority}) {
  return <span className={`priority-pill ${priority.toLowerCase()}`}>{priorityText[priority]}</span>;
}

function ProjectToken({project}: {project: Project}) {
  return (
    <span className="project-token">
      <i style={{'--item-color': project.color} as CSSProperties} />
      {project.name}
    </span>
  );
}

function TaskField({
  icon,
  label,
  align = 'center',
  children,
}: {
  icon: React.ReactNode;
  label: string;
  align?: 'center' | 'start';
  children: React.ReactNode;
}) {
  return (
    <div className={`task-detail-field ${align === 'start' ? 'align-start' : ''}`}>
      <span className="task-detail-label">{icon}<span>{label}</span></span>
      <span className="task-detail-control">{children}</span>
    </div>
  );
}
