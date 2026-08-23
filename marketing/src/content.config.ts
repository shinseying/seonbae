import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const accent = z.enum(['mint', 'lavender', 'butter', 'violet']);

// Curriculum / subject groups shown across the site.
const subjects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/subjects' }),
  schema: z.object({
    title: z.string(),
    number: z.string(),
    summary: z.string(),
    levels: z.array(z.string()),
    accent,
    order: z.number(),
    featured: z.boolean().default(false),
    priceFrom: z.number(), // KRW per hour
    tutorCount: z.number().default(0),
    topics: z.array(z.string()),
    idealLearner: z.string(),
  }),
});


// Editorial learning resources.
const resources = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/resources' }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    date: z.coerce.date(),
    category: z.enum(['Study Skills', 'Subject Help', 'Test Prep', 'Parent Guides', 'Getting Started']),
    excerpt: z.string(),
    readingTime: z.number().default(5),
    accent,
    featured: z.boolean().default(false),
  }),
});


// Two ways to work with Seonbae. Rates are per subject, per hour.
const plans = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/plans' }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    priceFrom: z.number(), // KRW per hour
    billingMonthly: z.string(),
    billingLesson: z.string(),
    features: z.array(z.string()),
    ctaLabel: z.string(),
    ctaHref: z.string(),
    accent,
    order: z.number(),
    featured: z.boolean().default(false),
    wide: z.boolean().default(false),
  }),
});

export const collections = { subjects, resources, plans };
