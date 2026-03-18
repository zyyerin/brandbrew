import { useState } from "react";
import { FolderOpen, Plus, Save, Trash2, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";

const MAX_PROJECTS = 3;

export interface ProjectEntry {
  id: string;
  name: string;
  savedAt: string;
}

interface ProjectSwitcherProps {
  currentProjectId: string;
  projects: ProjectEntry[];
  onSwitch: (projectId: string) => void;
  onNew: () => void;
  onDelete: (projectId: string) => void;
  onSaveNow: () => Promise<void>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function ProjectSwitcher({
  currentProjectId,
  projects,
  onSwitch,
  onNew,
  onDelete,
  onSaveNow,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleDelete = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    onDelete(id);
    setConfirmDeleteId(null);
  };

  const handleSwitch = (id: string) => {
    if (id === currentProjectId) return;
    setOpen(false);
    onSwitch(id);
  };

  const handleNew = () => {
    setOpen(false);
    onNew();
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSaveNow();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // error already logged upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) { setConfirmDeleteId(null); setSaved(false); } }}>
      <PopoverTrigger asChild>
        <button
          className="p-2 rounded-lg bg-white/90 border border-border/60 shadow-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer"
          title="Project switcher"
        >
          <FolderOpen size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0">
        <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Projects ({projects.length}/{MAX_PROJECTS})
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Save current project"
            >
              {saved ? <Check size={12} className="text-green-500" /> : <Save size={12} />}
              {saving ? "Saving…" : saved ? "Saved" : "Save"}
            </button>
            <button
              onClick={handleNew}
              disabled={projects.length >= MAX_PROJECTS}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={12} />
              New
            </button>
          </div>
        </div>
        <div className="py-1 max-h-60 overflow-y-auto">
          {projects.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              No saved projects
            </p>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              className={`group flex items-center gap-2 px-3 py-2 transition-colors ${
                confirmDeleteId === p.id
                  ? "bg-destructive/10"
                  : "cursor-pointer"
              } ${
                p.id === currentProjectId && confirmDeleteId !== p.id
                  ? "bg-primary/5 text-foreground"
                  : confirmDeleteId !== p.id
                    ? "hover:bg-muted/50 text-foreground/80"
                    : ""
              }`}
              onClick={() => confirmDeleteId !== p.id && handleSwitch(p.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {confirmDeleteId === p.id ? "Delete this project?" : timeAgo(p.savedAt)}
                </div>
              </div>
              {p.id === currentProjectId && confirmDeleteId !== p.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              )}
              {confirmDeleteId === p.id ? (
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    className="px-2 py-1 text-[11px] font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2 py-1 text-[11px] font-medium rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDelete(p.id);
                  }}
                  className="p-1 shrink-0 transition-colors text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-destructive"
                  title="Delete project"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
