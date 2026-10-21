import {lessonReadingSkills, lessonReadingCards, readingLessonById} from './reading-lessons.js';

export function lessonAssessmentSkills(id) {
  const reading = lessonReadingSkills(id), lesson = readingLessonById(id);
  if (!lesson || !reading.length) return reading;
  const base = reading[0];
  return [...reading,
    {...base, id: `lesson-${id}-dictation`, kind: 'lesson-dictation', readingLevel: '', title: `إملاء كلمات من الدرس · ${lesson.title}`, domain: 'الكتابة والإملاء'},
    {...base, id: `lesson-${id}-listening`, kind: 'lesson-listening', readingLevel: '', title: `الاستماع إلى نص الدرس · ${lesson.title}`, domain: 'الفهم والاستماع'},
  ];
}

export function lessonAssessmentCards(skill) {
  const lesson = readingLessonById(skill.lessonId);
  if (!lesson) return [];
  const base = {skillId: skill.id, skillTitle: skill.title, lessonId: lesson.id, lessonTitle: lesson.title, source: skill.source, domain: skill.domain, provenance: `تدريب من نص درس «${lesson.title}»`, templateVersion: 1};
  if (skill.kind === 'lesson-dictation') {
    const reading = lessonReadingSkills(lesson.id).find(s => s.readingLevel === 'words');
    return lessonReadingCards(reading).slice(0, 5).map((word, i) => ({...base, id: `${skill.id}-q${i + 1}`, kind: 'dictation', lessonAssessment: 'dictation', display: 'استمع إلى الكلمة ثم اكتبها.', teacherText: word.display, instruction: 'يملي المعلم الكلمة دون عرضها للطالب.', expected: `الكلمة المطلوبة: ${word.display}. يقيّم المعلم صحة الكتابة مستقلًا، دون عرض النموذج.`}));
  }
  const prompts = [
    ['الشخصيات', 'اذكر شخصية وردت في النص الذي استمعت إليه.', 'يسمي شخصية مذكورة في المقطع، وتقبل الإجابة بالمعنى دون تلقين.'],
    ['الأحداث', 'اذكر حدثًا ورد في النص الذي استمعت إليه.', 'يذكر حدثًا صحيحًا ورد في المقطع، دون إضافة واقعة لم يسمعها.'],
    ['إعادة السرد', 'احكِ بكلماتك ما فهمته من النص المسموع.', 'يعيد معنى المقطع بكلماته مع الحفاظ على الفكرة وتسلسل الأحداث الأساسي.'],
  ];
  return prompts.map(([facet, display, expected], i) => ({...base, id: `${skill.id}-q${i + 1}`, kind: 'listening', lessonAssessment: 'listening', passageId: `listening-${lesson.id}`, passageTitle: lesson.title, teacherText: lesson.fragments.map(f => f.text).join(' '), display, facet, instruction: 'يقرأ المعلم نص الدرس، ثم يسأل شفهيًا دون عرض النص أو السؤال للطالب.', expected}));
}
