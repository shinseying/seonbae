// ---------------------------------------------------------------------------
// Per-subject hourly rates (KRW), transcribed from
// "Seonbae_Subject_Price_Estimation_Updated.docx".
//
// Pricing is set per SUBJECT, never per curriculum, so nothing in the UI should
// present a single "from" price for a whole curriculum. Every price shown on the
// site is read from this file.
//
// `curriculum` matches the slug of the matching entry in src/content/subjects.
// ---------------------------------------------------------------------------

export type CurriculumSlug =
  | 'ib-diploma'
  | 'advanced-placement'
  | 'a-level'
  | 'igcse'
  | 'standardized-tests'
  | 'english-writing';

export interface Rate {
  curriculum: CurriculumSlug;
  group: string;
  name: string;
  /** Korean label. Set only where the English name would not do on the KO site. */
  nameKo?: string;
  price: number; // KRW per hour
}

export const rates: Rate[] = [
  // ----- IB Diploma --------------------------------------------------------
  { curriculum: 'ib-diploma', group: 'Languages', name: 'English A: Literature HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'English A: Language and Literature HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Korean A: Literature HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Korean A: Language and Literature HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Literature and Performance SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Other Language A, school supported or self taught HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'English B HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Korean B HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Mandarin B or ab initio HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Spanish B or ab initio HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'French B or ab initio HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Languages', name: 'Japanese B or ab initio HL / SL', price: 80000 },

  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Economics HL / SL', price: 90000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Business Management HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'History HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Geography HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Psychology HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Global Politics HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Philosophy HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Digital Society HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Social and Cultural Anthropology HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'World Religions SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Humanities and social studies', name: 'Environmental Systems and Societies HL / SL', price: 80000 },

  { curriculum: 'ib-diploma', group: 'Sciences', name: 'Biology HL / SL', price: 100000 },
  { curriculum: 'ib-diploma', group: 'Sciences', name: 'Chemistry HL / SL', price: 100000 },
  { curriculum: 'ib-diploma', group: 'Sciences', name: 'Physics HL / SL', price: 100000 },
  { curriculum: 'ib-diploma', group: 'Sciences', name: 'Computer Science HL / SL', price: 100000 },
  { curriculum: 'ib-diploma', group: 'Arts', name: 'Design Technology HL / SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Arts', name: 'Sports, Exercise and Health Science HL / SL', price: 80000 },

  { curriculum: 'ib-diploma', group: 'Mathematics', name: 'Mathematics AA HL', price: 100000 },
  { curriculum: 'ib-diploma', group: 'Mathematics', name: 'Mathematics AA SL', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Mathematics', name: 'Mathematics AI HL', price: 90000 },
  { curriculum: 'ib-diploma', group: 'Mathematics', name: 'Mathematics AI SL', price: 80000 },

  { curriculum: 'ib-diploma', group: 'Core', name: 'EE supervision', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Core', name: 'TOK essay and exhibition', price: 80000 },
  { curriculum: 'ib-diploma', group: 'Core', name: 'IA coaching, any subject', price: 80000 },

  // ----- Advanced Placement ------------------------------------------------
  { curriculum: 'advanced-placement', group: 'Capstone', name: 'AP Seminar', price: 80000 },
  { curriculum: 'advanced-placement', group: 'Capstone', name: 'AP Research', price: 80000 },

  { curriculum: 'advanced-placement', group: 'Arts', name: 'AP Art History', price: 70000 },
  { curriculum: 'advanced-placement', group: 'Arts', name: 'AP Art and Design, Drawing, 2-D, 3-D', price: 70000 },
  { curriculum: 'advanced-placement', group: 'Arts', name: 'AP Music Theory', price: 70000 },

  { curriculum: 'advanced-placement', group: 'English', name: 'AP English Language and Composition', price: 80000 },
  { curriculum: 'advanced-placement', group: 'English', name: 'AP English Literature and Composition', price: 80000 },

  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP Comparative Government and Politics', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP European History', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP Human Geography', price: 70000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP Macroeconomics', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP Microeconomics', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP Psychology', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP United States Government and Politics', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP United States History', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP World History: Modern', price: 80000 },
  { curriculum: 'advanced-placement', group: 'History and social science', name: 'AP African American Studies', price: 80000 },

  { curriculum: 'advanced-placement', group: 'Mathematics and computer science', name: 'AP Calculus AB', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Mathematics and computer science', name: 'AP Calculus BC', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Mathematics and computer science', name: 'AP Precalculus', price: 80000 },
  { curriculum: 'advanced-placement', group: 'Mathematics and computer science', name: 'AP Statistics', price: 80000 },
  { curriculum: 'advanced-placement', group: 'Mathematics and computer science', name: 'AP Computer Science A, Java', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Mathematics and computer science', name: 'AP Computer Science Principles', price: 80000 },

  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Biology', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Chemistry', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Environmental Science', price: 80000 },
  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Physics 1, algebra based', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Physics 2, algebra based', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Physics C: Mechanics', price: 90000 },
  { curriculum: 'advanced-placement', group: 'Sciences', name: 'AP Physics C: Electricity and Magnetism', price: 90000 },

  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP Chinese Language and Culture', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP French Language and Culture', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP German Language and Culture', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP Italian Language and Culture', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP Japanese Language and Culture', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP Latin', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP Spanish Language and Culture', price: 60000 },
  { curriculum: 'advanced-placement', group: 'World languages', name: 'AP Spanish Literature and Culture', price: 60000 },

  { curriculum: 'advanced-placement', group: 'Business and technology', name: 'AP Business Principles and Personal Finance', price: 60000 },
  { curriculum: 'advanced-placement', group: 'Business and technology', name: 'AP Cybersecurity', price: 60000 },

  // ----- A Level -----------------------------------------------------------
  { curriculum: 'a-level', group: 'Mathematics', name: 'Mathematics', price: 90000 },
  { curriculum: 'a-level', group: 'Mathematics', name: 'Further Mathematics', price: 100000 },

  { curriculum: 'a-level', group: 'Sciences', name: 'Physics', price: 100000 },
  { curriculum: 'a-level', group: 'Sciences', name: 'Chemistry', price: 100000 },
  { curriculum: 'a-level', group: 'Sciences', name: 'Biology', price: 100000 },
  { curriculum: 'a-level', group: 'Sciences', name: 'Computer Science', price: 100000 },

  { curriculum: 'a-level', group: 'Business and social science', name: 'Psychology', price: 80000 },
  { curriculum: 'a-level', group: 'Business and social science', name: 'Economics', price: 90000 },
  { curriculum: 'a-level', group: 'Business and social science', name: 'Business', price: 80000 },
  { curriculum: 'a-level', group: 'Business and social science', name: 'Accounting', price: 80000 },
  { curriculum: 'a-level', group: 'Business and social science', name: 'Sociology', price: 80000 },

  { curriculum: 'a-level', group: 'Humanities and arts', name: 'English Language', price: 70000 },
  { curriculum: 'a-level', group: 'Humanities and arts', name: 'English Literature', price: 80000 },
  { curriculum: 'a-level', group: 'Humanities and arts', name: 'History', price: 80000 },
  { curriculum: 'a-level', group: 'Humanities and arts', name: 'Geography', price: 80000 },
  { curriculum: 'a-level', group: 'Humanities and arts', name: 'Art and Design', price: 80000 },

  // ----- IGCSE -------------------------------------------------------------
  { curriculum: 'igcse', group: 'Mathematics', name: 'Mathematics', price: 80000 },
  { curriculum: 'igcse', group: 'Mathematics', name: 'Additional Mathematics', price: 80000 },

  { curriculum: 'igcse', group: 'Sciences', name: 'Physics', price: 80000 },
  { curriculum: 'igcse', group: 'Sciences', name: 'Chemistry', price: 80000 },
  { curriculum: 'igcse', group: 'Sciences', name: 'Biology', price: 80000 },
  { curriculum: 'igcse', group: 'Sciences', name: 'Combined and Co-ordinated Sciences', price: 80000 },
  { curriculum: 'igcse', group: 'Sciences', name: 'Computer Science', price: 80000 },

  { curriculum: 'igcse', group: 'Business and social science', name: 'Economics', price: 70000 },
  { curriculum: 'igcse', group: 'Business and social science', name: 'Business Studies', price: 70000 },
  { curriculum: 'igcse', group: 'Business and social science', name: 'Accounting', price: 70000 },
  { curriculum: 'igcse', group: 'Business and social science', name: 'Geography', price: 70000 },
  { curriculum: 'igcse', group: 'Business and social science', name: 'History', price: 70000 },
  { curriculum: 'igcse', group: 'Business and social science', name: 'Global Perspectives', price: 70000 },
  { curriculum: 'igcse', group: 'Business and social science', name: 'Sociology', price: 70000 },

  { curriculum: 'igcse', group: 'Languages', name: 'English, First Language', price: 70000 },
  { curriculum: 'igcse', group: 'Languages', name: 'English as a Second Language', price: 70000 },
  { curriculum: 'igcse', group: 'Languages', name: 'English Literature', price: 70000 },
  { curriculum: 'igcse', group: 'Languages', name: 'Mandarin and Chinese', price: 70000 },
  { curriculum: 'igcse', group: 'Languages', name: 'Korean, first or foreign language', price: 70000 },
  { curriculum: 'igcse', group: 'Languages', name: 'Spanish and French', price: 70000 },

  { curriculum: 'igcse', group: 'Arts', name: 'Art and Design', price: 70000 },
  { curriculum: 'igcse', group: 'Arts', name: 'Music', price: 70000 },
  { curriculum: 'igcse', group: 'Arts', name: 'Drama', price: 70000 },

  // ----- Standardized tests ------------------------------------------------
  { curriculum: 'standardized-tests', group: 'SAT', name: 'SAT Reading and Writing', price: 90000 },
  { curriculum: 'standardized-tests', group: 'SAT', name: 'SAT Math', price: 80000 },

  { curriculum: 'standardized-tests', group: 'ACT', name: 'ACT Math and Science', price: 80000 },
  { curriculum: 'standardized-tests', group: 'ACT', name: 'ACT Reading', price: 100000 },
  { curriculum: 'standardized-tests', group: 'ACT', name: 'ACT Writing', price: 120000 },

  { curriculum: 'standardized-tests', group: 'English proficiency', name: 'IELTS', price: 70000 },
  { curriculum: 'standardized-tests', group: 'English proficiency', name: 'TOEFL', price: 70000 },

  // ----- English -----------------------------------------------------------
  { curriculum: 'english-writing', group: 'English', name: 'Beginner’s English, ESL', nameKo: '초급 영어', price: 60000 },
  { curriculum: 'english-writing', group: 'English', name: 'Academic English', nameKo: '학교 영어', price: 70000 },
  { curriculum: 'english-writing', group: 'English', name: 'Business English', nameKo: '직장 영어', price: 80000 },
];

/** Every rate for one curriculum, in the order written above. */
export const ratesFor = (slug: string): Rate[] => rates.filter((r) => r.curriculum === slug);

/** Rates for one curriculum, bucketed into their groups (order preserved). */
export const groupedRatesFor = (slug: string): { group: string; items: Rate[] }[] => {
  const out: { group: string; items: Rate[] }[] = [];
  for (const r of ratesFor(slug)) {
    const last = out[out.length - 1];
    if (last && last.group === r.group) last.items.push(r);
    else out.push({ group: r.group, items: [r] });
  }
  return out;
};

export const subjectCount = (slug: string): number => ratesFor(slug).length;

export const priceRange = (list: Rate[] = rates): { min: number; max: number } => ({
  min: Math.min(...list.map((r) => r.price)),
  max: Math.max(...list.map((r) => r.price)),
});

/** Distinct price points across the whole rate sheet, ascending. */
export const pricePoints = (): number[] => [...new Set(rates.map((r) => r.price))].sort((a, b) => a - b);
