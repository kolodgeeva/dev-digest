/** Constants for the conventions extractor. */

/** How many top-ranked source files the code-only sampler gathers as the pool. */
export const CONVENTION_SAMPLE_SIZE = 12;

/** Max files the model is asked to read in full (bounds the step-2 prompt + cost). */
export const CONVENTION_READ_LIMIT = 6;
