import { useState } from "react";
import { Icon } from "../components/Icon";
import { useToast } from "../toast/ToastProvider";
import { API_TEST_CASES, runApiTests, type ApiTestResult } from "./apiTests";

interface ApiTestRunnerProps {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export function ApiTestRunner({ baseUrl, apiKey, fetchImpl }: ApiTestRunnerProps) {
  const [results, setResults] = useState<ApiTestResult[]>([]);
  const [running, setRunning] = useState(false);
  const toast = useToast();

  async function run() {
    setRunning(true);
    setResults([]);
    const all = await runApiTests(baseUrl, apiKey, fetchImpl, API_TEST_CASES, (result) =>
      setResults((previous) => [...previous, result]),
    );
    setRunning(false);

    const failed = all.filter((r) => !r.passed);
    if (failed.length === 0) {
      toast.success(`All ${all.length} checks passed`, "The API behaves as documented.", { id: "api-tests" });
    } else if (failed.every((r) => r.unreachable)) {
      toast.error("Can't reach the API", failed[0]!.actual, { id: "api-tests" });
    } else {
      toast.error(
        `${failed.length} of ${all.length} checks failed`,
        "See the results list for what was expected and what the API returned.",
        { id: "api-tests" },
      );
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const done = !running && results.length > 0;

  return (
    <div className="test-runner">
      <div className="test-runner-bar">
        <button type="button" className="submit" onClick={run} disabled={running || !apiKey}>
          {running ? `Running ${results.length + 1} of ${API_TEST_CASES.length}…` : "Run API tests"}
        </button>
        {!apiKey && <span className="muted">Enter an API key in &ldquo;Try it&rdquo; to run the tests.</span>}
        {done && (
          <span className={passed === results.length ? "summary pass" : "summary fail"} data-testid="test-summary">
            {passed} of {results.length} passed
          </span>
        )}
      </div>

      {results.length > 0 && (
        <ol className="test-results">
          {results.map((r) => (
            <li key={r.name} className={r.passed ? "pass" : "fail"}>
              <Icon name={r.passed ? "check" : "x"} size={18} className="test-icon" />
              <span className="test-name">
                {r.name}
                <span className="sr-only">{r.passed ? " passed" : " failed"}</span>
              </span>
              <span className="test-detail">
                {r.passed ? r.expectation : `expected ${r.expectation}, got ${r.actual}`}
              </span>
              <span className="muted test-time">{r.durationMs} ms</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
