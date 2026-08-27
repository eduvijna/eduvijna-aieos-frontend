import type {
  TeachingWork,
  TeachingWorkRefineRequest,
} from "@/services/api/generated/teachingTypes";

export type WorkForm = {
  goalText: string;
  classLabel: string;
  subject: string;
  topic: string;
  targetDate: string;
  locale: string;
};

export const EMPTY_WORK_FORM: WorkForm = {
  goalText: "",
  classLabel: "",
  subject: "",
  topic: "",
  targetDate: "",
  locale: "",
};

export function formFromWork(work: TeachingWork): WorkForm {
  return {
    goalText: work.goal_text,
    classLabel: work.class_label ?? "",
    subject: work.subject ?? "",
    topic: work.topic ?? "",
    targetDate: work.target_date,
    locale: work.locale,
  };
}

/**
 * True partial PATCH: only changed keys are sent. A cleared optional field is
 * sent as explicit null; the non-nullable fields are never sent as null.
 */
export function buildRefineBody(
  work: TeachingWork,
  form: WorkForm,
): TeachingWorkRefineRequest {
  const body: TeachingWorkRefineRequest = {};

  const goalText = form.goalText.trim();
  if (goalText && goalText !== work.goal_text) body.goal_text = goalText;
  if (form.targetDate && form.targetDate !== work.target_date) {
    body.target_date = form.targetDate;
  }
  const locale = form.locale.trim();
  if (locale && locale !== work.locale) body.locale = locale;

  const classLabel = form.classLabel.trim() || null;
  if (classLabel !== work.class_label) body.class_label = classLabel;
  const subject = form.subject.trim() || null;
  if (subject !== work.subject) body.subject = subject;
  const topic = form.topic.trim() || null;
  if (topic !== work.topic) body.topic = topic;

  return body;
}
