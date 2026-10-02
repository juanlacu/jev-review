// Review policy: thresholds, limits, file patterns, and the vocabulary of
// concerns the reviewer screens for. Pure data; no imports.

// Screening signals at or above this probability are followed up.
export const SCREEN_THRESHOLD = 0.7;
// Severity is scored on a 0–3 rubric; the dashboard mirrors this ceiling.
export const SEVERITY_MAX = 3;
// Findings at or above this severity are routed to a reviewer.
export const ROUTE_SEVERITY = 1.5;
// Findings at or above this severity request changes instead of a comment.
export const BLOCKING_SEVERITY = 2;
// Minimum confidence for an evidence-hunk selection to count.
export const MIN_LOCATION_CONFIDENCE = 0.55;

export const MAX_FOLLOW_UPS = 8;
// Test-gap signals get their own, smaller budget so they never crowd out
// defect signals; a repository without tests raises one in every file.
export const MAX_TEST_GAP_FOLLOW_UPS = 1;
// A followed signal is asked again for a distinct issue until it finds none.
export const MAX_FINDINGS_PER_SIGNAL = 3;
export const MAX_PROFILES = 5;
export const CONCURRENCY = 3;

export const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
export const TEST_FILE = /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/;

export const dimensions = {
  correctness: "The code likely contains incorrect runtime behavior.",
  security: "The code introduces or weakens a security boundary.",
  reliability: "The code can cause a crash, race, leak, deadlock, or poor failure recovery.",
  compatibility: "The code can break a caller, persisted format, protocol, or public behavior.",
  testGap: "Important behavior lacks adequate targeted test evidence.",
} as const;

export type Dimension = keyof typeof dimensions;

export const dimensionMetadata: Array<{ key: Dimension; label: string; short: string }> = [
  { key: "correctness", label: "Correctness", short: "Corr" },
  { key: "security", label: "Security", short: "Sec" },
  { key: "reliability", label: "Reliability", short: "Rel" },
  { key: "compatibility", label: "Compatibility", short: "Compat" },
  { key: "testGap", label: "Test gap", short: "Tests" },
];

export const mechanisms = {
  correctness: {
    condition: "A condition handles the wrong cases",
    state: "State is read, updated, or retained incorrectly",
    dataFlow: "Data is transformed or passed incorrectly",
    asyncControl: "Asynchronous ordering or error handling is incorrect",
    other: "Another concrete correctness mechanism",
    noIssue: "The selected evidence does not support a concrete correctness issue",
  },
  security: {
    authorization: "Authorization or trust boundaries are weakened",
    injection: "Untrusted input can reach an unsafe interpreter or sink",
    exposure: "Sensitive data can be disclosed",
    unsafeDefault: "A default configuration creates avoidable exposure",
    other: "Another concrete security mechanism",
    noIssue: "The selected evidence does not support a concrete security issue",
  },
  reliability: {
    cleanup: "A resource or side effect is not cleaned up",
    concurrency: "Concurrency can race, deadlock, or lose work",
    recovery: "Failure or cancellation recovery is incomplete",
    crash: "A realistic path can throw or terminate unexpectedly",
    other: "Another concrete reliability mechanism",
    noIssue: "The selected evidence does not support a concrete reliability issue",
  },
  compatibility: {
    api: "A public API or type contract changes incompatibly",
    behavior: "Existing callers observe changed behavior",
    dataFormat: "A persisted or exchanged format changes incompatibly",
    protocol: "An external command or protocol contract changes",
    other: "Another concrete compatibility mechanism",
    noIssue: "The selected evidence does not support a concrete compatibility issue",
  },
  testGap: {
    branch: "An important branch lacks targeted coverage",
    failure: "A failure or cancellation path lacks coverage",
    boundary: "A boundary or edge case lacks coverage",
    integration: "An interaction between components lacks coverage",
    other: "Another concrete test gap",
    noIssue: "The selected evidence does not support a concrete test gap",
  },
} as const satisfies Record<Dimension, Record<string, string>>;

// A second, finer level under each mechanism. The selected description is the
// finding's explanation, so each one reads as a complete diagnosis.
export const patterns = {
  correctness: {
    condition: {
      boundaryOperator: "A comparison uses the wrong boundary operator (> vs >=, < vs <=), so the limit case is handled incorrectly",
      inverted: "A condition is negated or checks the opposite of the intended case",
      missingCase: "A case the condition should handle is left out",
      inconsistentThreshold: "The same rule is checked with a different threshold than elsewhere in the code",
      other: "Another condition error",
    },
    state: {
      staleRead: "Logic reads a state snapshot that can be stale instead of the latest value",
      lostUpdate: "An update overwrites or drops a previous or concurrent change",
      notUpdated: "Dependent state is not updated after the change",
      other: "Another state error",
    },
    dataFlow: {
      wrongRange: "A range, slice, or index starts or ends at the wrong position (off-by-one)",
      wrongValue: "The wrong variable, field, or argument is used",
      wrongCalculation: "A calculation produces the wrong amount, rate, or unit",
      lostValue: "A value is dropped, defaulted, or overwritten along the way",
      other: "Another data-flow error",
    },
    asyncControl: {
      missingAwait: "A promise is not awaited or its result is not used",
      wrongOrder: "Operations can complete in an unintended order",
      swallowedError: "An error is caught and ignored or reported as success",
      other: "Another asynchronous control error",
    },
    other: { other: "A concrete correctness error not covered by the other patterns" },
  },
  security: {
    authorization: {
      missingCheck: "A permission or ownership check is missing",
      bypass: "A check can be skipped through another path or input",
      other: "Another authorization weakness",
    },
    injection: {
      query: "Untrusted input reaches a database query without parameterization",
      command: "Untrusted input reaches a shell command, eval, or dynamic import",
      markup: "Untrusted input is rendered as HTML without escaping (XSS)",
      path: "Untrusted input reaches a file path (path traversal)",
      other: "Another injection sink",
    },
    exposure: {
      secret: "A secret or credential is logged, committed, or sent to the client",
      personalData: "Personal or sensitive data is returned or logged unnecessarily",
      other: "Another data exposure",
    },
    unsafeDefault: {
      permissive: "A default allows broader access than needed",
      disabledProtection: "A protection such as validation, TLS, CSRF, or rate limiting is turned off",
      other: "Another unsafe default",
    },
    other: { other: "A concrete security weakness not covered by the other patterns" },
  },
  reliability: {
    cleanup: {
      leak: "A listener, timer, handle, or connection is never released",
      partialFailure: "Cleanup is skipped when an earlier step fails",
      other: "Another cleanup problem",
    },
    concurrency: {
      race: "Two operations can interleave and corrupt or lose data",
      deadlock: "Work can wait forever on a lock or another task",
      other: "Another concurrency problem",
    },
    recovery: {
      noRetry: "A transient failure is not retried or recovered",
      inconsistentState: "A failure leaves partially applied state behind",
      other: "Another recovery problem",
    },
    crash: {
      nullAccess: "A value can be null or undefined when it is accessed",
      unhandledThrow: "A thrown error is not handled on a realistic path",
      invalidInput: "An unexpected input shape causes a runtime error",
      other: "Another crash path",
    },
    other: { other: "A concrete reliability problem not covered by the other patterns" },
  },
  compatibility: {
    api: {
      removedOrRenamed: "An exported name, field, or parameter is removed or renamed",
      signatureChange: "A parameter, return type, or default value changes",
      other: "Another API contract change",
    },
    behavior: {
      changedResult: "Existing callers receive a different result for the same input",
      changedSideEffect: "Side effects, ordering, or timing that callers relied on change",
      other: "Another observable behavior change",
    },
    dataFormat: {
      schemaChange: "A stored or exchanged shape changes without a migration",
      meaningChange: "A stored value changes meaning or units",
      other: "Another data format change",
    },
    protocol: {
      requestShape: "A request, route, or command interface changes",
      responseShape: "A response, status code, or event shape changes",
      other: "Another protocol change",
    },
    other: { other: "A concrete compatibility break not covered by the other patterns" },
  },
  testGap: {
    branch: {
      newBranch: "A newly added branch or condition has no test",
      changedBranch: "A modified branch has no test asserting the new behavior",
      other: "Another untested branch",
    },
    failure: {
      errorPath: "An error or rejection path has no test",
      cancellation: "A cancellation or timeout path has no test",
      other: "Another untested failure path",
    },
    boundary: {
      limitValue: "Values at or around a limit (0, 1, the maximum, a threshold) are untested",
      emptyInput: "Empty, missing, or null input is untested",
      other: "Another untested edge case",
    },
    integration: {
      callerContract: "The interaction between the changed code and its callers is untested",
      externalSystem: "The interaction with storage, network, or another service is untested",
      other: "Another untested interaction",
    },
    other: { other: "A concrete test gap not covered by the other patterns" },
  },
} as const satisfies {
  [D in Dimension]: { [M in Exclude<keyof (typeof mechanisms)[D], "noIssue">]: Record<string, string> };
};

export const reviewPriorityRubric = [
  "Routine review is sufficient",
  "A focused review of the changed behavior is useful",
  "Careful review is needed before merge",
  "Specialist or immediate review is needed",
] as const;

export const severityRubric = [
  "No meaningful impact or no supported issue",
  "Minor or narrowly limited impact",
  "Significant correctness, reliability, compatibility, or security impact",
  "Critical security, data-loss, or widespread outage impact",
] as const;

export const owners = {
  security: "Security, authentication, authorization, or data exposure",
  api: "Public APIs, compatibility, schemas, or protocols",
  runtime: "Execution, concurrency, resources, or failure recovery",
  testing: "Coverage strategy, fixtures, or regression testing",
  maintainer: "The owning domain or feature maintainer",
} as const;
