import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrolling, which the app uses on navigation.
window.scrollTo = () => {};
