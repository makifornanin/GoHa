import type { InspirationContent, InspirationType } from "./providers";

/**
 * The content GoHa can always show, with no network at all.
 *
 * Small and curated on purpose. This is not a second pool competing with
 * `daily_quotes`; it is the floor under the feature, so that a provider being
 * down degrades the morning rather than breaking the page. Every line here is
 * either public domain (World English Bible) or a widely published attributed
 * quotation, and each is short enough to survive a phone notification whole.
 *
 * Scripture wording is WEB VERBATIM, each line checked against bible-api.com
 * rather than written from memory. That check mattered: an earlier draft of this
 * file had shortened Isaiah 40:31 and Joshua 1:9 to their opening clauses and
 * reworded another, which is exactly the invention BUILD_PLAN hard rule 6
 * forbids. Curly apostrophes are part of the WEB text and are kept.
 *
 * Larger than a token fallback needs to be, deliberately. QuoteGarden was
 * suspended (HTTP 503) as of 2026-08-27, so until it returns or is replaced the
 * quote half of this pool is not a fallback at all, it is the only source of
 * quotes; a pool of eight would visibly repeat inside the 30-day window.
 */

const QUOTES: InspirationContent[] = [
  { type: "quote", text: "Well begun is half done.", source: "Aristotle", provider: "goha_fallback" },
  {
    type: "quote",
    text: "It does not matter how slowly you go as long as you do not stop.",
    source: "Confucius",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    source: "Will Durant",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "The secret of getting ahead is getting started.",
    source: "Mark Twain",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "You have power over your mind, not outside events. Realize this, and you will find strength.",
    source: "Marcus Aurelius",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Little by little, one travels far.",
    source: "J. R. R. Tolkien",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Order your soul. Reduce your wants.",
    source: "Augustine",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.",
    source: "Antoine de Saint-Exupery",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "The journey of a thousand miles begins with one step.",
    source: "Lao Tzu",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Quality is not an act, it is a habit.",
    source: "Aristotle",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "He who has a why to live can bear almost any how.",
    source: "Friedrich Nietzsche",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "The best time to plant a tree was twenty years ago. The second best time is now.",
    source: "Chinese proverb",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.",
    source: "Stephen King",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Do the hard jobs first. The easy jobs will take care of themselves.",
    source: "Dale Carnegie",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "You do not rise to the level of your goals. You fall to the level of your systems.",
    source: "James Clear",
    provider: "goha_fallback",
  },
  {
    type: "quote",
    text: "Action is the foundational key to all success.",
    source: "Pablo Picasso",
    provider: "goha_fallback",
  },
];

const VERSES: InspirationContent[] = [
  {
    type: "bible_verse",
    text: "Commit your deeds to Yahweh, and your plans shall succeed.",
    source: "Proverbs 16:3",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "I can do all things through Christ, who strengthens me.",
    source: "Philippians 4:13",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Your word is a lamp to my feet, and a light for my path.",
    source: "Psalms 119:105",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "This is the day that Yahweh has made. We will rejoice and be glad in it!",
    source: "Psalms 118:24",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Let us not be weary in doing good, for we will reap in due season, if we don’t give up.",
    source: "Galatians 6:9",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "But those who wait for Yahweh will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.",
    source: "Isaiah 40:31",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Haven’t I commanded you? Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.",
    source: "Joshua 1:9",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Trust in Yahweh with all your heart, and don’t lean on your own understanding.",
    source: "Proverbs 3:5",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "In all your ways acknowledge him, and he will make your paths straight.",
    source: "Proverbs 3:6",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "For God didn’t give us a spirit of fear, but of power, love, and self-control.",
    source: "2 Timothy 1:7",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "The plans of the diligent surely lead to profit; and everyone who is hasty surely rushes to poverty.",
    source: "Proverbs 21:5",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Whatever your hand finds to do, do it with your might; for there is no work, nor plan, nor knowledge, nor wisdom, in Sheol, where you are going.",
    source: "Ecclesiastes 9:10",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Therefore, my beloved brothers, be steadfast, immovable, always abounding in the Lord’s work, because you know that your labor is not in vain in the Lord.",
    source: "1 Corinthians 15:58",
    translation: "WEB",
    provider: "goha_fallback",
  },
  {
    type: "bible_verse",
    text: "Yahweh is my shepherd: I shall lack nothing.",
    source: "Psalms 23:1",
    translation: "WEB",
    provider: "goha_fallback",
  },
];

export const FALLBACK_POOL: Readonly<Record<InspirationType, readonly InspirationContent[]>> = {
  quote: QUOTES,
  bible_verse: VERSES,
};

/**
 * Pick fallback content of the requested kind, preferring something the user
 * has not just seen.
 *
 * `recentTexts` is honoured when it can be, and ignored when the whole pool is
 * recent: showing a repeat is a far better outcome than showing nothing, and
 * this path only runs when the provider has already failed.
 */
export function pickFallback(
  type: InspirationType,
  recentTexts: readonly string[] = [],
  random: () => number = Math.random,
): InspirationContent {
  const pool = FALLBACK_POOL[type];
  const recent = new Set(recentTexts);
  const fresh = pool.filter((item) => !recent.has(item.text));
  const usable = fresh.length > 0 ? fresh : pool;
  // Guard the index rather than trusting `random()` to stay inside [0, 1).
  const index = Math.min(usable.length - 1, Math.max(0, Math.floor(random() * usable.length)));
  return usable[index];
}
