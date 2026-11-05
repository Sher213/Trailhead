export type StepType = "book" | "action";
export type StepStatus = "current" | "locked" | "completed";

export interface RoadmapStep {
  title: string;
  author: string | null;
  type: StepType;
  rationale: string;
  status: StepStatus;
  reflection: Record<string, string> | null;
}

export interface Journey {
  goal: string;
  steps: RoadmapStep[];
  currentIndex: number;
  createdAt: number;
}

export interface JourneyIndexEntry {
  slug: string;
  goal: string;
  createdAt: number;
}

export interface ReflectionQuestion {
  label: string;
  prompt: string;
}

export interface ModalState {
  stepIndex: number;
  questions: ReflectionQuestion[] | null;
  answers: Record<string, string>;
  loadingQ: boolean;
}

export interface RoadmapResponse {
  steps: Array<{
    title: string;
    author: string | null;
    type: StepType;
    rationale: string;
  }>;
}

export interface ReflectionResponse {
  questions: ReflectionQuestion[];
}
