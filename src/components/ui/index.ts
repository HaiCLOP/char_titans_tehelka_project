// Shared UI kit (PRD section 6). Theme tokens only; every string comes from messages/*.json.
// Client-only pieces are marked "use client" in their own files, so this barrel is safe to import
// from server components.
export { Button, buttonVariants, type ButtonProps } from "./button";
export { Card, CardHeader } from "./card";
export { Chip, PriorityChip, CategoryChip, STATUS_TONE, type ChipProps, type ChipTone, type Priority } from "./chip";
export { StatusChip } from "./status-chip";
export { CATEGORY_ICON } from "./category-icon";
export { Skeleton, SkeletonText, IssueCardSkeleton, KpiCardSkeleton, ListSkeleton } from "./skeleton";
export { EmptyState, ForbiddenState } from "./states";
export { ErrorState } from "./error-state";
export { Avatar } from "./avatar";
export { Dialog, Drawer, type OverlayProps } from "./dialog";
export { Tabs, type TabItem, type TabsProps } from "./tabs";
export {
  Field, Input, Textarea, Select, Switch, describedBy,
  type FieldProps, type InputProps, type TextareaProps, type SelectProps, type SelectOption, type SwitchProps,
} from "./form";
export { Combobox, type ComboboxProps } from "./combobox";
export { PhotoDropzone, type PhotoItem, type PhotoDropzoneProps } from "./photo-dropzone";
export { Timeline, type TimelineItem, type TimelineEventType } from "./timeline";
export { KpiCard, Sparkline, type KpiCardProps, type KpiTone } from "./kpi-card";
export { IssueCard, type IssueCardData } from "./issue-card";
export { ActivityItem, type ActivityItemProps } from "./activity-item";
export { LangText } from "./lang-text";
export { RelativeTime, formatRelative, formatAbsolute } from "./relative-time";
