import { afterEach, assert, describe, it, vi } from "@effect/vitest";

import * as HostProcess from "./HostProcess.ts";

describe("HostProcess", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects libc without the report's network section", () => {
    const report = process.report as NodeJS.ProcessReport & { excludeNetwork: boolean };
    report.excludeNetwork = false;
    let excludedDuringReport: boolean | undefined;
    vi.spyOn(report, "getReport").mockImplementation(() => {
      excludedDuringReport = report.excludeNetwork;
      return { header: { glibcVersionRuntime: "2.40" } };
    });

    assert.equal(HostProcess.LinuxLibc.defaultValue(), "gnu");
    assert.isTrue(excludedDuringReport);
    assert.isFalse(report.excludeNetwork);
  });
});
