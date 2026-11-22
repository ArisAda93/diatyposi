/**
 * Strings for the home hero (Hero.astro). The headline, the intro paragraph and the descriptor are
 * the owner's wording (src/data/site.ts); everything here is new copy for the owner's review
 * (CONTENT_REVIEW.md).
 */
export const heroText = {
  el: {
    /** Small word beside the animated scroll cue at the foot of the hero (shown in capitals). */
    scrollCue: 'Κύλιση',
    /**
     * New copy for owner review: the quiet link under the hero's actions, to the company page
     * (/etaireia/). Moved here with the owner's intro, which the hero now carries.
     */
    aboutLink: 'Γνωρίστε μας',
  },
} as const;
