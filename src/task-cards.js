// Split compound curriculum outcomes into independently scored tasks.
// Saved results keep their original cards; this factory is used only for new tests.
const sentences = [
  'كَتَبَ سَامِي جُمْلَةً.',
  'الْمَدْرَسَةُ جَمِيلَةٌ.',
  'أُحِبُّ الْقِرَاءَةَ.',
  'تَعَاوَنَ الْأَصْدِقَاءُ.',
  'سَاعَدَ خَالِدٌ أَخَاهُ.',
];
const stems = ['كَتَبَ', 'رَسَمَ', 'فَتَحَ', 'جَلَسَ', 'لَعِبَ'];
const present = ['يَكْتُبُ', 'يَرْسُمُ', 'يَفْتَحُ', 'يَجْلِسُ', 'يَلْعَبُ'];
const commands = ['اُكْتُبْ', 'اُرْسُمْ', 'اِفْتَحْ', 'اِجْلِسْ', 'اِلْعَبْ'];

const tasks = {
  read: { kind: 'reading', title: 'قراءة كلمات مستقلة', facet: 'القراءة' },
  write: { kind: 'dictation', title: 'الإملاء الاختباري', facet: 'الإملاء' },
  order: { title: 'يرتب كلمات لتكوين جملة', facet: 'ترتيب الكلمات' },
  story: { title: 'يسرد أحداث قصة', facet: 'سرد الأحداث' },
  ending: { title: 'يكتب نهاية مغايرة', facet: 'النهاية المغايرة' },
  question: { title: 'يصوغ أسئلة', facet: 'صياغة السؤال' },
  wish: { title: 'يستخدم لعل للترجي', facet: 'الترجي' },
  negative: { title: 'ينفي بلا', facet: 'النفي' },
  exception: { title: 'يستخدم إلا للاستثناء', facet: 'الاستثناء بإلا' },
  preference: { title: 'يستخدم التفضيل على وزن أفعل', facet: 'التفضيل' },
  wonder: { title: 'يتعجب بما أفعل', facet: 'التعجب' },
  article: { title: 'يميز ال الشمسية والقمرية', facet: 'نوع اللام' },
  tanween: { title: 'يتعرف أنواع التنوين', facet: 'نوع التنوين' },
  vowels: { title: 'يحدد حرف المد', facet: 'نوع المد' },
  endings: { title: 'يميز ت وة وه', facet: 'نهاية الكلمة' },
  maqsoora: { title: 'يميز الألف اللينة ا وى', facet: 'الألف اللينة' },
  hamza: { title: 'يميز همزتي الوصل والقطع', facet: 'نوع الهمزة' },
  past: {
    facet: 'الماضي',
    samples: present,
    instruction: 'حوّل الفعل إلى الماضي.',
    answers: stems,
  },
  present: {
    facet: 'المضارع',
    samples: stems,
    instruction: 'حوّل الفعل إلى المضارع.',
    answers: present,
  },
  command: {
    facet: 'الأمر',
    samples: stems,
    instruction: 'حوّل الفعل إلى الأمر.',
    answers: commands,
  },
  singular: {
    facet: 'المفرد',
    samples: ['أَوْلَادٌ', 'أَقْلَامٌ', 'كُتُبٌ', 'بَنَاتٌ', 'أَشْجَارٌ'],
    instruction: 'حوّل الكلمة إلى المفرد.',
    answers: ['وَلَدٌ', 'قَلَمٌ', 'كِتَابٌ', 'بِنْتٌ', 'شَجَرَةٌ'],
  },
  dual: {
    facet: 'المثنى',
    samples: ['وَلَدٌ', 'قَلَمٌ', 'كِتَابٌ', 'بِنْتٌ', 'شَجَرَةٌ'],
    instruction: 'حوّل الكلمة إلى المثنى.',
    answers: [
      'وَلَدَانِ',
      'قَلَمَانِ',
      'كِتَابَانِ',
      'بِنْتَانِ',
      'شَجَرَتَانِ',
    ],
  },
  plural: {
    facet: 'الجمع',
    samples: ['وَلَدٌ', 'قَلَمٌ', 'كِتَابٌ', 'بِنْتٌ', 'شَجَرَةٌ'],
    instruction: 'حوّل الكلمة إلى الجمع.',
    answers: ['أَوْلَادٌ', 'أَقْلَامٌ', 'كُتُبٌ', 'بَنَاتٌ', 'أَشْجَارٌ'],
  },
  idea: {
    facet: 'الفكرة الرئيسة',
    kind: 'literal',
    instruction: 'ما الفكرة الرئيسة في النص؟',
    answers: [
      'زيارة الصديق المريض',
      'العناية بالنبتة',
      'المحافظة على النظافة',
      'التعاون في ترتيب المكتبة',
      'المحافظة على نظافة الشاطئ',
    ],
  },
  event: {
    facet: 'الحدث',
    kind: 'literal',
    instruction: 'ما الحدث الرئيس في النص؟',
    answers: [
      'زيارة سامي لصديقه المريض',
      'زرع خالد بذرة ورعاها',
      'وضعت نورة الورقة في السلة',
      'رتب الأصدقاء المكتبة',
      'قرر فهد المحافظة على نظافة الشاطئ',
    ],
  },
  character: {
    facet: 'الشخصية',
    kind: 'literal',
    instruction: 'من الشخصية الرئيسة في النص؟',
    answers: ['سامي', 'خالد', 'نورة', 'الأصدقاء', 'فهد'],
  },
  quality: {
    facet: 'صفة الشخصية',
    kind: 'literal',
    instruction: 'اذكر صفة للشخصية يدل عليها النص.',
    answers: [
      'سامي وفي أو عطوف',
      'خالد مهتم أو صبور',
      'نورة حريصة على النظافة',
      'الأصدقاء متعاونون',
      'فهد حريص على البيئة',
    ],
  },
  evidence: {
    facet: 'الدليل من النص',
    kind: 'literal',
    instruction: 'اذكر دليلًا من النص على تصرف حسن.',
    answers: [
      'حمل سامي لصديقه كتابًا',
      'سقى خالد النبتة كل يوم',
      'وضعت نورة الورقة في السلة',
      'وضع الأصدقاء الكتب على الرفوف',
      'قرر فهد حفظ الشاطئ نظيفًا',
    ],
  },
  compose: {
    facet: 'تكوين جملة',
    samples: ['مدرستي', 'أسرتي', 'صديقي', 'النظافة', 'التعاون'],
    instruction: 'كوّن جملة واحدة مفيدة عن الموضوع.',
    criterion:
      'جملة مكتملة المعنى مناسبة للموضوع؛ لا يدخل الحكم على الإملاء أو جمال الخط هنا.',
  },
  describe: {
    facet: 'الوصف الكتابي',
    samples: ['كِتَابٌ', 'شَجَرَةٌ', 'مَدْرَسَةٌ', 'قَلَمٌ', 'حَدِيقَةٌ'],
    instruction: 'اكتب جملة تصف الشيء المذكور.',
    criterion:
      'جملة وصفية مفهومة مناسبة؛ يقاس الوصف مستقلًا عن ترتيب الكلمات والإملاء.',
  },
  delete: {
    facet: 'حذف كلمة',
    samples: sentences,
    instruction:
      'احذف كلمة يمكن الاستغناء عنها مع بقاء المعنى صحيحًا، أو قل إن الحذف لا يصلح.',
    criterion:
      'حذف لا يفسد اكتمال المعنى، أو بيان عدم صلاحية حذف كلمة من الجملة؛ لا تطلب الاستبدال والتوسيع في الحكم نفسه.',
  },
  replace: {
    facet: 'استبدال كلمة',
    samples: sentences,
    instruction: 'استبدل كلمة واحدة بكلمة مناسبة.',
    criterion: 'استبدال كلمة مع بقاء تركيب الجملة ومعناها صحيحين.',
  },
  expand: {
    facet: 'توسيع الجملة',
    samples: sentences,
    instruction: 'أضف كلمة أو عبارة مناسبة إلى الجملة.',
    criterion: 'إضافة ملائمة لا تفسد تركيب الجملة أو معناها.',
  },
  punctuate: { title: 'يراعي الترقيم', facet: 'علامة الترقيم' },
  letter: { title: 'يكتب رسالة شكر', facet: 'رسالة الشكر' },
  number: {
    facet: 'العدد المفرد',
    samples: ['١', '٢', '٣', '٤', '٥'],
    instruction: 'اذكر اسم العدد المكتوب.',
    answers: ['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة'],
  },
};
const compounds = {
  'يحلل جملة إلى كلمات وكلمة إلى مقاطع وأصوات': [
    'sentence-analysis',
    'word-analysis',
  ],
  'يقرأ قراءة جهرية ويفهم حدثًا وشخصية': ['text-reading', 'event', 'character'],
  'يقرأ ويكتب السكون مع ما قبله': ['read', 'write'],
  'يقرأ ويكتب كلمات تراكمية': ['read', 'write'],
  'يقرأ ويكتب التنوين': ['read', 'write'],
  'يستخدم المدود الثلاثة قراءة وكتابة': ['read', 'write'],
  'يرتب كلمات ويصف صورة كتابة': ['order', 'describe'],
  'يرتب جملًا ويبني تعبيرًا قصيرًا': ['sentence-order', 'compose'],
  'يرتب جملًا لبناء نص': ['sentence-order'],
  'يربط بالواو والفاء وثم': ['waw-link', 'fa-link', 'thumma-link'],
  'يحاكي الماضي والمضارع والأمر': ['past', 'present', 'command'],
  'يحول بين الماضي والمضارع والأمر': ['past', 'present', 'command'],
  'يحاكي المفرد والجمع والعكس': ['singular', 'plural'],
  'يستخدم المفرد والجمع': ['singular', 'plural'],
  'يستخدم المفرد والمثنى والجمع': ['singular', 'dual', 'plural'],
  'يحاكي تثنية المفرد': ['dual'],
  'يوظف الاستثناء والتفضيل والتعجب': ['exception', 'preference', 'wonder'],
  'يوظف التفضيل والتعجب والترجي والنفي والاستفهام والاستثناء': [
    'preference',
    'wonder',
    'wish',
    'negative',
    'question',
    'exception',
  ],
  'يصوغ أسئلة ويكتب قصة مصورة': ['question', 'story'],
  'يراعي الترقيم ويصوغ أسئلة': ['punctuate', 'question'],
  'يحدد فكرة النص وصفة الشخصية بدليل': ['idea', 'quality', 'evidence'],
  'يربط شخصية بحدث': ['character', 'event'],
  'يستخلص فكرة رئيسة': ['idea'],
  'يكتب نهاية مغايرة ويغني النص': ['ending', 'expand'],
  'يكتب جملًا ونهاية مغايرة': ['compose', 'ending'],
  'يكتب رسالة شكر وقصة مصورة': ['letter', 'story'],
  'يوسع جملة ويحذف عنصرًا ويستبدل مفردة': ['expand', 'delete', 'replace'],
  'يحذف مفردة من جملة': ['delete'],
  'يميز الوصل والقطع والألف اللينة': ['hamza', 'maqsoora'],
  'يميز التاء المربوطة والألف المقصورة': ['endings', 'maqsoora'],
  'يميز ة والألف المقصورة والوصل والقطع': ['endings', 'maqsoora', 'hamza'],
  'يميز التاء المربوطة قراءة وكتابة': ['read', 'write'],
  'يميز الألف المقصورة قراءة وكتابة': ['read', 'write'],
  'يستخدم العدد المفرد': ['number'],
};
tasks['text-reading'] = {
  kind: 'literal',
  facet: 'القراءة الجهرية',
  instruction: 'اقرأ النص قراءة جهرية.',
  criterion: 'قراءة مستقلة صحيحة؛ الفهم يقاس في بطاقة منفصلة.',
};
tasks['sentence-analysis'] = {
  samples: sentences,
  facet: 'تحليل الجملة',
  instruction: 'اذكر كلمات الجملة بالترتيب.',
  answers: sentences.map((s) => s.replace(/\.$/, '').split(' ').join(' / ')),
};
tasks['word-analysis'] = {
  title: 'يحلل كلمة إلى مقاطع',
  facet: 'تحليل الكلمة',
};
tasks['sentence-order'] = {
  facet: 'ترتيب الجمل',
  samples: [
    'نَامَ خَالِدٌ. / ذَهَبَ إِلَى الْمَدْرَسَةِ. / اِسْتَيْقَظَ خَالِدٌ.',
    'أَكَلَ سَامِي. / غَسَلَ سَامِي يَدَيْهِ. / غَسَلَ صَحْنَهُ.',
    'نَمَتِ النَّبْتَةُ. / زَرَعَ خَالِدٌ بَذْرَةً. / سَقَى الْبَذْرَةَ.',
    'سَلَّمَ الْكِتَابَ. / اِسْتَعَارَ فَهْدٌ كِتَابًا. / قَرَأَ الْكِتَابَ.',
    'لَوَّنَتِ الزَّهْرَةَ. / أَحْضَرَتْ نُورَةُ وَرَقَةً. / رَسَمَتْ زَهْرَةً.',
  ],
  instruction: 'رتب الجمل لتكوين تسلسل زمني مناسب.',
  answers: [
    'استيقظ خالد، ثم ذهب إلى المدرسة، ثم نام.',
    'غسل سامي يديه، ثم أكل، ثم غسل صحنه.',
    'زرع خالد بذرة، ثم سقى البذرة، ثم نمت النبتة.',
    'استعار فهد كتابًا، ثم قرأ الكتاب، ثم سلمه.',
    'أحضرت نورة ورقة، ثم رسمت زهرة، ثم لونت الزهرة.',
  ],
};
for (const [id, word, facet] of [
  ['waw-link', 'وَ', 'العطف بالواو'],
  ['fa-link', 'فَ', 'العطف بالفاء'],
  ['thumma-link', 'ثُمَّ', 'العطف بثم'],
]) {
  tasks[id] = {
    facet,
    samples: [
      'دَخَلَ سَامِي ... جَلَسَ.',
      'قَرَأَ خَالِدٌ ... كَتَبَ.',
      'رَسَمَتْ نُورَةُ ... لَوَّنَتْ.',
      'زَرَعَ خَالِدٌ ... سَقَى.',
      'فَتَحَ فَهْدٌ الْكِتَابَ ... قَرَأَ.',
    ],
    instruction: 'أكمل الجملة باستخدام ' + word + ' فقط.',
    answers: Array(5).fill(word),
  };
}

export function splitTasks(skill, baseFactory) {
  const ids = compounds[skill.title];
  if (!ids) return null;
  return ids
    .flatMap((id) => {
      const task = tasks[id];
      let generated = task.samples
        ? task.samples.map((display) => ({ display, teacherText: '' }))
        : baseFactory({
            ...skill,
            kind: task.kind || 'curriculum',
            title: task.title || skill.title,
          });
      if (['read', 'write'].includes(id)) {
        const targetSamples = /المقصورة/.test(skill.title)
          ? ['رَمَى', 'هُدَى', 'فَتَى', 'عَصَا', 'مَشَى']
          : /التاء المربوطة/.test(skill.title)
            ? ['مَدْرَسَةٌ', 'حَقِيبَةٌ', 'شَجَرَةٌ', 'وَرْدَةٌ', 'كُرَةٌ']
            : /التنوين/.test(skill.title)
              ? ['كِتَابٌ', 'قَلَمًا', 'بَيْتٍ', 'صَدِيقٌ', 'كُرَةٍ']
              : /المدود/.test(skill.title)
                ? ['بَابٌ', 'نُورٌ', 'فِيلٌ', 'سَاقٌ', 'حُوتٌ']
                : /السكون/.test(skill.title)
                  ? ['مَكْتَبٌ', 'مَسْجِدٌ', 'يَكْتُبُ', 'يَرْسُمُ', 'مَنْزِلٌ']
                  : null;
        if (targetSamples)
          generated = targetSamples.map((sample) => ({
            display: id === 'write' ? 'اكتب ما يمليه المعلم.' : sample,
            teacherText: id === 'write' ? sample : '',
            instruction:
              id === 'write'
                ? 'اكتب الكلمة التي يمليها المعلم.'
                : 'اقرأ الكلمة.',
            expected:
              id === 'write'
                ? 'يملي المعلم: ' +
                  sample +
                  '. كتابة الحروف والظاهرة المستهدفة صحيحًا دون رؤية الكلمة؛ لا يقيم جمال الخط.'
                : 'قراءة مستقلة صحيحة للكلمة؛ لا تطلب الكتابة أو التصنيف في هذا الحكم.',
          }));
      }
      return generated.map((card, i) => ({
        ...card,
        skillId: skill.id,
        skillTitle: skill.title,
        domain: skill.domain,
        source: skill.source,
        templateVersion: 3,
        facet: task.facet,
        taskId: id,
        instruction: task.instruction || card.instruction,
        expected: task.answers
          ? 'الإجابة: ' +
            task.answers[i] +
            '. تقبل إجابة مكافئة تحقق المهمة مستقلًا.'
          : task.criterion || card.expected,
      }));
    })
    .map((card, i) => ({ ...card, id: `${skill.id}-q${i + 1}` }));
}
