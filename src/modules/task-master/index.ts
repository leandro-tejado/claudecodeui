// The deferred wrapper, not the panel. The providers below stay static.
export { LazyTaskMasterPanel as TaskMasterPanel } from '@/modules/task-master/LazyTaskMasterPanel';
export { default as NextTaskBanner } from '@/modules/task-master/NextTaskBanner';
export { TaskMasterProvider, useTaskMaster } from '@/modules/task-master/context/TaskMasterContext';
export { TasksSettingsProvider, useTasksSettings } from '@/modules/task-master/context/TasksSettingsContext';
export { useTaskMasterProjectSync } from '@/modules/task-master/hooks/useTaskMasterProjectSync';
