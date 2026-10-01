# Prompts

I used Claude Code as a pair programmer. I decided what to build, pointed out what
was wrong, chose when there were options, and tested each step. These are the main
prompts, translated from Spanish and lightly edited.

## Building it

1. "Let's build a full-stack calculator: React with TypeScript for the frontend and Go for the backend, in one repo, with a local Postgres in Docker to save the history and a Dockerfile to run everything together. Keep it simple: Go's standard library for the API, and the calculator logic separate from the HTTP part so it's easy to test. Cover everything in the assignment, including the optional operations (power, square root and percentage), with unit tests for the key parts of both layers."

2. "The frontend should call the backend for every operation: one endpoint to calculate and one that lists the operations. Validate the input and handle edge cases like division by zero or invalid data, and always return JSON with a clear error message."

3. "Add a docs page in the same app that explains the API and lets you test it. Also protect the API with a simple API key, and don't leave the key in the browser."

4. "Handle every error with a clear message in English, shown as a toast. Then check the mobile version with the UI/UX skill: bigger buttons, and inputs that are easy to use on a phone."

5. "Write the README, only technical: setup instructions, how to run the frontend and backend, API examples and the design decisions. Add the coverage reports too."

## Fixing and improving it

6. "I can type letters in the number inputs. They should only accept numbers, also when pasting, and the backend still has to validate everything."

7. "On the docs page it's not clear what goes in the API key field, and one of the examples overflows its card on desktop. Fix both." (with screenshots)

8. "Here's the assignment again. Are we covering everything?"

9. "The calculator works, but I think the UI can be better. What would you improve?" After reading the proposals: "Do all of them, but don't overdo it, it's a simple task."

10. "Review the code: remove what's not needed and make it clean, readable and easy to understand." Then: "Explain each change to me step by step: what you did, why, and why not the other option."

11. "Can you make the UI look like this one? (screenshot of a classic desk calculator) Same features and same backend, maybe add a couple of things." Then, when asked: "Replace the current calculator, and skip the parentheses, they would need changes in the backend."

## How I checked it

- I tried each change in the browser and sent screenshots when something looked wrong.
- When there were options, I picked the simpler one: small UI improvements, one calculator instead of two, no parentheses. Correctness and clarity over extra features.
- Each change was checked with the Go and frontend tests, the Docker setup, and the browser on desktop and mobile.
