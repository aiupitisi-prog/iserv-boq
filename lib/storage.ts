import type { BoqProject } from "./boq";
import { newId } from "./boq";

const KEY = "iserv-boq-projects-v1";

export function loadProjects(): BoqProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BoqProject[]) : [];
  } catch {
    return [];
  }
}

export function saveProjects(list: BoqProject[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function emptyProject(): BoqProject {
  return {
    id: newId(),
    name: "โครงการใหม่",
    address: "",
    boqType: "ปร.1",
    createdAt: new Date().toISOString(),
    items: [],
  };
}
